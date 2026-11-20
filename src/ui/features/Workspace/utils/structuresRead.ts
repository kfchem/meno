/**
 * One figure of a PDF's page read as structures (docs/PDF.md, *In the
 * column, as built*): what `pageStructuresOf` makes of it, from plain data
 * alone - the page's things, its letters, the figure as the reader drew it -
 * so that it can be done in a worker (structuresWorker.ts), off the thread
 * the drawing runs on, a figure taking up to seconds.
 */
import type { Box, FigureDrawn } from "../../../../lib/figure/drawn";
import type { PageObject } from "../../../../lib/pdf/figures";
import type { PageText } from "../../../../lib/pdf/text";
import { pageStructuresOf, type CompoundLabel, type PageMarks, type PageStructure } from "./pageStructures";
import type { GlyphShape } from "../../../../lib/figure/glyphs";
import { PICTURE_DPI, PICTURE_DPI_MOST, pictureDpi, type PictureAt } from "../../../../lib/figure/tracedRead";
import { pictureRead } from "./tracedPicture";

/**
 * One figure's structures, what else it has drawn, and the compounds' numbers by its structures - and, a figure that is a picture
 * whose lines gave none, how finely to draw it to be traced (`picture`, in dots an inch): asked for again with its pixels.
 */
export type FigureStructures = { structures: PageStructure[]; marks: PageMarks; labels: CompoundLabel[]; picture?: { dpi: number } };


/** What a figure's reading is given: the page's things and letters, its figures, which one this is, and the figure as the reader drew it - its JSON as bytes, as it comes, for the worker to unpack. */
export type FigureJob = {
  objects: PageObject[];
  text: Pick<PageText, "codes" | "boxes" | "bold"> | null;
  figures: Box[];
  k: number;
  drawn: ArrayBuffer | FigureDrawn;
  sha256: string;
  page: number;
  /** A figure that is a picture: its box drawn (RGBA, row by row), where its pixels lie on the page, and the system's letters. */
  picture?: { width: number; height: number; data: ArrayBuffer; at: PictureAt; known: GlyphShape[] };
};
/** A figure's reading as asked of a worker: a picture's box as the reader drew it, its PNG - decoded there (./pngPixels), never on the thread the drawing runs on. */
export type FigurePngJob = Omit<FigureJob, "picture"> & { picture?: Omit<NonNullable<FigureJob["picture"]>, "width" | "height" | "data"> & { png: ArrayBuffer } };

/** The words a box of a page holds, as its letters say. */
export function wordsInBox(t: Pick<PageText, "codes" | "boxes"> | null, box: Box): string {
  if (!t) return "";
  let out = "";
  for (let i = 0; i < t.codes.length; i++) {
    const [a, b, c, d] = [t.boxes[i * 4], t.boxes[i * 4 + 1], t.boxes[i * 4 + 2], t.boxes[i * 4 + 3]];
    if (c > a && (a + c) / 2 >= box[0] && (a + c) / 2 <= box[2] && (b + d) / 2 >= box[1] && (b + d) / 2 <= box[3]) out += String.fromCodePoint(t.codes[i]);
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Whether the letters a box of a page holds are set bold - every one with a box, and one at least - as their font says. */
export function boldInBox(t: Pick<PageText, "codes" | "boxes" | "bold"> | null, box: Box): boolean {
  if (!t?.bold) return false;
  let any = false;
  for (let i = 0; i < t.codes.length; i++) {
    const [a, b, c, d] = [t.boxes[i * 4], t.boxes[i * 4 + 1], t.boxes[i * 4 + 2], t.boxes[i * 4 + 3]];
    if (!(c > a) || (a + c) / 2 < box[0] || (a + c) / 2 > box[2] || (b + d) / 2 < box[1] || (b + d) / 2 > box[3]) continue;
    if (!t.bold[i]) return false;
    any = true;
  }
  return any;
}

/** The figure a reader's answer holds: its JSON as bytes - unpacked here, where it is read - or already as it is. */
export function drawnOf(given: ArrayBuffer | FigureDrawn): FigureDrawn {
  return given instanceof ArrayBuffer ? (JSON.parse(new TextDecoder().decode(given)) as FigureDrawn) : given;
}

/** Figure `k` of a page read: its structures, its marks, its compounds' numbers. */
export function figureRead(job: FigureJob): FigureStructures {
  const drawn = drawnOf(job.drawn);
  // (a picture, drawn: traced and read - the PDF's letters over it read as written)
  const p = job.picture;
  const traced = p ? pictureRead({ width: p.width, height: p.height, data: p.data, at: p.at, known: p.known, letters: drawn.letters }) : null;
  const tracedRead = traced && !("none" in traced) ? traced : null;
  const read = pageStructuresOf({ objects: job.objects, wordsIn: (b) => wordsInBox(job.text, b), boldIn: (b) => boldInBox(job.text, b) }, job.figures, (j) => (j === job.k ? drawn : null), job.sha256, job.page, undefined, (j) => (j === job.k ? tracedRead : null));
  // (a figure that is a picture, its lines giving nothing: to be drawn and asked for again - once)
  const picture = !p && !read.structures.length && drawn.pictures.length ? { dpi: pictureDpi(drawn, job.figures[job.k], PICTURE_DPI, PICTURE_DPI_MOST) } : undefined;
  return { structures: read.structures, marks: read.marks[0] ?? { segments: [], points: [], boxes: [] }, labels: read.labels, ...(picture ? { picture } : {}) };
}
