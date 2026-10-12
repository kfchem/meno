/**
 * Guides as things are moved or made larger (docs/PRESENTING.md, *Guides*):
 * the edges and middles of what is moved line up with those of what is
 * near - and so with a slide's edges and middle lines - within a few pixels
 * of them; a space between things in a row or a column comes to the same
 * as another there; and something made larger or smaller takes another's
 * width or height. What lines up is shown by a line from end to end of
 * what lines up, and spaces made the same by a mark across each.
 *
 * Everything here is in the page's units; `reach` is how far a snap takes
 * what is moved - a few pixels of the screen, at the view's zoom.
 */

export type Box = { x0: number; y0: number; x1: number; y1: number };
/** A line on the page, from one point to another. */
export type Seg = { x1: number; y1: number; x2: number; y2: number };
/** What a guide shows: lines along edges and middles lined up, and marks across spaces or sizes made the same. */
export type GuideMarks = { lines: Seg[]; marks: Seg[] };

/** How near, on the screen, something comes before it lines up, in pixels. */
export const GUIDE_PX = 6;

type Axis = "x" | "y";
const lo = (b: Box, a: Axis) => (a === "x" ? b.x0 : b.y0);
const hi = (b: Box, a: Axis) => (a === "x" ? b.x1 : b.y1);
const mid = (b: Box, a: Axis) => (lo(b, a) + hi(b, a)) / 2;
const other = (a: Axis): Axis => (a === "x" ? "y" : "x");
const shifted = (b: Box, dx: number, dy: number): Box => ({ x0: b.x0 + dx, y0: b.y0 + dy, x1: b.x1 + dx, y1: b.y1 + dy });
/** How near two places must be to count as one, in the page's units. */
const SAME = 1e-6;

/** A snap along one axis: how far it moves, and, for a space made the same, the spaces to mark. */
type Snap = { delta: number; spaces?: [number, number][] };

/** Whether `b` shares any of `m`'s extent along `a` - lies in its row (a "x") or column. */
function inLine(b: Box, m: Box, a: Axis): boolean {
  const o = other(a);
  return hi(b, o) > lo(m, o) && lo(b, o) < hi(m, o);
}

/** The best snap of `m` along `a` to `others` within `reach`: an edge or a middle to one of theirs, or a space to one there is. */
function snapAlong(m: Box, others: readonly Box[], a: Axis, reach: number): Snap | null {
  let best: Snap | null = null;
  const consider = (s: Snap) => {
    if (Math.abs(s.delta) <= reach && (!best || Math.abs(s.delta) < Math.abs(best.delta) - SAME)) best = s;
  };
  const mine = [lo(m, a), mid(m, a), hi(m, a)];
  for (const b of others) for (const theirs of [lo(b, a), mid(b, a), hi(b, a)]) for (const v of mine) consider({ delta: theirs - v });
  // spaces: in its row (or column), the nearest before it and after it, and theirs
  const row = others.filter((b) => inLine(b, m, a));
  const before = row.filter((b) => hi(b, a) <= mid(m, a)).sort((p, q) => hi(q, a) - hi(p, a));
  const after = row.filter((b) => lo(b, a) >= mid(m, a)).sort((p, q) => lo(p, a) - lo(q, a));
  const size = hi(m, a) - lo(m, a);
  const A = before[0];
  const B = after[0];
  if (A && B) {
    // (halfway between the two)
    const gap = (lo(B, a) - hi(A, a) - size) / 2;
    if (gap > 0) consider({ delta: hi(A, a) + gap - lo(m, a), spaces: [[hi(A, a), hi(A, a) + gap], [lo(B, a) - gap, lo(B, a)]] });
  }
  if (A) {
    // (as far from the one before it as that is from the one before that)
    const A2 = before.find((b) => hi(b, a) <= lo(A, a));
    const gap = A2 ? lo(A, a) - hi(A2, a) : 0;
    if (A2 && gap > 0) consider({ delta: hi(A, a) + gap - lo(m, a), spaces: [[hi(A2, a), lo(A, a)], [hi(A, a), hi(A, a) + gap]] });
  }
  if (B) {
    const B2 = after.find((b) => lo(b, a) >= hi(B, a));
    const gap = B2 ? lo(B2, a) - hi(B, a) : 0;
    if (B2 && gap > 0) consider({ delta: lo(B, a) - gap - hi(m, a), spaces: [[lo(B, a) - gap, lo(B, a)], [hi(B, a), lo(B2, a)]] });
  }
  return best;
}

/**
 * Where `moving`, moved by (`dx`, `dy`), goes as it lines up with
 * `others` - each way within `reach`, or not at all - and the lines and
 * marks that show it. `axis` keeps it to one way, the other as asked.
 */
export function guided(moving: Box, dx: number, dy: number, others: readonly Box[], reach: number, axis?: Axis): { dx: number; dy: number } & GuideMarks {
  const raw = shifted(moving, dx, dy);
  const sx = axis === "y" ? null : snapAlong(raw, others, "x", reach);
  const sy = axis === "x" ? null : snapAlong(raw, others, "y", reach);
  const ndx = dx + (sx?.delta ?? 0);
  const ndy = dy + (sy?.delta ?? 0);
  const m = shifted(moving, ndx, ndy);
  return { dx: ndx, dy: ndy, lines: [...(sx ? linesAlong(m, others, "x") : []), ...(sy ? linesAlong(m, others, "y") : [])], marks: [...spaceMarks(m, sx, "x"), ...spaceMarks(m, sy, "y")] };
}

