/**
 * A reaction scheme read from a vector figure (docs/PDF.md, *Stage 5*,
 * *Reaction schemes*): its arrows - each read as the kind Meno draws it as
 * - and its "+" signs, taken out of what the figure is drawn with before
 * its structures are read (./read), and its words: those over or under an
 * arrow its conditions, the rest where they stand. Everything stays in the
 * page's points, y down, as the figure was drawn.
 */
import { boxOf, narrowestBox, shapesOf, type Blob, type Box, type FigureDrawn, type FigureLetter, type Point, type Shapes, type Stroke, type Wedge } from "./drawn";
import { figureBond, readFigure, type FigureRead } from "./read";
import type { GlyphShape } from "./glyphs";
import type { ArrowForm, ArrowWeight } from "../chem/reactionArrow";
import type { WordsMark, WordsStyle } from "../chem/captions";
import { marksOf } from "../chem/captions";
import { writtenAsMeant } from "../text/smartWords";

/** An arrow read: its tail, its point, the corners its line turns at, what it is, and its colour (#rrggbb) where it has one. */
export type SchemeArrow = { tail: Point; point: Point; corners: Point[]; form: ArrowForm; color?: string };

/** Words read: what they say, how some of their letters are set, where they stand, and the arrow they are over or under, by its place among the arrows. */
export type SchemeWords = { text: string; marks: WordsMark[]; box: Box; arrow?: number; align?: "left" };

/** A scheme read: its structures (./read), its arrows, its "+" signs, its words, and how long its bonds are drawn - or would be, by its letters, where it has none. */
export type SchemeRead = { figure: FigureRead; arrows: SchemeArrow[]; pluses: Point[]; words: SchemeWords[]; bond: number };

const dist = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y);
const len = (s: { a: Point; b: Point }) => dist(s.a, s.b);
const unit = (p: Point, q: Point): Point => {
  const l = Math.max(1e-9, dist(p, q));
  return { x: (q.x - p.x) / l, y: (q.y - p.y) / l };
};
const dot = (u: Point, v: Point) => u.x * v.x + u.y * v.y;
const cross = (u: Point, v: Point) => u.x * v.y - u.y * v.x;
const sub = (p: Point, q: Point): Point => ({ x: p.x - q.x, y: p.y - q.y });
const along = (p: Point, u: Point, t: number): Point => ({ x: p.x + u.x * t, y: p.y + u.y * t });

/** A straight line of an arrow: a stroke, or dashes in a row read as one dashed line - its pieces kept. */
type Line = { a: Point; b: Point; w: number; ink?: string; dash: boolean; of: object[] };

/** A head's outline as it may be at a line's end: its points, whether it is drawn open (a chevron), and what it was drawn as. */
/** What may be a head: its outline's points, whether it is open, what it was drawn as - and, a wedge, from its wide end to its narrow one. */
type HeadShape = { pts: Point[]; open: boolean; of: object[]; axis?: { base: Point; tip: Point } };

/** A head found at a line's end: its point, whole or half (and on which side of the line, as the page has it), how long, and what it was drawn as. */
type Head = { tip: Point; side: 0 | 1 | -1; open: boolean; length: number; of: object[] };

