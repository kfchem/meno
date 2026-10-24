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
import type { PageObject } from "../../../../lib/pdf/figures";
import type { FigureRead } from "../../../../lib/figure/read";
import type { GlyphShape } from "../../../../lib/figure/glyphs";
import type { Model } from "../store/types";
import { readDrawnLabel } from "../../../../lib/figure/structure";
import { figureLabels, modelOf, schemeDrawn, type FigureResult, type Unread } from "./figures";

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
  /** Its bonds' open ends: atoms of one bond, with no label - where a label not read would be set. */
  ends: Point[];
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

/** How much further than its reach a press takes a structure: within half a bond of its bonds, atoms and labels, before words beside it - a scheme's conditions, a line of text - are pressed. */
export const PRESS_WIDENED = 1.5;

/** What else a figure has drawn that is no structure's - its arrows, "+" signs and words - where the pointer finds nothing to take. */
export type PageMarks = { segments: [Point, Point][]; points: Point[]; boxes: Box[] };

/** How far from a structure a lone labelled atom - an ion beside it, Na+ by an acetate - may be and still be its, in bonds as drawn. */
const LONE_JOINS = 1.6;
/** How far an ion set level with the atom of a structure nearest it - a salt's counter-ion beside it in a row, NMe4+ Br- - may be, in bonds. */
const ION_ROW = 3;

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

/** An atom's charge as a figure read has it: its label's, and one drawn by it in a ring. */
function chargeOf(a: FigureRead["atoms"][number]): number {
  const label = a.label ? readDrawnLabel(a.label, figureLabels) : null;
  return (label?.read ? (label.charge ?? 0) : 0) + (a.marked ?? 0);
}

/** Whether segments p-q and r-s cross. */
function crosses(p: Point, q: Point, r: Point, s: Point): boolean {
  const side = (a: Point, b: Point, c: Point) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  return side(p, q, r) * side(p, q, s) < 0 && side(r, s, p) * side(r, s, q) < 0;
}

/** What of a scheme lies between its structures, in the figure read's own points: its arrows' pieces, and its "+" signs. */
export type Apart = { segments: readonly [Point, Point][]; pluses: readonly Point[] };

/**
 * The atoms of a figure read, in its structures: each atom's structure's place, by atom - none that is one line with no label,
 * nor a lone labelled atom by no structure. A lone labelled atom is the structure's it lies by, within LONE_JOINS bonds (an ion
 * level with the atom nearest it, ION_ROW), with no arrow nor "+" between them (`apart`): an ion (Na+, Cl-) where the ions so
 * by it make it neutral - the structure carrying
 * their charge the other way, an ammonium's Cl-, a carboxylate's Na+ - and else its own: never a neutral molecule's, nor
 * across a scheme.
 */
