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

/** One figure's structures, what else it has drawn, and the compounds' numbers by its structures. */
export type FigureStructures = { structures: PageStructure[]; marks: PageMarks; labels: CompoundLabel[] };

/** What a figure's reading is given: the page's things and letters, its figures, which one this is, and the figure as the reader drew it - its JSON as bytes, as it comes, for the worker to unpack. */
export type FigureJob = {
  objects: PageObject[];
  text: Pick<PageText, "codes" | "boxes"> | null;
  figures: Box[];
  k: number;
  drawn: ArrayBuffer | FigureDrawn;
  sha256: string;
  page: number;
};

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

/** The figure a reader's answer holds: its JSON as bytes - unpacked here, where it is read - or already as it is. */
export function drawnOf(given: ArrayBuffer | FigureDrawn): FigureDrawn {
  return given instanceof ArrayBuffer ? (JSON.parse(new TextDecoder().decode(given)) as FigureDrawn) : given;
}

/** Figure `k` of a page read: its structures, its marks, its compounds' numbers. */
export function figureRead(job: FigureJob): FigureStructures {
  const drawn = drawnOf(job.drawn);
  const read = pageStructuresOf({ objects: job.objects, wordsIn: (b) => wordsInBox(job.text, b) }, job.figures, (j) => (j === job.k ? drawn : null), job.sha256, job.page);
  return { structures: read.structures, marks: read.marks[0] ?? { segments: [], points: [], boxes: [] }, labels: read.labels };
}
