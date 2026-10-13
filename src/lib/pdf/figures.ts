/**
 * A PDF page's figures (docs/PDF.md, *Taking things out*): where they lie,
 * worked out from what the page is made of as PDFium reads it - its words,
 * its paths, its pictures - each where it lies (`pdf_objects`, 20 bytes a
 * thing: what it is, and its box in points from the page's top left).
 *
 * A figure is where pictures and drawn paths lie together, near enough to
 * one another to be one; and the words over it and right beside it - its
 * labels - are its too. A reaction scheme is one figure: its arrows join
 * what lies beyond their ends, a "+" what lies either side of it, and the
 * words over and under an arrow and its compounds' numbers are its. A rule
 * across a column, or the page's own frame, is no figure.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";

/** A box on a page, in points from its top left: left, top, right, bottom. */
export type Box = [number, number, number, number];

/** What a page is made of: each thing, what it is and where it lies - "plus", words that are a "+" alone. */
export type PageObject = { kind: "text" | "path" | "image" | "shading" | "form" | "plus"; box: Box };

const KINDS = [undefined, "text", "path", "image", "shading", "form", "plus"] as const;

/** A page's things, from what the reader answers: 20 bytes each (src-tauri/src/pdf.rs, `objects`). */
export function pageObjectsOf(buf: ArrayBuffer): PageObject[] {
  const v = new DataView(buf);
  const out: PageObject[] = [];
  for (let i = 0; i + 20 <= buf.byteLength; i += 20) {
    const kind = KINDS[v.getUint32(i, true)];
    if (!kind) continue;
    const box = [0, 1, 2, 3].map((k) => v.getFloat32(i + 4 + k * 4, true)) as Box;
    if (box.every(Number.isFinite)) out.push({ kind, box });
  }
  return out;
}

const had = new Map<string, Box[] | "asked">();

/** A page's figures, if they have been worked out - asked for, the first time, and `came` called once they have. */
export function figuresHad(sha256: string, page: number, came: () => void = () => {}): Box[] | null {
  const key = `${sha256}:${page}`;
  const h = had.get(key);
  if (h && h !== "asked") return h;
  if (!h) {
    had.set(key, "asked");
    figuresOn(sha256, page)
      .then(() => came())
      .catch(() => had.delete(key));
  }
  return null;
}

/** A page's figures, worked out once and kept. */
export async function figuresOn(sha256: string, page: number): Promise<Box[]> {
  const key = `${sha256}:${page}`;
  const h = had.get(key);
  if (h && h !== "asked") return h;
  const objects = isTauri() ? pageObjectsOf(await invoke<ArrayBuffer>("pdf_objects", { sha: sha256, page })) : [];
  const figures = figuresOf(objects);
  had.set(key, figures);
  return figures;
}

/** How near pictures and paths are to be one figure's, in points; how near words to be its labels; how large a figure is at the least, one way and the other. */
const JOIN_PT = 8;
const LABEL_PT = 6;
const LEAST_PT = 24;
const LEAST_THICK_PT = 4;
/** A thin thing - a rule - at most this thick, at least this long, is no part of a figure, in points; nor anything over most of the page. */
const RULE_THICK_PT = 1.5;
const RULE_LONG_PT = 150;
const MOST_OF_PAGE = 0.8;
/** How far apart a scanned page's strips may lie, in points, to be one picture of it. */
const SCAN_GAP_PT = 1;
/**
 * A reaction scheme's parts lie farther apart than a structure's: an arrow
 * - long and thin - joins what lies beyond its ends, level with it, this
 * far off at most; a "+" what lies either side of it; the words over and
 * under an arrow (its conditions) are the scheme's this far off; and a short
 * word - a compound's number, under it or over it - a little farther off
 * than other labels.
 */
const ARROW_REACH_PT = 36;
const ARROW_THICK_PT = 14;
const ARROW_LONG = 2.5;
/** An arrow's line: straight, level or upright, this long at the least, and thin for its length - no bond of a chain, drawn slanting and short. */
const ARROW_LINE_PT = 25;
const ARROW_LINE_THIN = 0.15;
const PLUS_PT = 14;
const CONDITIONS_PT = 24;
const SHORT_WORD_PT = 40;
const NUMBER_PT = 14;
/**
 * A charge drawn by a word - a ring with its sign, or a sign set high - is
 * this large at most, and this near the word; a counter-ion so marked is
 * its structure's this far off at most, in points.
 */