function structuresIn(f: FigureRead, apart: Apart = { segments: [], pluses: [] }): number[][] {
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
  // (nothing of the scheme between two points: no arrow's piece across the way, no "+" within half a bond of it)
  const clear = (p: Point, q: Point) => !apart.segments.some(([r, s]) => crosses(p, q, r, s)) && !apart.pluses.some((c) => toSegment(c, p, q) < 0.5 * f.bond);
  // (each lone labelled atom by the structure nearest it, the way clear; those by each, nearest first)
  const by = new Map<number[], { i: number; d: number }[]>();
  const alone: number[] = [];
  // (the box round the figure's bonds: a lone label within it, or as near a structure as it may be its, may be an ion of its
  // own; one further out - a word of a caption or a table, "Na+" - is words, as any other is)
  const xs = [...bonded].map((i) => f.atoms[i].x);
  const ys = [...bonded].map((i) => f.atoms[i].y);
  const lengths = f.bonds.map((b) => dist(f.atoms[b.a], f.atoms[b.b])).sort((p, q) => p - q);
  const between = lengths.length ? lengths[Math.floor(lengths.length / 2)] : f.bond;
  const drawn = (p: Point) => xs.length > 0 && p.x >= Math.min(...xs) && p.x <= Math.max(...xs) && p.y >= Math.min(...ys) && p.y <= Math.max(...ys);
  f.atoms.forEach((a, i) => {
    if (bonded.has(i) || !a.label) return;
    let best: number[] | null = null;
    let near = Infinity;
    let candidate = drawn(a);
    // (an ion set level with the atom nearest it, a salt's counter-ion in a row with it, as far as ION_ROW bonds - bonds from atom
    // to atom, as all of them drawn short to labels are longer than their lines)
    const ion = chargeOf(a) !== 0;
    for (const g of found) {
      const j = g.reduce((m, k) => (dist(a, f.atoms[k]) < dist(a, f.atoms[m]) ? k : m), g[0]);
      const d = dist(a, f.atoms[j]);
      const reach = ion && Math.abs(a.y - f.atoms[j].y) <= 0.5 * f.bond ? ION_ROW * Math.max(f.bond, between) : LONE_JOINS * f.bond;
      if (d > reach) continue;
      candidate = true;
      if (d < near && clear(a, f.atoms[j])) [best, near] = [g, d];
    }
    if (best) by.set(best, [...(by.get(best) ?? []), { i, d: near }]);
    else if (candidate) alone.push(i);
  });
  // (taken nearest first while each brings its charge the structure's way back to naught - neutral, or none taken)
  for (const [g, near] of by) {
    let left = g.reduce((t, i) => t + chargeOf(f.atoms[i]), 0);
    const taken: number[] = [];
    for (const { i } of near.sort((p, q) => p.d - q.d)) {
      const c = chargeOf(f.atoms[i]);
      // (a label with no charge - a lone metal - its, as it lies by it)
      if (!c) g.push(i);
      else if (Math.sign(c) === -Math.sign(left) && Math.abs(c) <= Math.abs(left)) {
        taken.push(i);
        left += c;
      } else alone.push(i);
    }
    if (left === 0) g.push(...taken);
    else alone.push(...taken);
  }
  // (an ion by a structure taken by none is its own; any other lone label is words, not a structure: a "DP4+" in a figure, a lone H)
  for (const i of alone) if (chargeOf(f.atoms[i])) found.push([i]);
  // (nor is one line with no label at either end: a chart's tick, a table's rule, a bracket's piece - no structure is that)
  const bondsOf = (g: number[]) => f.bonds.filter((b) => g.includes(b.a)).length;
  return found.filter((g) => bondsOf(g) > 1 || g.some((i) => f.atoms[i].label)).map((g) => g.sort((p, q) => p - q));
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
export function structuresOf(given: FigureDrawn, figure: number, sha256: string, page: number, beside: readonly Beside[], known?: readonly GlyphShape[]): PageStructure[] {
  return figureOn(given, figure, sha256, page, beside, known).structures;
}

/** Whether a box's middle lies within another: what of a page is a figure's own - its labels, though their boxes pass its edge - and not what is set between two figures, most of it outside. */
export function centreWithin(b: Box, f: Box): boolean {
  const cx = (b[0] + b[2]) / 2;
  const cy = (b[1] + b[3]) / 2;
  return cx >= f[0] && cx <= f[2] && cy >= f[1] && cy <= f[3];
}

/** What a page is made of, as `pageStructuresOf` is given it: each thing's kind and box (lib/pdf/figures `PageObject`), and the words a box of it holds, where words are known. */
export type PageMade = { objects: readonly PageObject[]; wordsIn?: (box: Box) => string };

/**
 * Every structure on a page: each figure of it (`figures`, as lib/pdf/figures
 * finds them) drawn as `drawnOf` gives it, read with all on the page that
 * lies outside that figure beside it - so a structure the figures cut in two
 * is refused, never read in half - and what else each figure has drawn.
 */
export function pageStructuresOf(made: PageMade, figures: readonly Box[], drawnOf: (k: number) => FigureDrawn | null, sha256: string, page: number, known?: readonly GlyphShape[]): { structures: PageStructure[]; marks: PageMarks[] } {
  const structures: PageStructure[] = [];
  const marks: PageMarks[] = [];
  figures.forEach((box, k) => {
    const drawn = drawnOf(k);
    if (!drawn) return;
    // (all of the page whose middle is not within this figure - its own labels' boxes, a letter's full height, may pass its edge a
    // little; a label set between two figures, reaching into both, is neither's - its words named, where they are known)
    const beside = made.objects.filter((o) => !centreWithin(o.box, box)).map((o): Beside => ({ box: o.box, ...(o.kind === "text" && made.wordsIn ? { text: made.wordsIn(o.box) } : {}) }));
    const read = figureOn(drawn, k, sha256, page, beside, known);
    // (and the words of the page within this figure that are none of a structure's labels, at one of its open ends: a label
    // its figure's drawing did not hold, the structure refused - a compound's number aside)
    const own = made.objects.filter((o) => o.kind === "text" && centreWithin(o.box, box));
    structures.push(...read.structures.map((st) => endWordsChecked(st, own, made.wordsIn)));
    marks.push(read.marks);
  });
  return { structures, marks };
}

/** A box turned back to where it lies on the page. */
const boxBack = (b: Box, back: (p: Point) => Point): Box => {
  const [p, q] = [back({ x: b[0], y: b[1] }), back({ x: b[2], y: b[3] })];
  return [Math.min(p.x, q.x), Math.min(p.y, q.y), Math.max(p.x, q.x), Math.max(p.y, q.y)];
};

/** One figure of a page: its structures (`structuresOf`), and what else it has drawn - its arrows, "+" signs and words - where the pointer takes none. */
export function figureOn(given: FigureDrawn, figure: number, sha256: string, page: number, beside: readonly Beside[], known?: readonly GlyphShape[]): { structures: PageStructure[]; marks: PageMarks } {
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
  const apart: Apart = {
    segments: read.arrows.flatMap((a) => {
      const path = [a.tail, ...a.corners, a.point];
      return path.slice(1).map((p, i): [Point, Point] => [path[i], p]);
    }),
    pluses: read.pluses,
  };
  return { structures: structuresHere(read.figure, back, figure, sha256, page, words, apart).map((st) => besideChecked(atEndChecked(st, read.figure, read.words, back), beside, read.figure.bond)), marks };
}

/** The structures of a figure read - each refused where letters of the figure no atom took, or words it read, lie within it. */
function structuresHere(f: FigureRead, back: (p: Point) => Point, figure: number, sha256: string, page: number, words: readonly Pick<FigureLetter, "c" | "box">[], apart?: Apart): PageStructure[] {
  return structuresIn(f, apart).map((ids, k): PageStructure => {
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
    const degree = new Map<number, number>();
    for (const b of mine) for (const e of [b.a, b.b]) degree.set(e, (degree.get(e) ?? 0) + 1);
    const ends = ids.filter((i) => degree.get(i) === 1 && !f.atoms[i].label).map((i) => back(f.atoms[i]));
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
      ends,
      reach,
      read: model ? { model } : { none: `Part of this structure could not be read ("${within}"), so none of it is taken.` },
    };
  });
}