/** Lines along each edge or middle of `m` that one of `others` shares, across `a`: from end to end of all that share it. */
function linesAlong(m: Box, others: readonly Box[], a: Axis): Seg[] {
  const o = other(a);
  const out: Seg[] = [];
  for (const v of [lo(m, a), mid(m, a), hi(m, a)]) {
    const sharing = others.filter((b) => [lo(b, a), mid(b, a), hi(b, a)].some((t) => Math.abs(t - v) < SAME * Math.max(1, Math.abs(v)) + 1e-9));
    if (!sharing.length) continue;
    const from = Math.min(lo(m, o), ...sharing.map((b) => lo(b, o)));
    const to = Math.max(hi(m, o), ...sharing.map((b) => hi(b, o)));
    out.push(a === "x" ? { x1: v, y1: from, x2: v, y2: to } : { x1: from, y1: v, x2: to, y2: v });
  }
  return out;
}

/** A mark across each space a snap made the same, along `a`, about `m`'s middle across. */
function spaceMarks(m: Box, s: Snap | null, a: Axis): Seg[] {
  if (!s?.spaces) return [];
  const across = mid(m, other(a));
  return s.spaces.map(([p, q]) => (a === "x" ? { x1: p, y1: across, x2: q, y2: across } : { x1: across, y1: p, x2: across, y2: q }));
}

/**
 * What a box made larger or smaller - its proportions kept, as `scale`
 * says (`f` times the box `b` it was) - comes to as it takes the width or
 * the height of one of `others`, within `reach` either way; and marks
 * across both, where it does. None, where nothing is so near.
 */
export function sizedLike(b: Box, f: number, others: readonly Box[], reach: number, keep: (f: number) => Box): { f: number } & GuideMarks {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  let best: { f: number; match: Box; along: Axis } | null = null;
  for (const o of others) {
    for (const along of ["x", "y"] as const) {
      const mine = along === "x" ? w : h;
      const theirs = hi(o, along) - lo(o, along);
      if (mine <= 0 || theirs <= 0) continue;
      const g = theirs / mine;
      if (Math.abs((g - f) * mine) <= reach && (!best || Math.abs(g - f) < Math.abs(best.f - f))) best = { f: g, match: o, along };
    }
  }
  if (!best) return { f, lines: [], marks: [] };
  const now = keep(best.f);
  return { f: best.f, lines: [], marks: [sizeMark(now, best.along), sizeMark(best.match, best.along)] };
}

/** What a width (or a height) made larger or smaller comes to as it takes one of `others`', within `reach`; and marks across both. */
export function widthLike(now: Box, others: readonly Box[], reach: number, along: Axis = "x"): { size: number | null } & GuideMarks {
  const mine = hi(now, along) - lo(now, along);
  let best: Box | null = null;
  for (const o of others) {
    const theirs = hi(o, along) - lo(o, along);
    if (Math.abs(theirs - mine) <= reach && (!best || Math.abs(theirs - mine) < Math.abs(hi(best, along) - lo(best, along) - mine))) best = o;
  }
  if (!best) return { size: null, lines: [], marks: [] };
  const size = hi(best, along) - lo(best, along);
  return { size, lines: [], marks: [sizeMark(best, along)] };
}

/** A mark along a box's width (above it) or height (beside it), a little clear of it. */
export function sizeMark(b: Box, along: Axis): Seg {
  const clear = Math.min(b.x1 - b.x0, b.y1 - b.y0) * 0.04;
  return along === "x" ? { x1: b.x0, y1: b.y1 + clear, x2: b.x1, y2: b.y1 + clear } : { x1: b.x1 + clear, y1: b.y0, x2: b.x1 + clear, y2: b.y1 };
}

/** The boxes among `boxes` near enough to `m` to line up with: as far off as `room` times its larger side, and a little more. */
export function nearOf(m: Box, boxes: readonly Box[], room: number): Box[] {
  const r = room;
  return boxes.filter((b) => b.x1 >= m.x0 - r && b.x0 <= m.x1 + r && b.y1 >= m.y0 - r && b.y0 <= m.y1 + r);
}

/**
 * A box made larger or smaller by a side or a corner, the sides across from
 * them staying: each side moved (`moving`) comes to where the box is as
 * wide - or as tall - as one of `others`, within `reach`; and marks across
 * both, where it does.
 */
export function sidesLike(now: Box, moving: { x?: "x0" | "x1"; y?: "y0" | "y1" }, others: readonly Box[], reach: number): { box: Box } & GuideMarks {
  const box = { ...now };
  const marks: Seg[] = [];
  for (const along of ["x", "y"] as const) {
    const side = along === "x" ? moving.x : moving.y;
    if (!side) continue;
    const w = widthLike(now, others, reach, along);
    if (w.size == null) continue;
    if (side === "x0") box.x0 = box.x1 - w.size;
    else if (side === "x1") box.x1 = box.x0 + w.size;
    else if (side === "y0") box.y0 = box.y1 - w.size;
    else box.y1 = box.y0 + w.size;
    marks.push(sizeMark(box, along), ...w.marks);
  }
  return { box, lines: [], marks };
}
