/**
 * A picture read by Meno's own figure reader, from plain data alone - its
 * pixels, where they lie, the system's letters - so that it can be done in a
 * worker (pictureWorker.ts), off the thread the drawing runs on: tracing a
 * picture takes up to a second (docs/PDF.md, *A picture traced*).
 */
import type { FigureLetter } from "../../../../lib/figure/drawn";
import type { GlyphShape } from "../../../../lib/figure/glyphs";
import type { FigureRead } from "../../../../lib/figure/read";
import { readTracedPicture, type PictureAt } from "../../../../lib/figure/tracedRead";
import { readDrawnLabel } from "../../../../lib/figure/structure";
import { figureLabels } from "./figures";

/** What a picture's reading is given: its pixels (RGBA, row by row), where they lie, the system's letters, a PDF's letters over it. */
export type PictureJob = { width: number; height: number; data: ArrayBuffer; at: PictureAt; known: GlyphShape[]; letters: FigureLetter[] };

/** A picture read: its figure, or why none. */
export function pictureRead(job: PictureJob): FigureRead | { none: string } {
  const pixels = { width: job.width, height: job.height, data: new Uint8ClampedArray(job.data) };
  return readTracedPicture(pixels, job.at, job.known, (l) => readDrawnLabel(l, figureLabels).read, job.letters);
}