/** Points' hull, anticlockwise as the page's y goes down. */
function hull(pts: readonly Point[]): Point[] {
  const ps = [...pts].sort((p, q) => p.x - q.x || p.y - q.y);
  if (ps.length < 3) return ps;
  const turn = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of ps) {
    while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (const p of [...ps].reverse()) {
    while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function area(pts: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s / 2);
}

/**
 * Dashes in a row - three or more short strokes on one line, as thick as
 * each other, the gaps between them short - read as one dashed line.
 */
function dashedLines(strokes: readonly Stroke[], bond: number): Line[] {
  const short = strokes.filter((s) => len(s) < 0.6 * bond && len(s) > 0.02 * bond && !s.dash);
  const used = new Set<Stroke>();
  const out: Line[] = [];
  for (const s of short) {
    if (used.has(s)) continue;
    const u = unit(s.a, s.b);
    const on = (t: Stroke) =>
      !used.has(t) &&
      Math.abs(cross(u, unit(t.a, t.b))) < Math.sin((6 * Math.PI) / 180) &&
      Math.abs(cross(u, sub(t.a, s.a))) < Math.max(0.6 * s.w, 0.02 * bond) &&
      Math.abs(t.w - s.w) <= 0.35 * Math.max(t.w, s.w);
    const row = short.filter(on).sort((p, q) => Math.min(dot(sub(p.a, s.a), u), dot(sub(p.b, s.a), u)) - Math.min(dot(sub(q.a, s.a), u), dot(sub(q.b, s.a), u)));
    // (broken where a gap is long: a dash's own length or so, or two of it)
    const piece = row.map(len).sort((a, b) => a - b)[Math.floor(row.length / 2)] ?? len(s);
    const runs: Stroke[][] = [];
    for (const t of row) {
      const last = runs[runs.length - 1]?.[runs[runs.length - 1].length - 1];
      const lo = (x: Stroke) => Math.min(dot(sub(x.a, s.a), u), dot(sub(x.b, s.a), u));
      const hi = (x: Stroke) => Math.max(dot(sub(x.a, s.a), u), dot(sub(x.b, s.a), u));
      if (last && lo(t) - hi(last) < Math.max(2.5 * piece, 0.25 * bond) && lo(t) - hi(last) > -0.2 * piece) runs[runs.length - 1].push(t);
      else runs.push([t]);
    }
    for (const run of runs) {
      if (run.length < 3 || !run.includes(s)) continue;
      const ts = run.flatMap((t) => [dot(sub(t.a, s.a), u), dot(sub(t.b, s.a), u)]);
      const a = along(s.a, u, Math.min(...ts));
      const b = along(s.a, u, Math.max(...ts));
      if (dist(a, b) < 0.8 * bond) continue;
      for (const t of run) used.add(t);
      out.push({ a, b, w: s.w, ...(s.ink ? { ink: s.ink } : {}), dash: true, of: run });
    }
  }
  return out;
}

/** Whether a colour (#rrggbbaa) is a colour of its own: neither black nor a grey close to it. As #rrggbb, where it is. */
function colourOf(ink: string | undefined): string | undefined {
  const v = ink && /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(ink);
  if (!v) return undefined;
  const [r, g, b] = [v[1], v[2], v[3]].map((h) => Number.parseInt(h, 16));
  if (Math.max(r, g, b) < 80) return undefined;
  return `#${v[1]}${v[2]}${v[3]}`.toLowerCase();
}

/**
 * The head at a line's end `e`, the line coming to it along `u` - its
 * shaft's width `w` - among the shapes that could be one: a filled head,
 * whole or half; an open one, drawn as a chevron's two strokes or its
 * outline; or a single barb, a half head's. Its point lies on the line
 * ahead of the end, or at it, and its back by the end.
 */
/** How nearly along the line a wedge-shaped head points, from its wide end to its narrow one: within 35 degrees (a half head's leans off it by half its width). */
const HEAD_ALONG = Math.cos((35 * Math.PI) / 180);

function headAt(e: Point, u: Point, w: number, shapes: readonly HeadShape[], barbs: readonly Stroke[], bond: number): Head | null {
  const tol = Math.max(0.06 * bond, 2 * w);
  let best: (Head & { off: number }) | null = null;
  for (const h of shapes) {
    // (a wedge pointing along the line, its narrow end ahead - not a stereo bond going off the same atom, sideways or straight on)
    if (h.axis && dot(unit(h.axis.base, h.axis.tip), u) < HEAD_ALONG) continue;
    const ts = h.pts.map((p) => dot(sub(p, e), u));
    const cs = h.pts.map((p) => cross(u, sub(p, e)));
    const i = ts.indexOf(Math.max(...ts));
    const tip = h.pts[i];
    const length = ts[i] - Math.min(...ts);
    if (length < 0.08 * bond || length > 1.1 * bond) continue;
    // (its point ahead of the end, or at it, on the line; its back by the end)
    if (ts[i] < -tol || Math.min(...ts) > 0.35 * length + tol || ts[i] > 1.4 * length + tol) continue;
    if (Math.abs(cs[i]) > Math.max(0.18 * length, 1.5 * w)) continue;
    const reach = Math.max(w, 0.12 * length);
    const left = Math.max(...cs);
    const right = -Math.min(...cs);
    const side: 0 | 1 | -1 = left > reach && right > reach ? 0 : left > reach ? 1 : right > reach ? -1 : 0;
    if (side === 0 && !(left > reach && right > reach)) continue;
    // (as wide as a head is for its length: a wedge is narrower)
    const wide = side === 0 ? (left + right) / length : Math.max(left, right) / length;
    if (wide < (side === 0 ? 0.33 : 0.15)) continue;
    const off = Math.abs(cs[i]) + Math.abs(ts[i]) * 0.1;
    if (!best || off < best.off) best = { tip, side, open: h.open, length, of: h.of, off };
  }
  if (best) {
    const { off: _off, ...head } = best;
    return head;
  }
  // a single barb back from the end, to one side: a half head drawn as a stroke
  for (const s of barbs) {
    const [near, far] = dist(s.a, e) < dist(s.b, e) ? [s.a, s.b] : [s.b, s.a];
    if (dist(near, e) > tol) continue;
    const v = unit(near, far);
    const back = -dot(v, u);
    if (back < Math.cos((50 * Math.PI) / 180) || back > Math.cos((10 * Math.PI) / 180)) continue;
    return { tip: e, side: cross(u, v) > 0 ? 1 : -1, open: true, length: back * len(s), of: [s] };
  }
  return null;
}

/** An arrow being read: its lines from its tail, its line's points, its head, a head at its tail where it has one, and whether it is a retrosynthesis's. */
type Found = { lines: Line[]; path: Point[]; head: Head; tailHead: Head | null; retro?: true };

/** Two arrows side by side pointing opposite ways, a short way apart and alongside each other for most of their length: an equilibrium's halves. */
function pairedAsEquilibrium(p: Found, q: Found, bond: number): boolean {
  if (p.path.length !== 2 || q.path.length !== 2 || p.tailHead || q.tailHead) return false;
  const u = unit(p.path[0], p.path[1]);
  const v = unit(q.path[0], q.path[1]);
  if (dot(u, v) > -0.97) return false;
  const gap = Math.abs(cross(u, sub(q.path[0], p.path[0])));
  if (gap < 0.03 * bond || gap > 0.8 * bond) return false;
  const [p0, p1] = [0, dot(sub(p.path[1], p.path[0]), u)];
  const [q0, q1] = [dot(sub(q.path[0], p.path[0]), u), dot(sub(q.path[1], p.path[0]), u)].sort((a, b) => a - b);
  const overlap = Math.min(p1, q1) - Math.max(p0, q0);
  return overlap > 0.5 * Math.min(p1 - p0, q1 - q0);
}

/** The middle of an arrow's line: the point halfway along it. */
function middleOf(path: readonly Point[]): Point {
  const total = path.slice(1).reduce((s, p, i) => s + dist(path[i], p), 0);
  let left = total / 2;
  for (let i = 1; i < path.length; i++) {
    const l = dist(path[i - 1], path[i]);
    if (left <= l) return along(path[i - 1], unit(path[i - 1], path[i]), left);
    left -= l;
  }
  return path[path.length - 1];
}

/**
 * An arrow drawn as one filled outline - its line and its heads in one
 * shape, as some programs draw one: long and thin, wider at an end - a
 * head there, whole or half - its point the outline's farthest there.
 */
function outlineArrow(b: Blob, bond: number): Found | null {
  if (b.parts.length !== 1 || b.pts.length < 5) return null;
  const { u, mid, long, short } = narrowestBox(b.pts);
  if (long < 1.0 * bond || long < 4 * short) return null;
  const pts = b.pts;
  const at = (t: number): [number, number] | null => {
    const cs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const tp = dot(sub(p, mid), u);
      const tq = dot(sub(q, mid), u);
      if ((tp - t) * (tq - t) > 0 || tp === tq) continue;
      const k = (t - tp) / (tq - tp);
      cs.push(cross(u, sub(p, mid)) * (1 - k) + cross(u, sub(q, mid)) * k);
    }
    return cs.length >= 2 ? [Math.min(...cs), Math.max(...cs)] : null;
  };
  const n = 60;
  const rows = Array.from({ length: n + 1 }, (_, i) => {
    const t = -long / 2 + (long * (i + 0.5)) / (n + 1);
    return { t, c: at(t) };
  }).filter((r): r is { t: number; c: [number, number] } => !!r.c);
  const middle = rows.filter((r) => Math.abs(r.t) < long / 4);
  if (middle.length < 4) return null;
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const lo = median(middle.map((r) => r.c[0]));
  const hi = median(middle.map((r) => r.c[1]));
  const width = hi - lo;
  if (width > 0.25 * bond) return null;
  const reach = Math.max(width, 0.06 * bond);
  // (a head at an end: wider there than the line, on one side or both)
  const headOf = (sign: 1 | -1): { side: 0 | 1 | -1; tip: Point; length: number } | null => {
    const end = rows.filter((r) => sign * r.t > long / 2 - 0.35 * long);
    const up = Math.max(...end.map((r) => r.c[1] - hi));
    const down = Math.max(...end.map((r) => lo - r.c[0]));
    if (up < reach && down < reach) return null;
    const ts = pts.map((p) => sign * dot(sub(p, mid), u));
    const tip = pts[ts.indexOf(Math.max(...ts))];
    const wide = end.filter((r) => r.c[1] - hi > 0.5 * reach || lo - r.c[0] > 0.5 * reach).map((r) => sign * r.t);
    // (as the page has it, the side its point's way: 1 its left)
    const left = sign === 1 ? up : down;
    const right = sign === 1 ? down : up;
    return { side: left >= reach && right >= reach ? 0 : left >= reach ? 1 : -1, tip, length: long / 2 - Math.min(...wide) };
  };
  const ahead = headOf(1);
  const behind = headOf(-1);
  if (!ahead && !behind) return null;
  const [front, back, sign] = ahead ? [ahead, behind, 1] : [behind!, null, -1];
  const way = sign === 1 ? u : { x: -u.x, y: -u.y };
  const centre = (lo + hi) / 2;
  const tail = back ? back.tip : along(along(mid, way, -long / 2), { x: -u.y, y: u.x }, centre);
  const line: Line = { a: tail, b: front.tip, w: width, ...(b.ink ? { ink: b.ink } : {}), dash: false, of: [b] };
  const head = (h: { side: 0 | 1 | -1; tip: Point; length: number }): Head => ({ tip: h.tip, side: h.side, open: false, length: h.length, of: [] });
  return { lines: [line], path: [tail, front.tip], head: head(front), tailHead: back ? head(back) : null };
}

