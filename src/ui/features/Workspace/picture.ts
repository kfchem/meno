/**
 * Pictures of a structure for the clipboard, each carrying Meno's record of
 * it so that the structure comes back when the picture is pasted into Meno:
 *
 * - an EMF - vectors, at the style's own size; molecules in 3D a bitmap in
 *   it, drawn as the canvas draws them (./render3d) - in Office's own clip
 *   format,
 *   which Word and PowerPoint keep as it is on either system and hand back
 *   when the picture is copied again (lib/office/gvml); the record in a
 *   comment of the EMF;
 * - the same EMF on its own, for Windows' other programs;
 * - on Windows, an object for Office to embed, showing that EMF, which a
 *   double-click opens in Meno (made from the record and the EMF by the
 *   app: src-tauri/src/ole.rs);
 * - a PNG for everything else, at the resolution Settings says (Files,
 *   *Copied pictures*: 600 dpi unless changed), the record in a text chunk;
 * - the same picture as a DIB, for Windows' programs that take only a bitmap.
 *
 * Where Meno serves its objects (Windows, installed), the app hands over the
 * object in place of the clip format and the PNG: Word and PowerPoint take
 * either of those before an object, and an object is what opens in Meno.
 */
import { seenDrawing, seenOnly } from "./utils/stacks";
import { clipboardTakes, type ClipItem, type Flavor } from "../../../lib/clipboard";
import { cfbStreams } from "../../../lib/binary/cfb";
import { dibOf } from "../../../lib/binary/dib";
import { textOf, withDpi, withText } from "../../../lib/binary/png";
import { emfComments, layoutEmf, type SolidsPicture } from "../../../lib/chem/emf";
import { createSVG } from "../../../lib/chem/layout2d";
import { currentStyle3D } from "./style3d";
import type { DrawingStyle } from "../../../lib/chem/style";
import { gvmlImages, gvmlPicture } from "../../../lib/office/gvml";
import { drawingLayout } from "./fileActions";
import type { Drawn, EditorState } from "./store/types";
import { readRecord, recordText } from "./utils/copyPaste";
import { withSolidsImage } from "./render3d";
import { useAppSettings } from "../../../lib/settings/appSettings";

/** What marks Meno's record in an EMF's comment, and names it in a PNG. */
const EMF_MARK = "MENO";
const PNG_KEY = "meno-structure";
/** The most pixels a copied picture is made of: past it, its resolution is lowered to fit (a canvas has its limits). */
const MOST_PIXELS = 48_000_000;

/** The resolution copied pictures are made at, as Settings says. */
const pictureDpi = () => useAppSettings.getState().pictures.dpi;

/** The longest side of a canvas a picture is drawn on, in pixels: what WebView2 (Chromium) and Firefox draw at most. */
const MOST_SIDE = 32_767;

/**
 * The resolution a picture `width` by `height` CSS pixels is made at:
 * `dpi`, or lower where that would come to more than `MOST_PIXELS`, or a
 * side longer than `MOST_SIDE` - a line of words thousands of letters long,
 * kept at full resolution, was a canvas too wide to draw, and its PNG was
 * left off the clipboard.
 */
export function pictureDpiFor(width: number, height: number, dpi: number): number {
  const area = Math.max(width, 1) * Math.max(height, 1) * (dpi / 96) ** 2;
  const byArea = area <= MOST_PIXELS ? dpi : Math.floor(dpi * Math.sqrt(MOST_PIXELS / area));
  const bySide = Math.floor((MOST_SIDE * 96) / Math.max(width, height, 1));
  return Math.max(1, Math.min(byArea, bySide));
}

const utf8 = new TextEncoder();

type Aromatic = Pick<EditorState, "aromaticEnabled" | "aromaticRings">;

/**
 * Meno's record of `part` and the EMF of it that carries the record - what a
 * copy puts in Office's clip format, and what a document holding the
 * structure as an object keeps and shows. A reaction's arrows and "+" signs
 * are in both; molecules in 3D are a bitmap in the EMF, where there is a page
 * to draw one in.
 */
export async function structurePicture(part: Drawn, aromatic: Aromatic, style: DrawingStyle, dpi = pictureDpi()) {
  const record = recordText(part);
  // (the picture, of a stack, the one it shows - of a stack of drawings, the record; the record, all of it: utils/stacks)
  const drawing = seenDrawing(part);
  const seen = drawing.molecules3d ? { ...drawing, molecules3d: seenOnly(drawing.molecules3d) } : drawing;
  const { layout, opts } = drawingLayout(seen, aromatic, style);
  // (the layout then draws them so too, for the PNG)
  let solids: SolidsPicture | null = null;
  try {
    solids = withSolidsImage(seen.molecules3d ?? [], layout, currentStyle3D(), dpi);
  } catch {
    solids = null;
  }
  return { record, layout, opts, ...layoutEmf(layout, opts, utf8.encode(EMF_MARK + record), solids ?? undefined) };
}

