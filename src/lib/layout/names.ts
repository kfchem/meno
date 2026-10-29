/**
 * Where a name's letters lie - a label that is not an element's symbol:
 * OTBS, NHBz, PPh3 - as the drawing sets them (lib/chem/layout2d), for the
 * drawing itself and for the layout, which makes room for them (metrics).
 *
 * A name's first unit sits on its atom and the rest follows it, read
 * outward from its bond: leftward from a lone bond coming in from the
 * right (IUPAC GR-2.3.3, GR-2.1.6: TBSO), rightward otherwise. A lone bond within 35
 * degrees of upright may be read either way, and is read the way that has
 * more room - as a chemist writes OAc or AcO under a ring as there is
 * space - the usual way where both have as much.
 */
import { ELEMENTS } from "../chem/elements";
import type { Edge } from "./rings";

export type Box = { x0: number; x1: number; y0: number; y1: number };

const ELEMENT_SYMBOLS = new Set(ELEMENTS.map((e) => e.symbol));

/** Whether a label is a name - an abbreviation, a formula - rather than an element's symbol. */
export const isName = (el: string) => el !== "*" && !ELEMENT_SYMBOLS.has(el);

/** A bond within this of straight up or down (its sine) is read rightward, the usual way; within */
const BAND = Math.sin((10 * Math.PI) / 180);
/** this, either way, as there is room. */
const UPRIGHT = Math.sin((35 * Math.PI) / 180);

/**
 * Where a name's letters lie from its atom, in bond lengths, running
 * `left` or right: its first unit on the atom, the rest after it; a letter
 * about 0.42 of a bond across, a count's digit 0.28, its line 0.6 high.
 */
export function nameBox(el: string, left: boolean): Box {
  const rest = [...el.slice(1)].reduce((t, ch) => t + (/[0-9]/.test(ch) ? 0.28 : 0.42), 0);
  return left ? { x0: -0.25 - rest, x1: 0.25, y0: -0.3, y1: 0.3 } : { x0: -0.25, x1: 0.25 + rest, y0: -0.3, y1: 0.3 };
}