/** The arrows of a figure, and the shapes and letters they are drawn with. */
export function arrowsOf(shapes: Shapes, letters: readonly FigureLetter[], bond: number, lineWidth: number): { arrows: SchemeArrow[]; used: Set<object>; usedLetters: Set<FigureLetter> } {
  const used = new Set<object>();
  const usedLetters = new Set<FigureLetter>();
  const dashed = dashedLines(shapes.strokes, bond);
  const inDashes = new Set(dashed.flatMap((l) => l.of));
  const lines: Line[] = [
    ...shapes.strokes.filter((s) => !inDashes.has(s) && len(s) > 0.1 * bond).map((s): Line => ({ a: s.a, b: s.b, w: s.w, ...(s.ink ? { ink: s.ink } : {}), dash: !!s.dash, of: [s] })),
    ...dashed,
  ];
  // what may be a head: filled shapes no longer than a bond - a wedge's outline, a blob of one part - and chevrons of two strokes
  const filled: HeadShape[] = [
    ...shapes.wedges.filter((x: Wedge) => x.outline && dist(x.tip, x.base) < 1.2 * bond).map((x): HeadShape => ({ pts: hull(x.outline!), open: false, of: [x], axis: { base: x.base, tip: x.tip } })),
    ...shapes.blobs
      .filter((b: Blob) => b.parts.length === 1 && Math.max(b.box[2] - b.box[0], b.box[3] - b.box[1]) < 1.2 * bond && Math.max(b.box[2] - b.box[0], b.box[3] - b.box[1]) > 0.06 * bond)
      .map((b): HeadShape => {
        const h = hull(b.pts);
        return { pts: h, open: area(b.pts) < 0.5 * area(h), of: [b] };
      }),
  ];
  const shortLines = lines.filter((l) => !l.dash && len(l) < 0.9 * bond);
  const chevrons: HeadShape[] = [];
  for (let i = 0; i < shortLines.length; i++) {
    for (let j = i + 1; j < shortLines.length; j++) {
      const p = shortLines[i];
      const q = shortLines[j];
      const tol = Math.max(0.04 * bond, 1.5 * Math.max(p.w, q.w));
      const pairs: [Point, Point, Point, Point][] = [
        [p.a, p.b, q.a, q.b],
        [p.a, p.b, q.b, q.a],
        [p.b, p.a, q.a, q.b],
        [p.b, p.a, q.b, q.a],
      ];
      const hit = pairs.find(([p0, , q0]) => dist(p0, q0) < tol);
      if (!hit) continue;
      const [tip, pf, , qf] = hit;
      const angle = Math.acos(Math.max(-1, Math.min(1, dot(unit(tip, pf), unit(tip, qf)))));
      if (angle < (20 * Math.PI) / 180 || angle > (120 * Math.PI) / 180) continue;
      chevrons.push({ pts: [tip, pf, qf], open: true, of: [...p.of, ...q.of] });
    }
  }
  const heads = [...filled, ...chevrons];
  const barbs = shortLines.flatMap((l) => l.of.filter((o): o is Stroke => "a" in o && "b" in o));
  const taken = (l: Line) => l.of.some((o) => used.has(o));
  const near = Math.max(0.06 * bond, 2 * lineWidth);

  // arrows drawn as one outline each
  const found: Found[] = [];
  for (const b of shapes.blobs) {
    const f = outlineArrow(b, bond);
    if (!f) continue;
    used.add(b);
    found.push(f);
  }
  // each line's end that has a head: an arrow - back along its lines, corner to corner, to its tail
  const longFirst = [...lines].sort((p, q) => len(q) - len(p));
  for (const l of longFirst) {
    if (taken(l)) continue;
    for (const [from, e] of [
      [l.a, l.b],
      [l.b, l.a],
    ] as const) {
      if (taken(l)) break;
      const u = unit(from, e);
      const free = heads.filter((h) => !h.of.some((o) => used.has(o) || l.of.includes(o)));
      const head = headAt(e, u, l.w, free, barbs.filter((b) => !used.has(b) && !l.of.includes(b)), bond);
      if (!head) continue;
      // (back along it: through a corner where one line, and only one, goes on from its end)
      const chain: Line[] = [l];
      const path: Point[] = [e, from];
      for (;;) {
        const end = path[path.length - 1];
        const on = lines.filter((m) => !chain.includes(m) && !taken(m) && !head.of.some((o) => m.of.includes(o)) && (dist(m.a, end) < near || dist(m.b, end) < near));
        if (on.length !== 1) break;
        const m = on[0];
        chain.push(m);
        path.push(dist(m.a, end) < near ? m.b : m.a);
      }
      path.reverse();
      // (as long as a bond or so at least, its head and its point with it; its head the lesser part)
      const total = path.slice(1).reduce((s, p, i) => s + dist(path[i], p), 0) + dist(e, head.tip);
      if (total < 0.8 * bond || head.length > 0.6 * total) continue;
      // (a corner where it turns, not where a line merely goes on)
      const pts = path.filter((p, i) => i === 0 || i === path.length - 1 || Math.abs(cross(unit(path[i - 1], p), unit(p, path[i + 1]))) > Math.sin((4 * Math.PI) / 180));
      // its point is the head's; a head at its tail too, where it has one
      const t0 = unit(pts[1], pts[0]);
      const tailHead = headAt(pts[0], t0, l.w, heads.filter((h) => !h.of.some((o) => used.has(o) || head.of.includes(o) || chain.some((c) => c.of.includes(o)))), [], bond);
      for (const c of chain) for (const o of c.of) used.add(o);
      for (const o of head.of) used.add(o);
      for (const o of tailHead?.of ?? []) used.add(o);
      const line = [...(tailHead ? [tailHead.tip] : [pts[0]]), ...pts.slice(1, -1), head.tip];
      found.push({ lines: chain, path: line, head, tailHead });
    }
  }

  // a retrosynthesis's arrow: two lines side by side, their ends within an open head's chevron, its point ahead of them on the line between
  for (const h of chevrons.concat(filled.filter((f) => f.open))) {
    if (h.of.some((o) => used.has(o))) continue;
    const free = lines.filter((l) => !taken(l) && len(l) > 0.8 * bond);
    let done = false;
    for (let i = 0; i < free.length && !done; i++) {
      for (let j = i + 1; j < free.length && !done; j++) {
        const p = free[i];
        const q = free[j];
        if (Math.abs(cross(unit(p.a, p.b), unit(q.a, q.b))) > Math.sin((5 * Math.PI) / 180)) continue;
        // (each line's end nearer the chevron)
        const c = { x: h.pts.reduce((t, x) => t + x.x, 0) / h.pts.length, y: h.pts.reduce((t, x) => t + x.y, 0) / h.pts.length };
        const endOf = (l: Line) => (dist(l.a, c) < dist(l.b, c) ? [l.b, l.a] : [l.a, l.b]);
        const [pf, pe] = endOf(p);
        const [qf, qe] = endOf(q);
        const mid = { x: (pe.x + qe.x) / 2, y: (pe.y + qe.y) / 2 };
        const u = unit({ x: (pf.x + qf.x) / 2, y: (pf.y + qf.y) / 2 }, mid);
        const gap = Math.abs(cross(u, sub(pe, qe)));
        if (gap < 0.03 * bond || gap > 0.6 * bond) continue;
        const ts = h.pts.map((x) => dot(sub(x, mid), u));
        const cs = h.pts.map((x) => cross(u, sub(x, mid)));
        const k = ts.indexOf(Math.max(...ts));
        const length = ts[k] - Math.min(...ts);
        if (ts[k] < 0 || ts[k] > 1.2 * gap + 0.5 * bond || Math.abs(cs[k]) > 0.3 * gap + near) continue;
        if (Math.max(...cs) < 0.5 * gap || -Math.min(...cs) < 0.5 * gap || length > 0.8 * bond) continue;
        for (const o of [...p.of, ...q.of, ...h.of]) used.add(o);
        const tail = { x: (pf.x + qf.x) / 2, y: (pf.y + qf.y) / 2 };
        found.push({ lines: [p, q], path: [tail, h.pts[k]], head: { tip: h.pts[k], side: 0, open: true, length, of: h.of }, tailHead: null, retro: true });
        done = true;
      }
    }
  }

  // equilibria: two arrows side by side pointing opposite ways - the one on the upper side, as Meno draws one, the way it goes
  const arrows: SchemeArrow[] = [];
  const paired = new Set<Found>();
  const formOf = (f: Found): ArrowForm => {
    const w = f.lines[0].w;
    const weight: ArrowWeight | null = lineWidth > 0 ? (w < 0.75 * lineWidth ? "thin" : w > 1.6 * lineWidth ? "thick" : null) : null;
    return {
      ...(f.retro ? { kind: "retrosynthetic" as const } : {}),
      ...(f.tailHead ? { heads: 2 as const } : {}),
      ...(f.lines.some((l) => l.dash) ? { dash: true as const } : {}),
      ...(weight ? { weight } : {}),
    };
  };
  for (let i = 0; i < found.length; i++) {
    const p = found[i];
    if (paired.has(p)) continue;
    const q = found.slice(i + 1).find((x) => !paired.has(x) && pairedAsEquilibrium(p, x, bond));
    if (q) {
      paired.add(p);
      paired.add(q);
      // (the upper line goes the reaction's way, as an equilibrium is printed - the right one where they stand upright, as one turned a quarter)
      const ax = unit(p.path[0], p.path[1]);
      const a = Math.abs(ax.x) > 0.1 ? (ax.x > 0 ? ax : { x: -ax.x, y: -ax.y }) : ax.y > 0 ? ax : { x: -ax.x, y: -ax.y };
      const up = { x: a.y, y: -a.x };
      const [fwd, back] = dot(sub(middleOf(p.path), middleOf(q.path)), up) > 0 ? [p, q] : [q, p];
      const u = unit(fwd.path[0], fwd.path[1]);
      const o = fwd.path[0];
      const ts = [...fwd.path, ...back.path].map((x) => dot(sub(x, o), u));
      const across = (cross(u, sub(fwd.path[0], o)) + cross(u, sub(back.path[0], o))) / 2;
      const n = { x: -u.y, y: u.x };
      const at = (t: number) => ({ x: o.x + u.x * t + n.x * across, y: o.y + u.y * t + n.y * across });
      const full = fwd.head.side === 0 && back.head.side === 0;
      const color = colourOf(fwd.lines[0].ink);
      arrows.push({ tail: at(Math.min(...ts)), point: at(Math.max(...ts)), corners: [], form: { ...formOf(fwd), kind: "equilibrium", ...(full ? { full: true } : {}) }, ...(color ? { color } : {}) });
      continue;
    }
    const color = colourOf(p.lines[0].ink);
    arrows.push({ tail: p.path[0], point: p.path[p.path.length - 1], corners: p.path.slice(1, -1), form: formOf(p), ...(color ? { color } : {}) });
  }

  // a reaction that does not go: a cross on the arrow's line, about its middle - two short strokes, or a letter x
  for (const a of arrows) {
    if (a.form.kind) continue;
    const path = [a.tail, ...a.corners, a.point];
    const m = middleOf(path);
    const total = path.slice(1).reduce((s, p, i) => s + dist(path[i], p), 0);
    const by = (p: Point) => dist(p, m) < 0.25 * total;
    const crossing = shortLines.filter((l) => !taken(l) && by({ x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 }) && len(l) < 0.7 * bond);
    let marked = false;
    for (let i = 0; i < crossing.length && !marked; i++) {
      for (let j = i + 1; j < crossing.length && !marked; j++) {
        const p = crossing[i];
        const q = crossing[j];
        const pm = { x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 };
        const qm = { x: (q.a.x + q.b.x) / 2, y: (q.a.y + q.b.y) / 2 };
        if (dist(pm, qm) > 0.25 * Math.max(len(p), len(q))) continue;
        const angle = Math.abs(cross(unit(p.a, p.b), unit(q.a, q.b)));
        if (angle < Math.sin((50 * Math.PI) / 180)) continue;
        for (const o of [...p.of, ...q.of]) used.add(o);
        marked = true;
      }
    }
    if (!marked) {
      const x = letters.find((l) => !usedLetters.has(l) && /^[x×✕✗X]$/u.test(l.c) && by({ x: (l.box[0] + l.box[2]) / 2, y: (l.box[1] + l.box[3]) / 2 }));
      if (x) {
        usedLetters.add(x);
        marked = true;
      }
    }
    if (marked) a.form = { ...a.form, kind: "noReaction" };
  }
  // what the arrows were drawn with, all of it
  for (const f of found) for (const l of f.lines) for (const o of l.of) used.add(o);
  return { arrows, used, usedLetters };
}