/**
 * The pictures of `part` that go on the clipboard with it: those this
 * platform's clipboard takes (lib/clipboard's clipboardTakes), none made for
 * nothing.
 */
export async function pictureItems(
  part: Drawn,
  aromatic: Aromatic,
  style: DrawingStyle,
  platformTakes?: Set<Flavor> | null,
  dpi = pictureDpi(),
): Promise<ClipItem[]> {
  const takes = platformTakes === undefined ? await clipboardTakes() : platformTakes;
  const wanted = (f: ClipItem["flavor"]) => !takes || takes.has(f);
  const { record, layout, opts, emf, widthPt, heightPt } = await structurePicture(part, aromatic, style, dpi);
  const items: ClipItem[] = [
    { flavor: "gvml", bytes: gvmlPicture(emf, "emf", widthPt, heightPt, "Structure") },
    { flavor: "emf", bytes: emf },
    // (made into an object for Office from this and the EMF, on Windows)
    { flavor: "embed", text: record },
  ].filter((i) => wanted(i.flavor as ClipItem["flavor"])) as ClipItem[];
  if (wanted("png") || wanted("dib")) {
    const raster = await rasterized(createSVG(layout, opts), dpi, wanted("dib")).catch(() => null);
    if (raster && wanted("png")) items.push({ flavor: "png", bytes: withText(withDpi(raster.png, raster.dpi), PNG_KEY, record) });
    if (raster?.dib && wanted("dib")) items.push({ flavor: "dib", bytes: raster.dib });
  }
  return items;
}

/** The structure a picture on the clipboard carries, if it carries one. */
export async function structureInPicture(item: ClipItem): Promise<Drawn | null> {
  if (!item.bytes) return null;
  if (item.flavor === "png") return fromPng(item.bytes);
  if (item.flavor === "object") return fromObject(item.bytes);
  if (item.flavor !== "gvml") return null;
  for (const { name, data } of await gvmlImages(item.bytes)) {
    const found = /\.emf$/i.test(name) ? fromEmf(data) : /\.png$/i.test(name) ? fromPng(data) : null;
    if (found) return found;
  }
  return null;
}

function fromEmf(emf: Uint8Array): Drawn | null {
  const decoder = new TextDecoder();
  for (const c of emfComments(emf)) {
    const text = decoder.decode(c);
    if (text.startsWith(EMF_MARK)) return readRecord(text.slice(EMF_MARK.length));
  }
  return null;
}

/**
 * An object Meno served for Office (src-tauri/src/ole.rs), as Word or
 * PowerPoint for Mac hand it over: its storage keeps the record in a stream
 * of its own ("Meno"), and the picture it shows, which carries the record
 * too ("MenoPicture").
 */
function fromObject(storage: Uint8Array): Drawn | null {
  const streams = cfbStreams(storage);
  const own = streams?.get("/Meno");
  const record = own ? readRecord(new TextDecoder().decode(own)) : null;
  if (record) return record;
  const picture = streams?.get("/MenoPicture");
  return picture ? fromEmf(picture) : null;
}

function fromPng(png: Uint8Array): Drawn | null {
  const text = textOf(png, PNG_KEY);
  return text ? readRecord(text) : null;
}

/**
 * An SVG drawn at `dpi` - its pixels CSS pixels, 96 to the inch - or lower
 * where it is large (`pictureDpiFor`): as a PNG, and - `dib` asked for - as
 * a DIB for Windows' bitmap-only programs, and the resolution it was drawn
 * at; null where there is no page to draw it in.
 */
async function rasterized(
  svg: string,
  wantedDpi: number,
  dib: boolean,
): Promise<{ png: Uint8Array; dib: Uint8Array | null; dpi: number } | null> {
  if (typeof document === "undefined") return null;
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const dpi = pictureDpiFor(img.naturalWidth, img.naturalHeight, wantedDpi);
    const scale = dpi / 96;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.ceil(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"));
    if (!blob) return null;
    return {
      png: new Uint8Array(await blob.arrayBuffer()),
      dib: dib ? dibOf(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, dpi) : null,
      dpi,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