/** Whether the segment from `p` to `q` passes through a box. */
export function segmentMeetsBox(p: { x: number; y: number }, q: { x: number; y: number }, b: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  for (const [u, v] of [
    [-dx, p.x - b.x0],
    [dx, b.x1 - p.x],
    [-dy, p.y - b.y0],
    [dy, b.y1 - p.y],
  ]) {
    if (u === 0) {
      if (v < 0) return false;
      continue;
    }
    const t = v / u;
    if (u < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * How deep an atom at `p` is in a name's letters, or as far short of them
 * as it is clear (negative): a labelled atom's own letters and a space
 * beside them reckoned, a bare carbon by its bonds' meeting. `L` is the
 * bond length.
 */
export function atomDepth(box: Box, p: { x: number; y: number }, labelled: boolean, L: number): number {
  const room = (labelled ? 0.45 : 0.1) * L;
  return Math.min(p.x - box.x0 + room, box.x1 + room - p.x, p.y - box.y0 + 0.1 * L, box.y1 + 0.1 * L - p.y);
}

/** The paper between two lines of letters, one over the other, in bond lengths: less, and they read as touching (taxol's AcO on its OBz). */
const LINE_SPACE = 0.25;

/** How deep two names' letters are in each other, a space beside them and a line's space between their lines reckoned, or how far apart (negative). */
export function boxesDepth(a: Box, b: Box, L: number): number {
  return Math.min(
    Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 0.2 * L,
    Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + LINE_SPACE * L,
  );
}

export type NameGeometry = {
  x: readonly number[];
  y: readonly number[];
  edges: readonly Edge[];
  elements: readonly string[];
  /** Each atom's H not drawn as atoms: a label's, written beside or under its symbol (OH), in a name's way as much as the symbol is. */
  hydrogens?: readonly number[];
};

/**
 * Where the drawing sets a labelled atom's H, from the atom, in bond
 * lengths, given the ways its bonds leave it (unit vectors): beside the
 * symbol on the side its bonds leave free - OH, or HO where they leave to
 * the right - or under it (over it) where they leave on both sides and
 * that line is clearer of them than the row beside it. (The
 * font is 0.69 of a bond: an H beside its symbol is half a bond off, one
 * under it 0.6.)
 */
export function hydrogenSpot(ways: readonly { x: number; y: number }[]): { x: number; y: number } {
  const band = Math.sin((10 * Math.PI) / 180);
  const sx = ways.reduce((sum, w) => sum + w.x, 0);
  const sy = ways.reduce((sum, w) => sum + w.y, 0);
  if (ways.some((w) => w.x < -band) && ways.some((w) => w.x > band)) {
    // (and only where that line is clearer of the bonds than the row beside
    // the symbol, as the drawing sets it - else on the row's clearer side)
    if (!rowClearer(ways)) return { x: 0, y: sy >= 0 ? -0.6 : 0.6 };
    return { x: clearRowSide(ways) === "before" ? -0.5 : 0.5, y: 0 };
  }
  return { x: sx > Math.hypot(sx, sy) * band ? -0.5 : 0.5, y: 0 };
}

/** How far, in radians, an atom's bonds leave the way `v` (a unit vector) clear: the angle to the nearest. */
function clearOf(ways: readonly { x: number; y: number }[], vx: number, vy: number): number {
  return Math.min(...ways.map((w) => Math.acos(Math.max(-1, Math.min(1, w.x * vx + w.y * vy)))));
}

/**
 * How much clearer of an atom's bonds the row beside its symbol must be than
 * the line above or below it before its H leaves that line for the row: as
 * the label band elsewhere (10 degrees). Nearer even, the H stays stacked,
 * as it always was - so that a bond turned through where the two are alike
 * does not send the H from one to the other and back.
 */
export const ROW_BAND = (10 * Math.PI) / 180;

/**
 * Whether an atom's H, its bonds leaving it on both sides (`ways`, unit
 * vectors), goes on the row beside its symbol rather than stacked above or
 * below it: where the row is clearer of the bonds than that line, by more
 * than `ROW_BAND` - two bonds nearly in a line, steep (tetrodotoxin's
 * guanidine NH).
 */
export function rowClearer(ways: readonly { x: number; y: number }[]): boolean {
  const stacked = Math.max(clearOf(ways, 0, 1), clearOf(ways, 0, -1));
  const row = Math.max(clearOf(ways, 1, 0), clearOf(ways, -1, 0));
  return row > stacked + ROW_BAND;
}

/**
 * Which side of its symbol an H on the row goes (`rowClearer`): the side
 * clearer of the bonds - after the symbol, NH, or before it, HN - and, the
 * two alike (bonds in a line), after it, always. Before, the side was the
 * one the bonds' sum leaned from, which for three bonds spread evenly
 * (a borate's BH-) could be a bond's own way, and for two in a line was
 * decided by rounding.
 */
export function clearRowSide(ways: readonly { x: number; y: number }[]): "after" | "before" {
  return clearOf(ways, -1, 0) > clearOf(ways, 1, 0) + 1e-6 ? "before" : "after";
}


/**
 * Each name in a drawing, by its atom: which way its letters run, and
 * where they lie. Each is set the usual way first; then each that may be
 * read either way, in turn, is turned where the other way runs into fewer
 * atoms, bonds and names. `L` is the bond length.
 */
export function namesLaid(g: NameGeometry, L: number): Map<number, { left: boolean; box: Box }> {
  const out = new Map<number, { left: boolean; box: Box }>();
  // (most drawings have none)
  if (!g.elements.some(isName)) return out;
  const n = g.x.length;
  const next: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of g.edges) {
    next[a].push(b);
    next[b].push(a);
  }
  const labelled = (a: number) => g.elements[a] !== "C" && g.elements[a] !== "*";
  const place = (a: number, left: boolean) => {
    const b = nameBox(g.elements[a], left);
    return { left, box: { x0: g.x[a] + b.x0 * L, x1: g.x[a] + b.x1 * L, y0: g.y[a] + b.y0 * L, y1: g.y[a] + b.y1 * L } };
  };
  const either: number[] = [];
  for (let a = 0; a < n; a++) {
    if (!isName(g.elements[a])) continue;
    const one = next[a].length === 1 ? next[a][0] : -1;
    const d = one >= 0 ? { x: g.x[one] - g.x[a], y: g.y[one] - g.y[a] } : null;
    const len = d ? Math.hypot(d.x, d.y) || 1 : 1;
    // (read outward from its bonds where they come in from the right - all of them together, none leaving to the left: one
    // bond, or a ring's atom on its left side)
    const ways = next[a].map((b) => {
      const w = { x: g.x[b] - g.x[a], y: g.y[b] - g.y[a] };
      const l = Math.hypot(w.x, w.y) || 1;
      return { x: w.x / l, y: w.y / l };
    });
    const sum = ways.reduce((t, w) => ({ x: t.x + w.x, y: t.y + w.y }), { x: 0, y: 0 });
    const fromRight = ways.length > 0 && !ways.some((w) => w.x < -BAND) && sum.x > Math.hypot(sum.x, sum.y) * BAND;
    out.set(a, place(a, fromRight));
    if (d && Math.abs(d.x) <= len * UPRIGHT) either.push(a);
  }
  // (each label's H, where the drawing sets it)
  const spots: { x: number; y: number }[] = [];
  for (let b = 0; b < n; b++) {
    if (!labelled(b) || isName(g.elements[b]) || !((g.hydrogens?.[b] ?? 0) > 0) || !next[b].length) continue;
    const h = hydrogenSpot(
      next[b].map((c) => {
        const d = Math.hypot(g.x[c] - g.x[b], g.y[c] - g.y[b]) || 1;
        return { x: (g.x[c] - g.x[b]) / d, y: (g.y[c] - g.y[b]) / d };
      }),
    );
    spots.push({ x: g.x[b] + h.x * L, y: g.y[b] + h.y * L });
  }
  const runsInto = (a: number, box: Box) => {
    let count = 0;
    for (let b = 0; b < n; b++) {
      if (b === a || next[a].includes(b) || out.has(b)) continue;
      if (atomDepth(box, { x: g.x[b], y: g.y[b] }, labelled(b), L) > 0) count++;
    }
    for (const h of spots) if (atomDepth(box, h, true, L) > 0) count++;
    for (const [p, q] of g.edges) {
      if (p === a || q === a) continue;
      if (segmentMeetsBox({ x: g.x[p], y: g.y[p] }, { x: g.x[q], y: g.y[q] }, box)) count++;
    }
    for (const [o, other] of out) if (o !== a && boxesDepth(box, other.box, L) > 0) count++;
    return count;
  };
  for (const a of either) {
    const now = out.get(a)!;
    const turned = place(a, !now.left);
    if (runsInto(a, turned.box) < runsInto(a, now.box)) out.set(a, turned);
  }
  return out;
}