/**
 * The "+" signs drawn with strokes or filled: two strokes crossing at
 * their middles, square to each other and as long, touching nothing; or a
 * filled cross of twelve corners.
 */
export function plusesOf(shapes: Shapes, bond: number, used: ReadonlySet<object>): { pluses: Point[]; taken: Set<object> } {
  const taken = new Set<object>();
  const pluses: Point[] = [];
  const free = shapes.strokes.filter((s) => !used.has(s) && len(s) > 0.15 * bond && len(s) < 1.2 * bond);
  const ends = shapes.strokes.flatMap((s) => [s.a, s.b]).concat(shapes.wedges.flatMap((w) => [w.tip, w.base]));
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      const p = free[i];
      const q = free[j];
      if (taken.has(p) || taken.has(q)) continue;
      if (Math.abs(dot(unit(p.a, p.b), unit(q.a, q.b))) > Math.sin((10 * Math.PI) / 180)) continue;
      if (Math.max(len(p), len(q)) > 1.3 * Math.min(len(p), len(q))) continue;
      const pm = { x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 };
      const qm = { x: (q.a.x + q.b.x) / 2, y: (q.a.y + q.b.y) / 2 };
      if (dist(pm, qm) > 0.15 * len(p)) continue;
      // (nothing else ends by it)
      const own = [p.a, p.b, q.a, q.b];
      const r = 0.6 * Math.max(len(p), len(q)) + 0.15 * bond;
      if (ends.some((e) => !own.includes(e) && dist(e, pm) < r)) continue;
      taken.add(p);
      taken.add(q);
      pluses.push({ x: (pm.x + qm.x) / 2, y: (pm.y + qm.y) / 2 });
    }
  }
  for (const b of shapes.blobs) {
    if (used.has(b) || b.parts.length !== 1 || b.curved || b.pts.length < 12) continue;
    const [x0, y0, x1, y1] = b.box;
    const [w, h] = [x1 - x0, y1 - y0];
    if (w < 0.15 * bond || w > 1.2 * bond || h < 0.75 * w || h > 1.33 * w) continue;
    const fill = area(b.pts) / (w * h);
    if (fill < 0.15 || fill > 0.6) continue;
    const c = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
    const arm = 0.3 * Math.max(w, h);
    if (!b.pts.every((p) => Math.abs(p.x - c.x) <= arm || Math.abs(p.y - c.y) <= arm)) continue;
    taken.add(b);
    pluses.push(c);
  }
  return { pluses, taken };
}