const CHARGE_PT = 8;
const CHARGE_BY_PT = 3;
const ION_PT = 30;
/** A line of words wider than this share of the page - and than this, a page holding little else - is a column's, never a figure's label. */
const COLUMN_LINE = 0.3;
const COLUMN_LINE_PT = 150;

const grow = (b: Box, d: number): Box => [b[0] - d, b[1] - d, b[2] + d, b[3] + d];
const meet = (a: Box, b: Box) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
const within = (a: Box, b: Box) => a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3];
const area = (b: Box) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
const union = (a: Box, b: Box): Box => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

/** Boxes joined where they meet, `d` points apart at most, until none meet: each the box round its group. */
function joined(boxes: Box[], d: number): Box[] {
  let out = boxes.slice();
  for (let changed = true; changed; ) {
    changed = false;
    const next: Box[] = [];
    for (const b of out) {
      const k = next.findIndex((n) => meet(grow(n, d / 2), grow(b, d / 2)));
      if (k < 0) next.push(b);
      else {
        next[k] = union(next[k], b);
        changed = true;
      }
    }
    out = next;
  }
  return out;
}

/** Boxes joined where a label lies within `LABEL_PT` of each: the parts of one structure either side of it. */
function throughLabels(boxes: Box[], labels: readonly Box[]): Box[] {
  let out = boxes.slice();
  for (const l of labels) {
    const by = out.filter((b) => meet(grow(b, LABEL_PT), l));
    if (by.length < 2) continue;
    out = [...out.filter((b) => !by.includes(b)), by.reduce(union)];
  }
  return out;
}

/**
 * The figures on a page, from what it is made of: its pictures and paths,
 * joined where they lie within `JOIN_PT` of one another - not a rule nor
 * what covers most of the page, nor pictures that cover it together, as a
 * page scanned in strips is - each at least `LEAST_PT` one way and
 * `LEAST_THICK_PT` the other (a chain drawn flat is a figure, a word's
 * underline none), or holding a picture; and each widened to take the words over it or
 * right beside it, its labels, but not a column's lines of words beside it.
 */
