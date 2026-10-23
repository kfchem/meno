/**
 * The structures a PDF's page is picked by (docs/PDF.md, *Structures picked
 * from a PDF*): each figure drawn with lines read as a scheme is (./figures
 * `schemeDrawn`), and every structure in it - one of its atoms and the
 * atoms bonded to it, on and on - taken as one: where it lies on the page,
 * its bonds and its own labels, so that the pointer finds it as it finds a
 * word; and what it reads as, ready to be put down, or why it is not read
 * whole. An arrow, a "+" and words are never a structure's: they are no
 * atom of it.
 */
import type { Box, FigureDrawn, FigureLetter } from "../../../../lib/figure/drawn";
import type { FigureRead } from "../../../../lib/figure/read";
import type { GlyphShape } from "../../../../lib/figure/glyphs";
import type { Model } from "../store/types";
import { modelOf, schemeDrawn, type FigureResult, type Unread } from "./figures";

type Point = { x: number; y: number };

/** One structure drawn on a page: where it lies - its bonds, its atoms and its labels, in the page's points from its top left - how near the pointer must come to take it, and what it reads as, or why not. */
export type PageStructure = {
  /** Which it is on its page: its figure's place among the page's figures, and its own among that figure's. */
  key: string;
  bonds: [Point, Point][];
  atoms: Point[];
  labels: Box[];
  /** A box round all of it. */
  box: Box;
  /** How near the pointer must come to a bond or a label to take it: a third of a bond as the figure draws one. */
  reach: number;
  /** What it reads as - its middle at naught, a bond as long as Meno draws one - or why it is not read whole. */
  read: FigureResult | Unread;
};

/** How near the pointer must come to a structure's bond or label to take it, in bonds as drawn: a third - closer than to the next structure, or a "+" between them. */
const REACH = 1 / 3;

/** Something on the page outside a structure's own figure - words, or lines - and what its words say, where they are words. */
export type Beside = { box: Box; text?: string };

/** How far a segment lies from a box: naught where it crosses it. */
function segmentToBox(a: Point, b: Point, box: Box): number {
  const [x0, y0, x1, y1] = box;
  const inside = (p: Point) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
  if (inside(a) || inside(b)) return 0;
  const corners: Point[] = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const cross = (p: Point, q: Point, r: Point, t: Point) => {
    const d = (u: Point, v: Point, w: Point) => (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x);
    return d(p, q, r) * d(p, q, t) < 0 && d(r, t, p) * d(r, t, q) < 0;
  };
  if (corners.some((c, k) => cross(a, b, c, corners[(k + 1) % 4]))) return 0;
  return Math.min(toBox(a, box), toBox(b, box), ...corners.map((c) => toSegment(c, a, b)));
}

/** How far a box lies from another: naught where they meet. */
const boxToBox = (p: Box, q: Box) => Math.hypot(Math.max(q[0] - p[2], 0, p[0] - q[2]), Math.max(q[1] - p[3], 0, p[1] - q[3]));

/** What else a figure has drawn that is no structure's - its arrows, "+" signs and words - where the pointer finds nothing to take. */
export type PageMarks = { segments: [Point, Point][]; points: Point[]; boxes: Box[] };

/** How far from a structure a lone labelled atom - an ion beside it, Na+ by an acetate - may be and still be its, in bonds as drawn. */
const LONE_JOINS = 1.6;

const dist = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y);

/** How far a point lies from a segment. */
export function toSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** How far a point lies from a box: naught inside it. */
function toBox(p: Point, [x0, y0, x1, y1]: Box): number {
  return Math.hypot(Math.max(x0 - p.x, 0, p.x - x1), Math.max(y0 - p.y, 0, p.y - y1));
}