/** Shapes without what is `used`. */
function without(shapes: Shapes, used: ReadonlySet<object>): Shapes {
  return {
    strokes: shapes.strokes.filter((s) => !used.has(s)),
    wedges: shapes.wedges.filter((w) => !used.has(w)),
    curves: shapes.curves.filter((c) => !used.has(c)),
    blobs: shapes.blobs.filter((b) => !used.has(b)),
  };
}

/** A line of words as set: its letters left to right, how tall its letters are, where its baseline is. */
type Row = { letters: FigureLetter[]; size: number; base: number; box: Box };

const baseOf = (l: FigureLetter) => l.at?.[1] ?? l.box[3];

/** Letters set in lines - each with its smaller letters set high or low - and lines broken where a gap is wide. */
function rowsOf(letters: readonly FigureLetter[]): Row[] {
  const sizes = letters.map((l) => l.size).sort((a, b) => a - b);
  const usual = sizes[Math.floor(sizes.length / 2)] ?? 10;
  const main = letters.filter((l) => l.size >= 0.85 * usual || !letters.some((m) => m !== l && m.size > l.size * 1.15 && Math.abs(baseOf(m) - baseOf(l)) < m.size));
  const rows: Row[] = [];
  for (const l of [...main].sort((p, q) => p.box[0] - q.box[0])) {
    const r = rows.find((r) => Math.abs(r.base - baseOf(l)) < 0.3 * Math.max(r.size, l.size) && l.box[0] - r.box[2] < 1.2 * Math.max(r.size, l.size) && l.box[0] - r.box[2] > -0.5 * r.size);
    if (r) {
      r.letters.push(l);
      r.size = Math.max(r.size, l.size);
      r.box = [Math.min(r.box[0], l.box[0]), Math.min(r.box[1], l.box[1]), Math.max(r.box[2], l.box[2]), Math.max(r.box[3], l.box[3])];
    } else rows.push({ letters: [l], size: l.size, base: baseOf(l), box: [...l.box] });
  }
  // (the smaller letters - subscripts, superscripts - each with the line beside it)
  for (const l of letters) {
    if (main.includes(l)) continue;
    const mid = (l.box[1] + l.box[3]) / 2;
    const r = rows
      .filter((r) => mid > r.box[1] - 0.6 * r.size && mid < r.box[3] + 0.5 * r.size && l.box[0] < r.box[2] + 0.6 * r.size && l.box[2] > r.box[0] - 0.6 * r.size)
      .sort((p, q) => Math.abs(p.base - mid) - Math.abs(q.base - mid))[0];
    if (r) {
      r.letters.push(l);
      r.box = [Math.min(r.box[0], l.box[0]), Math.min(r.box[1], l.box[1]), Math.max(r.box[2], l.box[2]), Math.max(r.box[3], l.box[3])];
    } else rows.push({ letters: [l], size: l.size, base: baseOf(l), box: [...l.box] });
  }
  for (const r of rows) r.letters.sort((p, q) => p.box[0] - q.box[0]);
  return rows;
}