export function figuresOf(objects: readonly PageObject[]): Box[] {
  const all = objects.map((o) => o.box);
  const page: Box = all.length ? all.reduce(union) : [0, 0, 0, 0];
  const pageArea = Math.max(1, (page[2] - page[0]) * (page[3] - page[1]));
  // (a page scanned in pieces - strips, or tiles - is no more a figure than a page scanned whole)
  const images = objects.filter((o) => o.kind === "image").map((o) => o.box);
  const scans = joined(images, SCAN_GAP_PT).filter((g) => images.filter((b) => within(b, g)).reduce((sum, b) => sum + area(b), 0) >= MOST_OF_PAGE * pageArea);
  const drawn = objects.filter((o) => {
    if (o.kind === "text" || o.kind === "plus") return false;
    if (o.kind === "image" && scans.some((g) => within(o.box, g))) return false;
    const [x0, y0, x1, y1] = o.box;
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 0 && h <= 0) return false;
    if (Math.min(w, h) <= RULE_THICK_PT && Math.max(w, h) >= RULE_LONG_PT) return false;
    return w * h < MOST_OF_PAGE * pageArea;
  });
  const pictures = drawn.filter((o) => o.kind === "image").map((o) => o.box);
  // (a structure's parts either side of a label - an acetyl past an NH, a group past an O - one, joined
  // through the word between them, before the small are left out)
  const labels = objects.filter((o) => o.kind === "text" && o.box[2] - o.box[0] <= SHORT_WORD_PT).map((o) => o.box);
  const pieces = throughLabels(
    joined(
      drawn.map((o) => o.box),
      JOIN_PT,
    ),
    labels,
  );
  const parts = pieces.filter((g) => {
    const [w, h] = [g[2] - g[0], g[3] - g[1]];
    return (Math.max(w, h) >= LEAST_PT && Math.min(w, h) >= LEAST_THICK_PT) || pictures.some((p) => meet(p, g));
  });
  // (charges drawn apart from any part - a ring with its sign, or a sign set high - too small to be parts themselves)
  const charges = [...pieces.filter((g) => !parts.includes(g)), ...objects.filter((o) => o.kind === "plus").map((o) => o.box)].filter((g) => Math.max(g[2] - g[0], g[3] - g[1]) <= CHARGE_PT);
  const pageW = Math.max(1, page[2] - page[0]);
  const words = objects.filter((o) => (o.kind === "text" || o.kind === "plus") && o.box[2] - o.box[0] <= Math.max(COLUMN_LINE * pageW, COLUMN_LINE_PT)).map((o) => o.box);
  const pluses = objects.filter((o) => o.kind === "plus").map((o) => o.box);
  // a scheme's parts joined: each arrow - long and thin, holding a straight line - to what lies beyond its ends, each "+" to what lies either side of it
  const lines = drawn.map((o) => o.box).filter((b) => {
    const [w, h] = [b[2] - b[0], b[3] - b[1]];
    return Math.max(w, h) >= ARROW_LINE_PT && Math.min(w, h) <= ARROW_LINE_THIN * Math.max(w, h);
  });
  const arrows = parts.filter((g) => arrowLike(g) && lines.some((l) => l[0] >= g[0] - 0.5 && l[1] >= g[1] - 0.5 && l[2] <= g[2] + 0.5 && l[3] <= g[3] + 0.5));
  // (each compound measured with the labels right beside it - an OH at the end nearest the arrow - an arrow as it is, its line thin)
  const withLabels = parts.map((g) => (arrows.includes(g) ? g : words.reduce((b, w) => (meet(grow(g, LABEL_PT), w) && w[2] - w[0] < Math.max(SHORT_WORD_PT, 0.6 * (g[2] - g[0])) ? union(b, w) : b), g)));
  const groups = schemesOf(withLabels, arrows, pluses);
  // (its labels: words over it, or beside it - none as wide as most of it, as a column's line is; a short word,
  // a compound's number, a little farther off; the words over and under its arrows, a line or two of them)
  const labelOf = (g: Box, b: Box, w: Box) => {
    const wide = w[2] - w[0];
    if (wide >= 0.6 * (b[2] - b[0]) && wide >= SHORT_WORD_PT) return false;
    if (meet(grow(b, LABEL_PT), w)) return true;
    // (a number under a compound, or over it - along it, not beside it, where its neighbour's label may stand)
    const mid = (w[0] + w[2]) / 2;
    if (wide <= SHORT_WORD_PT && mid >= g[0] && mid <= g[2] && meet(grow(g, NUMBER_PT), w)) return true;
    return arrows.some((a) => meet(a, g) && conditionOf(a, w));
  };
  const labelled = groups.map((g) => {
    let b = g;
    for (let pass = 0; pass < 2; pass++) b = words.reduce((acc, w) => (labelOf(g, acc, w) ? union(acc, w) : acc), b);
    return b;
  });
  return joined(withIons(labelled, labels, charges), 0);
}

/**
 * Figures with their counter-ions: a short word with a charge drawn by it
 * (Na with a "+" in a ring, Br with a "-"), set apart from a structure,
 * as a structure's ions are - its, within `ION_PT` of it, or of the ion
 * before it in a row of them (three K+). A short word with no charge by
 * it, a compound's number beside it, is not taken so far off.
 */
function withIons(figures: Box[], words: readonly Box[], charges: readonly Box[]): Box[] {
  const ions = words.flatMap((w) => {
    const by = charges.filter((c) => meet(grow(w, CHARGE_BY_PT), c));
    return by.length ? [by.reduce(union, w)] : [];
  });
  const out = figures.slice();
  const left = ions.filter((ion) => !out.some((f) => within(ion, grow(f, 0.5))));
  for (let more = true; more; ) {
    more = false;
    for (let i = left.length - 1; i >= 0; i--) {
      const near = out.map((f, k) => ({ k, gap: gapOf(f, left[i]) })).filter((n) => n.gap <= ION_PT).sort((a, b) => a.gap - b.gap)[0];
      if (!near) continue;
      out[near.k] = union(out[near.k], left[i]);
      left.splice(i, 1);
      more = true;
    }
  }
  return out;
}

