/**
 * Structures read from figures and pictures, as *Read as structure* reads
 * them (docs/PDF.md, *Stage 5*): a figure in a box of a PDF's page - its
 * lines read by Meno, or, where it is a picture, the picture traced and read
 * by Meno in a worker (./pictureOff), the plugin chosen to read pictures
 * offered by name where Meno reads nothing - and a picture on the page. Kept
 * apart from ./figures, which the workers' own code imports: a worker cannot
 * start another of its kind.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Box, FigureDrawn } from "../../../../lib/figure/drawn";
import type { FigureRead } from "../../../../lib/figure/read";
import { pictureFigure, scaledFigure } from "../../../../lib/figure/picture";
import { fitToPicture } from "../../../../lib/figure/inkFit";
import { boxPicture } from "../../../../lib/pdf/reader";
import { chemWorker, roleChosen, rolePlugin } from "../../../../lib/roles/worker";
import { ChemTimeout, type ChemClient } from "../../../../lib/roles/client";
import { toBase64 } from "../../../../lib/clipboard";
import { PICTURE_DPI, PICTURE_DPI_MOST, pictureDpi } from "../../../../lib/figure/tracedRead";
import type { FigureSpot, PictureItem } from "../store/types";
import { picturePng, pngPixels } from "./pictures";
import { pngBuffer } from "./pngPixels";
import { systemGlyphs } from "./glyphShapes";
import { pictureReadOff } from "./pictureOff";
import { figureFrom, modelOf, pictureResult, type FigureResult, type Unread } from "./figures";

/**
 * A figure within a box of a PDF's page, read as a structure: its atoms
 * where the figure has them - its middle at naught, a bond as long as Meno
 * draws one - each tied to where it was drawn; or why it gave none.
 */
export async function readBox(sha256: string, page: number, box: Box, working?: (what: string) => void, by?: "plugin"): Promise<FigureResult | Unread> {
  if (!isTauri()) return { none: "Figures are read in the app." };
  const drawn = await invoke<FigureDrawn>("pdf_figure", { sha: sha256, page, box });
  if (by === "plugin") return readBoxPicture(sha256, page, box);
  const read = figureFrom(drawn, sha256, page);
  // (a figure that is a picture: the picture read by Meno, traced - the PDF's letters over it read as written; where Meno reads
  // nothing, the plugin chosen to read pictures offered by name, never run unasked)
  if ("none" in read && drawn.pictures.length) {
    working?.("Reading the picture…");
    const shot = await boxPicture(sha256, page, box, pictureDpi(drawn, box, PICTURE_DPI, PICTURE_DPI_MOST));
    // (a pixel is 72/dpi of a point, from the box's top left as the reader drew it: whole pixels)
    const k = 72 / shot.dpi;
    const at = { scale: k, x: Math.floor(box[0] / k) * k, y: Math.floor(box[1] / k) * k };
    return withPluginOffered(await ownPicture(shot.png, at, drawn.letters, (x, y, bond) => ({ sha256, page, x, y, bond })));
  }
  return read;
}


/**
 * A picture read by Meno's own reader from its PNG, in a worker (pictureOff.ts) - decoded and traced there, never on the thread the drawing
 * runs on: its structure, each atom tied to its place - `spot` - or why none.
 * A structure with an atom with more bonds than it takes is left out and said, as a figure's is; what is left must hold a bond: a
 * lone atom is no structure read (the ring of a charge, read as an O, once its structure is left out).
 */
async function ownPicture(png: Uint8Array, at: { scale: number; x: number; y: number }, letters: FigureDrawn["letters"], spot: (x: number, y: number, bond: number) => FigureSpot): Promise<FigureResult | Unread> {
  const read = await pictureReadOff({ png: pngBuffer(png), at, known: systemGlyphs(), letters: [...letters] });
  if ("none" in read) return read;
  return pictureResult(read, (x, y) => spot(x, y, read.bond));
}

/** Where Meno read nothing from a picture: the plugin chosen to read pictures, by name, to offer - none where none is chosen. */
function withPluginOffered(read: FigureResult | Unread): FigureResult | Unread {
  if (!("none" in read)) return read;
  const plugin = roleChosen("pictures");
  return plugin ? { ...read, plugin: plugin.name } : read;
}

/** How finely a figure that is a picture is drawn to be read: enough for its letters, more than a picture's reader looks at. */
const READ_DPI = 200;
/** How long the first picture a worker reads may take: it loads the plugin's model first - a minute or more, the first time a computer loads it. */
export const FIRST_READ_MS = 300_000;
/**
 * How long a picture may take once the worker has read one, its model
 * loaded: a picture is read in seconds, the slowest in half a minute; one
 * taking longer is not going to end, and its worker is started afresh for
 * the next (lib/plugins/queue).
 */
export const READ_MS = 90_000;
/** The workers that have read a picture: their model loaded. One started afresh is another, and loads its model again. */
const loaded = new WeakSet<ChemClient>();

/** A picture read by the plugin that reads structures from pictures, laid on the picture: what it read, in the picture's pixels; or why nothing came of it. */
async function readByPlugin(bytes: Uint8Array): Promise<FigureRead | Unread> {
  const worker = await chemWorker("pictures");
  try {
    const answer = await worker.request("read_picture", { picture: toBase64(bytes) }, loaded.has(worker) ? READ_MS : FIRST_READ_MS);
    loaded.add(worker);
    const fitted = fitToPicture(answer, await pngPixels(bytes), rolePlugin("pictures")?.roleUnsure.pictures);
    return pictureFigure(fitted) ?? { none: "No structure was found in the picture." };
  } catch (e) {
    if (e instanceof ChemTimeout) return { none: "Reading the picture took too long, so nothing was read from it." };
    throw e;
  }
}

/** A box of a PDF's page drawn as a picture and read by the plugin that reads pictures, each atom tied to its place on the page: asked for, where Meno read nothing. */
async function readBoxPicture(sha256: string, page: number, box: Box): Promise<FigureResult | Unread> {
  const shot = await boxPicture(sha256, page, box, READ_DPI);
  const read = await readByPlugin(shot.png);
  if ("none" in read) return read;
  // (its pixels made the page's points: a pixel is 72/dpi of a point, from the box's top left)
  const k = 72 / shot.dpi;
  const onPage = scaledFigure(read, k, box[0], box[1]);
  return { model: modelOf(onPage, (x, y) => ({ sha256, page, x, y, bond: onPage.bond })) };
}

/**
 * A picture on the page read, each atom tied to its place in the picture, in its pixels: by Meno, traced - or, `by` the plugin that
 * reads pictures, where Meno read nothing and the chemist asks for it.
 */
export async function readPicture(picture: Pick<PictureItem, "sha256" | "media">, by?: "plugin"): Promise<FigureResult | Unread> {
  if (!isTauri()) return { none: "Pictures are read in the app." };
  const png = await picturePng(picture);
  if (!png) return { none: "A film is not read as a structure." };
  if (by !== "plugin") return withPluginOffered(await ownPicture(png, { scale: 1, x: 0, y: 0 }, [], (x, y, bond) => ({ sha256: picture.sha256, x, y, bond })));
  const read = await readByPlugin(png);
  if ("none" in read) return read;
  return { model: modelOf(read, (x, y) => ({ sha256: picture.sha256, x, y, bond: read.bond })) };
}