const BOLD = /bold|black|heavy|semibold|demi/i;
const ITALIC = /italic|oblique/i;

/** A line of words as text, and each letter's style: a space where a gap is, bold and italics from the typeface, letters set high or low where they are not a formula's count or a charge. */
function rowText(r: Row): { text: string; styles: (WordsStyle | undefined)[] } {
  let text = "";
  const styles: (WordsStyle | undefined)[] = [];
  let prev: FigureLetter | null = null;
  for (const l of r.letters) {
    if (l.c.trim() === "") {
      if (text && !text.endsWith(" ")) {
        text += " ";
        styles.push(undefined);
      }
      prev = l;
      continue;
    }
    if (prev && prev.c.trim() && l.box[0] - prev.box[2] > 0.2 * r.size && !text.endsWith(" ")) {
      text += " ";
      styles.push(undefined);
    }
    let c = l.c;
    const small = l.size < 0.85 * r.size;
    const high = small && baseOf(l) < r.base - 0.2 * r.size;
    const low = small && !high && baseOf(l) > r.base + 0.1 * r.size;
    const font = l.font ?? "";
    const style: WordsStyle = { ...(BOLD.test(font) ? { bold: true } : {}), ...(ITALIC.test(font) ? { italic: true } : {}) };
    const before = text[text.length - 1] ?? "";
    // (a degree written as a raised o, or as the ordinal sign: a degree)
    if ((high && (c === "o" || c === "º")) || c === "º") c = "°";
    else if (high && !/[+\-−]/.test(c)) style.script = "sup";
    else if (low && !(/\d/.test(c) && /[\p{L})\]\d]/u.test(before))) style.script = "sub";
    text += c;
    styles.push(style.bold || style.italic || style.script ? style : undefined);
    prev = l;
  }
  return { text: text.trimEnd(), styles: styles.slice(0, text.trimEnd().length) };
}

