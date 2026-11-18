/**
 * A picture of a drawing read by Meno's own figure reader (docs/PDF.md,
 * *A picture traced*): traced (./trace), its shapes laid where the picture
 * lies - on a PDF's page, in points, or in its own pixels - and read as a
 * PDF's figure is read, its letters traced too, or given where a PDF writes
 * them over the picture; ink read as nothing beside the structure said. Pure:
 * the app reads pictures so in a worker, and the round trip in Node.
 */
import type { Box, FigureDrawn, FigureLetter } from "./drawn";
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
  const t = tracePicture(pixels, drop, known);
  if ("none" in t) return t;
  measured?.({ line: t.line, bond: t.bond, shaded: t.shaded });
  const shapes = onPage(t.shapes, at.scale, at.x, at.y);
  const read = readFigure({ paths: [], letters: [...letters], pictures: [] }, reads, known, shapes);
  if (!read.atoms.length || !read.bonds.length) return { none: "No structure was found in the picture." };
  // (ink beside the structure read as nothing: the atom nearest it said)
  for (const [i, said] of unreadInk(read, shapes, known)) read.atoms[i].unsure = [...(read.atoms[i].unsure ?? []), said];
  // (a small piece of carbons alone, no label in it: said - a number or a letter traced may read so - never left out)
  for (const { atoms, apart } of tinyPieces(read)) for (const i of atoms) read.atoms[i].unsure = [...(read.atoms[i].unsure ?? []), apart ? APART_SAID : TINY_SAID];
  // (a carbon between two single bonds in line: a skeleton draws carbons in line only on a triple bond or cumulated double bonds - one
  //  bond traced broken in two reads so)
  for (const i of inLineCarbons(read)) read.atoms[i].unsure = [...(read.atoms[i].unsure ?? []), IN_LINE_SAID];
  return read;
}

/** How near straight two single bonds at a carbon may be before it is said (`inLineCarbons`): within ten degrees of a line. */
export const IN_LINE_BONDS = (10 * Math.PI) / 180;
export const IN_LINE_SAID = "Its two bonds lie in line: one bond may have been read as two.";

/**
 * The carbons of a read - no label - with exactly two bonds, both single, lying in line within `IN_LINE_BONDS`: a skeletal drawing sets
 * carbons in line only on a triple bond or cumulated double bonds (ethyne, a nitrile, an allene, a cumulene), so such a carbon is a bond
 * traced as two.
 */
export function inLineCarbons(read: Pick<FigureRead, "atoms" | "bonds">): number[] {
  const at = read.atoms.map((): FigureRead["bonds"] => []);
  for (const b of read.bonds) for (const e of [b.a, b.b]) at[e].push(b);
  return read.atoms.flatMap((a, i) => {
    if (a.label || (a.el && a.el !== "C") || at[i].length !== 2 || at[i].some((b) => b.order !== 1)) return [];
    const [p, q] = at[i].map((b) => read.atoms[b.a === i ? b.b : b.a]);
    const turn = Math.abs(Math.atan2((p.x - a.x) * (q.y - a.y) - (p.y - a.y) * (q.x - a.x), (p.x - a.x) * (q.x - a.x) + (p.y - a.y) * (q.y - a.y)));
    return Math.PI - turn <= IN_LINE_BONDS ? [i] : [];
  });
}

/**
 * A piece of a picture read - atoms joined by bonds - of this many atoms or fewer is said where all of it is carbons with no label: a
 * compound's number or a letter traced may read as such bonds (a 1 or a 7 as a line, a % as a few); and where it holds such a carbon and
 * lies beside a larger piece: a group whose bond to the structure was not read (an OH with a stray carbon, a tert-butyl with its CH-OH).
 * Never left out: a cyclohexane or a hexane drawn alone is such a piece, and comes through said. Inferred from made pictures (docs/PDF.md,
 * *A picture traced*).
 */
export const TINY_PIECE = 6;
export const TINY_SAID = "A small piece of carbons alone: it may be a number or letters read as bonds.";
export const APART_SAID = "A small piece apart from the structure: it may be part of it, its bond not read.";

/** The pieces of a read that are `TINY_PIECE`'s: each its atoms, and whether it is said for lying beside a larger piece. */
export function tinyPieces(read: Pick<FigureRead, "atoms" | "bonds">): { atoms: number[]; apart: boolean }[] {
  const up = read.atoms.map((_, i) => i);
  const root = (i: number): number => (up[i] === i ? i : (up[i] = root(up[i])));
  for (const b of read.bonds) up[root(b.a)] = root(b.b);
  const pieces = new Map<number, number[]>();
  read.atoms.forEach((_, i) => (pieces.get(root(i)) ?? pieces.set(root(i), []).get(root(i))!).push(i));
  const bare = (i: number) => !read.atoms[i].label && (!read.atoms[i].el || read.atoms[i].el === "C");
  const all = [...pieces.values()];
  const larger = all.some((p) => p.length > TINY_PIECE);
  return all.flatMap((p): { atoms: number[]; apart: boolean }[] => {
    if (p.length > TINY_PIECE || !p.some(bare)) return [];
    if (p.every(bare)) return [{ atoms: p, apart: false }];
    return larger ? [{ atoms: p, apart: true }] : [];
  });
}

/**
 * How finely a figure that is a picture is drawn to be traced where the PDF does not say how its picture is stored - as Meno's own
 * picture reader was measured (docs/PDF.md, *A picture traced*) - and at the most.
 */
export const PICTURE_DPI = 300;
export const PICTURE_DPI_MOST = 600;

/**
 * How finely a box of a page holding pictures is drawn to be traced, in dots an inch: as finely as the picture covering most of it is
 * stored - never finer, which would only enlarge its pixels, and hide that it is drawn too small to read - and at most `most`; where the
 * PDF does not say, `otherwise`. A picture's resolution, however it is turned: the square root of its pixels over its area, in inches.
 */
export function pictureDpi(drawn: Pick<FigureDrawn, "pictures" | "pixels">, box: Box, otherwise: number, most: number): number {
  let [best, dpi] = [0, otherwise];
  drawn.pictures.forEach((p, i) => {
    const px = drawn.pixels?.[i];
    const cover = Math.max(0, Math.min(p[2], box[2]) - Math.max(p[0], box[0])) * Math.max(0, Math.min(p[3], box[3]) - Math.max(p[1], box[1]));
    const inches = ((p[2] - p[0]) / 72) * ((p[3] - p[1]) / 72);
    if (!px || cover <= best || inches <= 0) return;
    [best, dpi] = [cover, Math.sqrt((px[0] * px[1]) / inches)];
  });
  return Math.min(dpi, most);
}
