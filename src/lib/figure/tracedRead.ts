/**
 * A picture of a drawing read by Meno's own figure reader (docs/PDF.md,
 * *A picture traced*): traced (./trace), its shapes laid where the picture
 * lies - on a PDF's page, in points, or in its own pixels - and read as a
 * PDF's figure is read, its letters traced too, or given where a PDF writes
 * them over the picture; ink read as nothing beside the structure said. Pure:
 * the app reads pictures so in a worker, and the round trip in Node.
 */
import type { Box, FigureLetter } from "./drawn";
import type { GlyphShape } from "./glyphs";
import type { Pixels } from "./inkFit";
import { readFigure, type FigureRead } from "./read";
import { onPage, tracePicture, unreadInk } from "./trace";

/** Where the picture's pixels lie: a pixel is `scale` of the place's units, its top left at `x`, `y` there. */
export type PictureAt = { scale: number; x: number; y: number };

/** Why a picture gave no structure: what to say. */
export type PictureUnread = { none: string };

/**
 * A picture read as a figure, its atoms where it has them in `at`'s units; or why none. `letters`: a PDF's letters over it, in those
 * units - read as written, their ink left out of the tracing; `known`: the system's letters, which its own are matched against;
 * `reads`: whether a label is one the reader reads; `measured`, told how the picture draws it in its pixels (its line, its bond, how
 * much of it is shaded) where it was traced.
 */
export function readTracedPicture(
  pixels: Pixels,
  at: PictureAt,
  known: readonly GlyphShape[],
  reads: (label: string) => boolean,
  letters: readonly FigureLetter[] = [],
  measured?: (m: { line: number; bond: number; shaded: number }) => void,
): FigureRead | PictureUnread {
  // (where the given letters lie, in the picture's pixels)
  const drop = letters.map((l) => [(l.box[0] - at.x) / at.scale, (l.box[1] - at.y) / at.scale, (l.box[2] - at.x) / at.scale, (l.box[3] - at.y) / at.scale] as Box);
  const t = tracePicture(pixels, drop);
  if ("none" in t) return t;
  measured?.({ line: t.line, bond: t.bond, shaded: t.shaded });
  const shapes = onPage(t.shapes, at.scale, at.x, at.y);
  const read = readFigure({ paths: [], letters: [...letters], pictures: [] }, reads, known, shapes);
  if (!read.atoms.length || !read.bonds.length) return { none: "No structure was found in the picture." };
  // (ink beside the structure read as nothing: the atom nearest it said)
  for (const [i, said] of unreadInk(read, shapes, known)) read.atoms[i].unsure = [...(read.atoms[i].unsure ?? []), said];
  return read;
}