/** The box round points and boxes. */
function boxRound(points: readonly Point[], boxes: readonly Box[]): Box {
  const xs = [...points.map((p) => p.x), ...boxes.flatMap((b) => [b[0], b[2]])];
  const ys = [...points.map((p) => p.y), ...boxes.flatMap((b) => [b[1], b[3]])];
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** The atoms of a figure read, in its structures: each atom's structure's place, by atom - lone labelled atoms near one joining it. */
function structuresIn(f: FigureRead): number[][] {
  const up = f.atoms.map((_, i) => i);
  const top = (i: number): number => (up[i] === i ? i : (up[i] = top(up[i])));
  for (const b of f.bonds) up[top(b.a)] = top(b.b);
  const bonded = new Set(f.bonds.flatMap((b) => [b.a, b.b]));
  const groups = new Map<number, number[]>();
  f.atoms.forEach((_, i) => {
    if (!bonded.has(i)) return;
    const r = top(i);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  });
  const found = [...groups.values()];
  // (a lone atom with a label - an ion, a lone metal - with the structure it lies by, or on its own)
  f.atoms.forEach((a, i) => {
    if (bonded.has(i) || !a.label) return;
    let best: number[] | null = null;
    let near = LONE_JOINS * f.bond;
    for (const g of found) {
      const d = Math.min(...g.map((j) => dist(a, f.atoms[j])));
      if (d <= near) [best, near] = [g, d];
    }
    if (best) best.push(i);
    else found.push([i]);
  });
  return found.map((g) => g.sort((p, q) => p - q));
}

/** Letters of `left` - those no atom of the figure took - that lie within a structure: in its box, and within a bond of one of its bonds. */
function lettersWithin(left: readonly Pick<FigureLetter, "c" | "box">[], bonds: readonly [Point, Point][], box: Box, reach: number): string {
  return left
    .filter((l) => {
      const mid = { x: (l.box[0] + l.box[2]) / 2, y: (l.box[1] + l.box[3]) / 2 };
      return toBox(mid, box) === 0 && bonds.some(([a, b]) => toSegment(mid, a, b) < reach);
    })
    .map((l) => l.c)
    .join("");
}

/**
 * The structures of one figure of a page, drawn as `given` within it (in the
 * page's points): each where it lies on the page, and what it reads as - or
 * why not, where part of it is not read (letters lying within it that no
 * atom took, or words or lines of the page outside its figure, `beside`,
 * lying within a bond of it). A figure that reads as too much for a
 * structure (a chart, a spectrum) has none.
 */
export function structuresOf(given: FigureDrawn, figure: number, sha256: string, page: number, known?: readonly GlyphShape[], beside: readonly Beside[] = []): PageStructure[] {
  return figureOn(given, figure, sha256, page, known, beside).structures;
}

/** A box turned back to where it lies on the page. */
const boxBack = (b: Box, back: (p: Point) => Point): Box => {
  const [p, q] = [back({ x: b[0], y: b[1] }), back({ x: b[2], y: b[3] })];
  return [Math.min(p.x, q.x), Math.min(p.y, q.y), Math.max(p.x, q.x), Math.max(p.y, q.y)];
};

/** One figure of a page: its structures (`structuresOf`), and what else it has drawn - its arrows, "+" signs and words - where the pointer takes none. */
export function figureOn(given: FigureDrawn, figure: number, sha256: string, page: number, known?: readonly GlyphShape[], beside: readonly Beside[] = []): { structures: PageStructure[]; marks: PageMarks } {
  const { back, read } = schemeDrawn(given, known);
  if (read.tooMany) return { structures: [], marks: { segments: [], points: [], boxes: [] } };
  const marks: PageMarks = {
    segments: read.arrows.flatMap((a) => {
      const path = [a.tail, ...a.corners, a.point].map(back);
      return path.slice(1).map((p, i): [Point, Point] => [path[i], p]);
    }),
    points: read.pluses.map(back),
    boxes: read.words.map((w) => boxBack(w.box, back)),
  };
  // (what was drawn as words, by the letters of each: words lying within a structure are part of it not read)
  const words = read.words.map((w) => ({ c: w.text, box: w.box }));
  return { structures: structuresHere(read.figure, back, figure, sha256, page, words).map((st) => besideChecked(st, beside, read.figure.bond)), marks };
}

/** The structures of a figure read - each refused where letters of the figure no atom took, or words it read, lie within it. */
function structuresHere(f: FigureRead, back: (p: Point) => Point, figure: number, sha256: string, page: number, words: readonly Pick<FigureLetter, "c" | "box">[]): PageStructure[] {
  return structuresIn(f).map((ids, k): PageStructure => {
    const at = new Map(ids.map((i, j) => [i, j]));
    const atoms = ids.map((i) => back(f.atoms[i]));
    const mine = f.bonds.filter((b) => at.has(b.a));
    const bonds = mine.map((b): [Point, Point] => [back(f.atoms[b.a]), back(f.atoms[b.b])]);
    const labels = ids.flatMap((i): Box[] => {
      const b = f.atoms[i].box;
      return f.atoms[i].label && b ? [boxBack(b, back)] : [];
    });
    const box = boxRound(atoms, labels);
    const reach = f.bond * REACH;
    // (its own reading: its atoms and bonds alone, its middle at naught, each atom tied to where it lies on the page)
    const part: FigureRead = { atoms: ids.map((i) => f.atoms[i]), bonds: mine.map((b) => ({ ...b, a: at.get(b.a)!, b: at.get(b.b)! })), bond: f.bond, left: { letters: [] } };
    const mid = { x: (Math.min(...part.atoms.map((a) => a.x)) + Math.max(...part.atoms.map((a) => a.x))) / 2, y: (Math.min(...part.atoms.map((a) => a.y)) + Math.max(...part.atoms.map((a) => a.y))) / 2 };
    const within = lettersWithin([...f.left.letters, ...words].map((l) => ({ c: l.c, box: boxBack(l.box, back) })), bonds, box, f.bond);
    const model: Model | null = within ? null : modelOf(part, (x, y) => ({ sha256, page, ...back({ x, y }), bond: f.bond }), mid);
    return {
      key: `${figure}:${k}`,
      bonds,
      atoms,
      labels,
      box,
      reach,
      read: model ? { model } : { none: `Part of this structure could not be read ("${within}"), so none of it is taken.` },
    };
  });
}

/**
 * A structure refused where anything on the page outside its own figure -
 * words, or lines - lies within a bond of its atoms, its bonds or its
 * labels: the page's figures may have been cut through it there (a label
 * wider than a figure's word between its two halves), and the rest of it
 * be in another figure. Never half a molecule: refused, the words named.
 */
function besideChecked(st: PageStructure, beside: readonly Beside[], bond: number): PageStructure {
  if ("none" in st.read) return st;
  const near = beside.find((b) => boxToBox(b.box, st.box) <= bond && (st.atoms.some((a) => toBox(a, b.box) <= bond) || st.labels.some((l) => boxToBox(l, b.box) <= bond) || st.bonds.some(([a, c]) => segmentToBox(a, c, b.box) <= bond)));
  if (!near) return st;
  const what = near.text?.trim() ? `"${near.text.trim()}" lies beside it` : "lines drawn beside it lie outside its figure";
  return { ...st, read: { none: `Part of this structure could not be read (${what}), so none of it is taken.` } };
}

/**
 * The structure on a page the pointer is over, at `x`, `y` in the page's
 * points: the nearest whose bonds, atoms or labels lie within its reach -
 * so a point between two is the nearer's, never both - and none where an
 * arrow, a "+" or words of `marks` lie nearer still.
 */
export function structureAt(structures: readonly PageStructure[], x: number, y: number, marks?: PageMarks): PageStructure | null {
  const p = { x, y };
  let best: PageStructure | null = null;
  let near = Infinity;
  for (const s of structures) {
    if (toBox(p, s.box) > s.reach) continue;
    const d = Math.min(...s.bonds.map(([a, b]) => toSegment(p, a, b)), ...s.labels.map((b) => toBox(p, b)), ...s.atoms.map((a) => dist(p, a)));
    if (d <= s.reach && d < near) [best, near] = [s, d];
  }
  // (nearer an arrow, a "+" or words than to it: on those, not on the structure)
  if (best && marks) {
    const other = Math.min(Infinity, ...marks.segments.map(([a, b]) => toSegment(p, a, b)), ...marks.points.map((q) => dist(p, q)), ...marks.boxes.map((b) => toBox(p, b)));
    if (other < near) return null;
  }
  return best;
}