/** Lines stacked into blocks: one under another, close, overlapping across. */
function blocksOf(rows: readonly Row[]): Row[][] {
  const sorted = [...rows].sort((p, q) => p.box[1] - q.box[1]);
  const blocks: Row[][] = [];
  for (const r of sorted) {
    const b = blocks.find((b) => {
      const last = b[b.length - 1];
      const gap = r.box[1] - last.box[3];
      const over = Math.min(r.box[2], last.box[2]) - Math.max(r.box[0], last.box[0]);
      return gap < 0.6 * Math.max(r.size, last.size) && gap > -0.3 * r.size && over > -0.5 * r.size && Math.abs(r.size - last.size) < 0.3 * r.size;
    });
    if (b) b.push(r);
    else blocks.push([r]);
  }
  return blocks;
}

/** The straight stretch an arrow's words go by: its longest. */
function wordsStretch(a: SchemeArrow): { a: Point; b: Point } {
  const path = [a.tail, ...a.corners, a.point];
  let best = { a: path[0], b: path[1] };
  for (let i = 1; i < path.length; i++) if (dist(path[i - 1], path[i]) > len(best)) best = { a: path[i - 1], b: path[i] };
  return best;
}

/**
 * The words of a scheme: its letters left over, set in lines and blocks;
 * a "+" alone a sign; a block over or under an arrow - within its longest
 * stretch, not across it, near - that arrow's; each written as Meno
 * writes words typed (lib/text/smartWords `writtenAsMeant`).
 */