/** A compound's number as a figure sets one under or beside its structure: 12, 3a, (4b), 7' - words of a figure that are no part of a structure. */
const COMPOUND_NUMBER = /^\(?\d{1,3}[a-z]{0,2}['\u2032]*\)?$/;
/** How near a bond's open end words of its figure may come before they are taken for a label not read: a bond. */
const AT_END = 1;

/**
 * A structure refused where words of its own figure - not its labels, nor a
 * compound's number - lie within a bond of the open end of one of its bonds
 * (an atom of one bond, with no label): a label too wide, too tall or too far
 * to be read as one, the rest of the structure perhaps past it.
 */
function atEndChecked(st: PageStructure, f: FigureRead, words: readonly { text: string; box: Box }[], back: (p: Point) => Point): PageStructure {
  if ("none" in st.read) return st;
  const degree = new Map<number, number>();
  for (const b of f.bonds) for (const e of [b.a, b.b]) degree.set(e, (degree.get(e) ?? 0) + 1);
  const ends = f.atoms.flatMap((a, i) => (degree.get(i) === 1 && !a.label ? [a] : []));
  const mine = new Set(st.atoms.map((p) => `${p.x},${p.y}`));
  const word = words.find((w) => !COMPOUND_NUMBER.test(w.text.trim()) && ends.some((a) => mine.has(`${back(a).x},${back(a).y}`) && toBox(a, w.box) <= AT_END * f.bond));
  return word ? { ...st, read: { none: `Part of this structure could not be read ("${word.text.trim()}" lies beside it), so none of it is taken.` } } : st;
}

/** A structure refused where a word of the page within its figure - none of its labels, no compound's number - lies within a bond of one of its open ends. */
function endWordsChecked(st: PageStructure, own: readonly PageObject[], wordsIn?: (box: Box) => string): PageStructure {
  if ("none" in st.read || !st.ends.length) return st;
  const bond = st.reach / REACH;
  const near = own.find((o) => {
    if (st.labels.some((l) => boxToBox(l, o.box) === 0)) return false;
    const text = wordsIn?.(o.box) ?? "";
    if (COMPOUND_NUMBER.test(text.trim())) return false;
    return st.ends.some((e) => toBox(e, o.box) <= AT_END * bond);
  });
  if (!near) return st;
  const text = wordsIn?.(near.box)?.trim();
  return { ...st, read: { none: `Part of this structure could not be read (${text ? `"${text}" lies beside it` : "words beside it were not read"}), so none of it is taken.` } };
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
 * arrow or a "+" of `marks` lies nearer still, or, pointed at, on its
 * words. `widened` takes its
 * reach further: a press takes a structure within half a bond of it, before
 * any words about it (`PRESS_WIDENED`).
 */
export function structureAt(structures: readonly PageStructure[], x: number, y: number, marks?: PageMarks, widened = 1): PageStructure | null {
  const p = { x, y };
  let best: PageStructure | null = null;
  let near = Infinity;
  for (const s of structures) {
    const reach = s.reach * widened;
    if (toBox(p, s.box) > reach) continue;
    const d = Math.min(...s.bonds.map(([a, b]) => toSegment(p, a, b)), ...s.labels.map((b) => toBox(p, b)), ...s.atoms.map((a) => dist(p, a)));
    if (d <= reach && d < near) [best, near] = [s, d];
  }
  // (nearer an arrow or a "+" than to it: on those, not on the structure - and on words, pointed at, the words'; a press within
  // its widened reach takes the structure before any words: a scheme's conditions set close by never take it from under it)
  if (best && marks) {
    const other = Math.min(Infinity, ...marks.segments.map(([a, b]) => toSegment(p, a, b)), ...marks.points.map((q) => dist(p, q)));
    if (other < near) return null;
    if (widened === 1 && marks.boxes.some((b) => toBox(p, b) === 0)) return null;
  }
  return best;
}