/** How far apart two boxes lie: nothing where they meet. */
function gapOf(a: Box, b: Box): number {
  return Math.hypot(Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));
}

/** Whether a figure's part is an arrow's: long and thin, level or upright. */
function arrowLike(b: Box): boolean {
  const [w, h] = [b[2] - b[0], b[3] - b[1]];
  return (w >= ARROW_LONG * h && h <= ARROW_THICK_PT) || (h >= ARROW_LONG * w && w <= ARROW_THICK_PT);
}

/** Whether words lie over or under an arrow - beside it, standing upright - near it, and along it: its conditions. */
function conditionOf(a: Box, w: Box): boolean {
  const level = a[2] - a[0] >= a[3] - a[1];
  const [mid, lo, hi] = level ? [(w[0] + w[2]) / 2, a[0], a[2]] : [(w[1] + w[3]) / 2, a[1], a[3]];
  if (mid < lo || mid > hi) return false;
  const off = level ? Math.max(a[1] - w[3], w[1] - a[3]) : Math.max(a[0] - w[2], w[0] - a[2]);
  return off <= CONDITIONS_PT;
}

/** How far apart two boxes lie along a line, level (`x`) or upright, and whether they lie level with each other across it. */
function besideAlong(a: Box, b: Box, level: boolean): { gap: number; level: boolean } {
  const [a0, a1, b0, b1] = level ? [a[0], a[2], b[0], b[2]] : [a[1], a[3], b[1], b[3]];
  const [c0, c1, d0, d1] = level ? [a[1], a[3], b[1], b[3]] : [a[0], a[2], b[0], b[2]];
  const mid = (c0 + c1) / 2;
  return { gap: Math.max(b0 - a1, a0 - b1), level: mid >= d0 - ARROW_THICK_PT && mid <= d1 + ARROW_THICK_PT };
}

/** A figure's parts joined into schemes: each arrow with what lies beyond its ends, level with it; each "+" with what lies either side of it, its middle level with each. */
function schemesOf(parts: readonly Box[], arrows: readonly Box[], pluses: readonly Box[]): Box[] {
  const up = parts.map((_, i) => i);
  const root = (i: number): number => (up[i] === i ? i : (up[i] = root(up[i])));
  const tie = (i: number, j: number) => {
    up[root(i)] = root(j);
  };
  for (const a of arrows) {
    const i = parts.indexOf(a);
    const level = a[2] - a[0] >= a[3] - a[1];
    parts.forEach((g, j) => {
      if (j === i) return;
      const s = besideAlong(a, g, level);
      if (s.level && s.gap <= ARROW_REACH_PT) tie(i, j);
    });
  }
  // (a "+" set between two parts: both sides of it one scheme)
  for (const w of pluses) {
    if (w[2] - w[0] > PLUS_PT || w[3] - w[1] > PLUS_PT) continue;
    const mid = (w[1] + w[3]) / 2;
    const near = parts.map((g, j) => ({ j, s: besideAlong(w, g, true) })).filter((n) => mid >= parts[n.j][1] && mid <= parts[n.j][3] && n.s.gap <= ARROW_REACH_PT && n.s.gap >= 0);
    const left = near.filter((n) => parts[n.j][2] <= w[0]);
    const right = near.filter((n) => parts[n.j][0] >= w[2]);
    if (left.length && right.length) for (const l of left) for (const r of right) tie(l.j, r.j);
  }
  const boxes = new Map<number, Box>();
  parts.forEach((g, i) => {
    const r = root(i);
    boxes.set(r, boxes.has(r) ? union(boxes.get(r)!, g) : g);
  });
  return [...boxes.values()];
}

/** The figure, if any, a point of a page lies in, in points from its top left. */
export function figureAt(figures: readonly Box[], x: number, y: number): Box | null {
  return figures.find(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1) ?? null;
}