export function wordsOf(letters: readonly FigureLetter[], arrows: readonly SchemeArrow[]): { words: SchemeWords[]; pluses: Point[] } {
  const rows = rowsOf(letters);
  const words: SchemeWords[] = [];
  const pluses: Point[] = [];
  const sizes = letters.map((l) => l.size).sort((a, b) => a - b);
  const usual = sizes[Math.floor(sizes.length / 2)] ?? 10;
  for (const block of blocksOf(rows)) {
    const lines = block.map(rowText);
    const text = lines.map((l) => l.text).join("\n");
    if (!text.trim()) continue;
    const box = block.map((r) => r.box).reduce((p, b) => [Math.min(p[0], b[0]), Math.min(p[1], b[1]), Math.max(p[2], b[2]), Math.max(p[3], b[3])]);
    const centre = { x: (box[0] + box[2]) / 2, y: (box[1] + box[3]) / 2 };
    if (text === "+" && block[0].size >= 0.8 * usual) {
      pluses.push(centre);
      continue;
    }
    const styles = lines.flatMap((l, i) => [...l.styles, ...(i < lines.length - 1 ? [undefined] : [])]);
    const written = writtenAsMeant(text, styles);
    // over or under an arrow: by its longest stretch, within it along, on one side of it, near
    let arrow: number | undefined;
    let nearest = Infinity;
    arrows.forEach((a, k) => {
      const s = wordsStretch(a);
      const u = unit(s.a, s.b);
      const l = len(s);
      const t = dot(sub(centre, s.a), u);
      if (t < -0.1 * l || t > 1.1 * l) return;
      const corners: Point[] = [
        { x: box[0], y: box[1] },
        { x: box[2], y: box[1] },
        { x: box[0], y: box[3] },
        { x: box[2], y: box[3] },
      ];
      const cs = corners.map((p) => cross(u, sub(p, s.a)));
      if (Math.min(...cs) < 0 && Math.max(...cs) > 0) return;
      const off = Math.min(...cs.map(Math.abs));
      if (off > 2.5 * block[0].size) return;
      if (off < nearest) {
        nearest = off;
        arrow = k;
      }
    });
    // (lines set flush left, not about a middle: left)
    const lefts = block.map((r) => r.box[0]);
    const middles = block.map((r) => (r.box[0] + r.box[2]) / 2);
    const left = block.length > 1 && Math.max(...lefts) - Math.min(...lefts) < 0.2 * block[0].size && Math.max(...middles) - Math.min(...middles) > 0.5 * block[0].size;
    words.push({ text: written.text, marks: marksOf(written.styles), box, ...(arrow != null ? { arrow } : {}), ...(left && arrow == null ? { align: "left" as const } : {}) });
  }
  return { words, pluses };
}

/**
 * A figure read as a scheme: its arrows and "+" signs taken out of what it
 * is drawn with, its structures read from the rest (./read), and the
 * letters no structure took read as words - its conditions, its compounds'
 * numbers, and anything else written there.
 */
export function readScheme(drawn: FigureDrawn, reads: (label: string) => boolean = () => true, known: readonly GlyphShape[] = []): SchemeRead {
  const shapes = shapesOf(drawn);
  // (how long its bonds are drawn: as most of its lines are - unless, its letters telling, those are arrows, there being no structure)
  const sizes = drawn.letters.map((l) => l.size).sort((a, b) => a - b);
  const byLetters = sizes.length ? 1.44 * sizes[Math.floor(sizes.length / 2)] : 0;
  const byLines = figureBond(shapes, drawn.letters);
  const bond = byLines && !(byLetters && byLines > 2 * byLetters) ? byLines : byLetters || byLines || 14.4;
  // (the line most bonds are drawn with, for an arrow's weight)
  const widths = shapes.strokes.filter((s) => len(s) > 0.5 * bond && len(s) < 1.3 * bond).map((s) => s.w).sort((a, b) => a - b);
  const lineWidth = widths[Math.floor(widths.length / 2)] ?? 0;
  const { arrows, used, usedLetters } = arrowsOf(shapes, drawn.letters, bond, lineWidth);
  const signs = plusesOf(shapes, bond, used);
  for (const o of signs.taken) used.add(o);
  const rest = without(shapes, used);
  const figure = readFigure({ ...drawn, letters: drawn.letters.filter((l) => !usedLetters.has(l)) }, reads, known, rest);
  const { words, pluses } = wordsOf(figure.left.letters, arrows);
  return { figure: { ...figure, left: { letters: [] } }, arrows, pluses: [...signs.pluses, ...pluses], words, bond: figure.bond || bond };
}

/** The box round all a scheme has: its atoms, its arrows' points, its "+" signs and its words; none, where it has nothing. */
export function schemeBox(s: SchemeRead): Box | null {
  const pts: Point[] = [...s.figure.atoms, ...s.arrows.flatMap((a) => [a.tail, ...a.corners, a.point]), ...s.pluses, ...s.words.flatMap((w) => [{ x: w.box[0], y: w.box[1] }, { x: w.box[2], y: w.box[3] }])];
  return pts.length ? boxOf(pts) : null;
}

