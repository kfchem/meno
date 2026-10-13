/**
 * What a vector figure is drawn with, as PDFium reads it (src-tauri/src/pdf.rs,
 * `figure`): its paths, its letters and its pictures, each where it lies on
 * the page as drawn - in points from the page's top left, y down - and the
 * shapes they make, which `read` reads as a structure.
 */

/** A box on a page, in points from its top left: left, top, right, bottom. */
export type Box = [number, number, number, number];

/** A path's step: a move, a line or a curve to a point - a curve's three steps its two control points and its end - or the path closed. */
export type PathStep = ["M" | "L" | "C", number, number] | ["Z"];

/** A path as drawn: filled or stroked, in a colour (#rrggbbaa), how thick its stroke is, its steps, and whether its stroke is dashed. */
export type FigurePath = { fill: string | null; stroke: string | null; width: number; d: PathStep[]; dash?: boolean };

/** A letter as drawn: what it is, its box (its ink), where its baseline starts, its size in points, its typeface, its loose box - from where it starts to where the next letter would, as tall as its typeface - and which way its line reads as the page is shown (radians, y down; naught left to right). */
export type FigureLetter = { c: string; box: Box; at: [number, number] | null; size: number; font?: string; loose?: Box | null; dir?: number | null };

/** A figure as drawn, within a box of its page. */
export type FigureDrawn = { paths: FigurePath[]; letters: FigureLetter[]; pictures: Box[] };

export type Point = { x: number; y: number };

/** A straight stroke - a line stroked, or a bar filled - from `a` to `b`, `w` thick; a bar's own outline kept, as a letter's stem may be one; its colour (#rrggbbaa), and whether it is stroked dashed. */
export type Stroke = { a: Point; b: Point; w: number; outline?: Point[]; ink?: string; dash?: true };

/** A filled wedge: its narrow end, the middle of its wide end, and how wide that is; its outline, and its colour. */
export type Wedge = { tip: Point; base: Point; w: number; outline?: Point[]; ink?: string };

/** A curve stroked, as points along it: a wavy bond, a ring's circle, an arrow's arc; its colour. */
export type Curve = { pts: Point[]; closed: boolean; w: number; ink?: string };

/** A filled shape that is none of the above - a letter drawn as its outline, a dot, an arrow's head: its outlines, each closed, a hole within another where the path has one; its colour. */
export type Blob = { pts: Point[]; parts: Point[][]; box: Box; curved: boolean; ink?: string };

/** What a figure's paths make: strokes, wedges, curves and other shapes. */
export type Shapes = { strokes: Stroke[]; wedges: Wedge[]; curves: Curve[]; blobs: Blob[] };

const dist = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y);

/** Whether a colour is paper: white, or not seen at all. */
function blank(colour: string | null): boolean {
  if (!colour) return true;
  const v = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i.exec(colour);
  if (!v) return false;
  const [r, g, b] = [v[1], v[2], v[3]].map((h) => Number.parseInt(h, 16));
  const alpha = v[4] ? Number.parseInt(v[4], 16) : 255;
  return alpha < 24 || (r > 235 && g > 235 && b > 235);
}

/** A cubic Bézier curve's points, `n` steps along it after its start. */
function bezier(p0: Point, p1: Point, p2: Point, p3: Point, n: number): Point[] {
  const out: Point[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return out;
}

/** A path's parts, each begun by a move: its points, the steps from one to the next straight or not, and whether it was closed. */
type Part = { pts: Point[]; straight: boolean[]; closed: boolean };

function partsOf(d: readonly PathStep[]): Part[] {
  const parts: Part[] = [];
  let cur: Part | null = null;
  for (let i = 0; i < d.length; i++) {
    const s = d[i];
    if (s[0] === "M") {
      cur = { pts: [{ x: s[1], y: s[2] }], straight: [], closed: false };
      parts.push(cur);
    } else if (s[0] === "L" && cur) {
      cur.pts.push({ x: s[1], y: s[2] });
      cur.straight.push(true);
    } else if (s[0] === "C" && cur && i + 2 < d.length && d[i + 1][0] === "C" && d[i + 2][0] === "C") {
      const [c1, c2, e] = [d[i], d[i + 1], d[i + 2]] as ["C", number, number][];
      const from = cur.pts[cur.pts.length - 1];
      for (const p of bezier(from, { x: c1[1], y: c1[2] }, { x: c2[1], y: c2[2] }, { x: e[1], y: e[2] }, 8)) {
        cur.pts.push(p);
        cur.straight.push(false);
      }
      i += 2;
    } else if (s[0] === "Z" && cur) {
      cur.closed = true;
    }
  }
  return parts.filter((p) => p.pts.length > 1);
}

/** A polygon's area, with its sign: positive anticlockwise as the page is drawn (y down: clockwise as seen). */
function area(pts: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}

function hull(pts: readonly Point[]): Point[] {
  const ps = [...pts].sort((p, q) => p.x - q.x || p.y - q.y);
  if (ps.length < 3) return ps;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of ps) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (const p of ps.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** The narrowest box round some points, turned as it must be: its axis (a unit vector along its long side), its middle, and its length and width. */
export function narrowestBox(pts: readonly Point[]): { u: Point; mid: Point; long: number; short: number } {
  const h = hull(pts);
  let best = { u: { x: 1, y: 0 }, mid: pts[0], long: 0, short: Infinity };
  const edges = h.length > 1 ? h.length : 1;
  for (let i = 0; i < edges; i++) {
    const p = h[i];
    const q = h[(i + 1) % h.length] ?? p;
    const len = dist(p, q);
    const u = len > 0 ? { x: (q.x - p.x) / len, y: (q.y - p.y) / len } : { x: 1, y: 0 };
    let [a0, a1, b0, b1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const r of h) {
      const a = r.x * u.x + r.y * u.y;
      const b = -r.x * u.y + r.y * u.x;
      a0 = Math.min(a0, a);
      a1 = Math.max(a1, a);
      b0 = Math.min(b0, b);
      b1 = Math.max(b1, b);
    }
    const [along, across] = [a1 - a0, b1 - b0];
    if (along * across < best.long * best.short || best.short === Infinity) {
      const am = (a0 + a1) / 2;
      const bm = (b0 + b1) / 2;
      const mid = { x: am * u.x - bm * u.y, y: am * u.y + bm * u.x };
      best = along >= across ? { u, mid, long: along, short: across } : { u: { x: -u.y, y: u.x }, mid, long: across, short: along };
    }
  }
  return best;
}

/**
 * A filled shape read: a bar (a line drawn as a thin filled box), a wedge
 * (narrow at one end), or neither. How wide it is at each end is taken
 * where its edges cross a tenth of its length in from that end.
 */
function filledShape(pts: Point[], curved: boolean): { stroke: Stroke } | { wedge: Wedge } | null {
  if (pts.length < 3) return null;
  // (a wedge cut back to an H set close, wider than it is long: three corners, two sides from its tip as long as each other and the
  // third, its wide end, longer - its narrowest box lies along that end, not down the wedge)
  const corners = pts.filter((p, i) => !pts.slice(0, i).some((q) => dist(p, q) < 1e-3));
  if (!curved && corners.length === 3) {
    for (let i = 0; i < 3; i++) {
      const [tip, p, q] = [corners[i], corners[(i + 1) % 3], corners[(i + 2) % 3]];
      const [sp, sq, end] = [dist(tip, p), dist(tip, q), dist(p, q)];
      if (Math.abs(sp - sq) < 0.1 * Math.max(sp, sq) && end > 1.05 * Math.max(sp, sq)) {
        return { wedge: { tip, base: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, w: end, outline: pts } };
      }
    }
  }
  const { u, mid, long, short } = narrowestBox(pts);
  // (a wedge cut short at a label may be little longer than wide; a bar is long)
  if (long <= 0 || long < 1.2 * short) return null;
  const a = (p: Point) => (p.x - mid.x) * u.x + (p.y - mid.y) * u.y;
  const b = (p: Point) => -(p.x - mid.x) * u.y + (p.y - mid.y) * u.x;
  const band = (sign: number) => pts.filter((p) => sign * a(p) >= long / 2 - Math.max(0.12 * long, 0.6 * short));
  // (how wide it is a tenth of its length in from either end, where its edges cross there: an end cut
  // slanting - a wedge's wide end cut along the bond it meets - has one corner nearer than the other)
  const widthAt = (t: number) => {
    const bs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const [ap, aq] = [a(p), a(q)];
      if (ap === aq || (ap - t) * (aq - t) > 0) continue;
      bs.push(b(p) + ((b(q) - b(p)) * (t - ap)) / (aq - ap));
    }
    return bs.length >= 2 ? Math.max(...bs) - Math.min(...bs) : 0;
  };
  // (the wider end measured where it is widest in its half: one cut slanting far along - a tip rounded, its wide end cut
  // along the bond it meets for a sixth of its length - is narrower a tenth in)
  const widest = (sign: number) => Math.max(...[0.1, 0.2, 0.3, 0.4].map((f) => widthAt(sign * f * long)));
  const [n0, n1] = [widthAt(-0.4 * long), widthAt(0.4 * long)];
  const [m0, m1] = [widest(-1), widest(1)];
  const [w0, w1] = m1 >= m0 ? [n0, m1] : [m0, n1];
  const fill = Math.abs(area(pts)) / (long * short);
  const at = (t: number): Point => ({ x: mid.x + u.x * t, y: mid.y + u.y * t });
  if (!curved && Math.max(w0, w1) > 0 && Math.min(w0, w1) < 0.4 * Math.max(w0, w1) && fill > 0.35 && fill < 0.7) {
    // (its tip the middle of its narrow end's points; its base the middle of its wide end's outermost two, of
    // all its points that far along - so the middle of a wide end cut slanting)
    const toWide = w0 < w1 ? 1 : -1;
    const narrow = band(-toWide);
    const wide = pts.filter((p) => toWide * a(p) >= 0);
    const tip = narrow.reduce((p, q) => ({ x: p.x + q.x / narrow.length, y: p.y + q.y / narrow.length }), { x: 0, y: 0 });
    const lo = wide.reduce((p, q) => (b(q) < b(p) ? q : p));
    const hi = wide.reduce((p, q) => (b(q) > b(p) ? q : p));
    return { wedge: { tip, base: { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2 }, w: b(hi) - b(lo), outline: pts } };
  }
  if (fill > 0.75 && long >= 2.5 * short) return { stroke: { a: at(-long / 2), b: at(long / 2), w: short, outline: pts } };
  // (a wedge cut flat at its narrow end, a line's width across - four corners: its narrowest box lies along a
  // side, not down its middle, so it is told by its ends instead)
  const cut = curved ? null : flatTipped(pts);
  return cut ? { wedge: cut } : null;
}

/** A wedge drawn as four corners - its narrow end a short edge, its wide end the opposite one, far apart - or none. */
function flatTipped(given: Point[]): Wedge | null {
  const pts = given.filter((p, i) => dist(p, given[(i + 1) % given.length]) > 1e-3);
  if (pts.length !== 4) return null;
  const edge = (i: number) => [pts[i], pts[(i + 1) % 4]] as const;
  const length = (i: number) => dist(...edge(i));
  // (its ends: the two opposite edges shorter together)
  const [e, f] = length(0) + length(2) <= length(1) + length(3) ? [0, 2] : [1, 3];
  const [narrow, wide] = length(e) <= length(f) ? [e, f] : [f, e];
  const mid = (i: number) => {
    const [p, q] = edge(i);
    return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  };
  const [tip, base] = [mid(narrow), mid(wide)];
  // (each end as wide as it is across the way from one to the other: a wide end cut slanting along a bond is longer than wide)
  const l = dist(tip, base);
  if (!l) return null;
  const across = (i: number) => {
    const [p, q] = edge(i);
    return Math.abs(((q.x - p.x) * (base.y - tip.y) - (q.y - p.y) * (base.x - tip.x)) / l);
  };
  if (across(narrow) >= 0.4 * across(wide) || l < 2.5 * across(wide)) return null;
  return { tip, base, w: across(wide), outline: given };
}

/** The shapes a figure's paths make: what is drawn in paper's colour left out. */
export function shapesOf(drawn: FigureDrawn): Shapes {
  const out: Shapes = { strokes: [], wedges: [], curves: [], blobs: [] };
  // (each filled shape read as a line or as a shape of no kind, and its corners)
  const cornersOf = new Map<object, Point[]>();
  for (const path of drawn.paths) {
    const parts = partsOf(path.d);
    const filled = !blank(path.fill);
    const stroked = !blank(path.stroke) && path.width >= 0;
    if (filled) {
      const ink = path.fill!;
      // (a letter drawn as its outline - several parts in one path, curved, a hole in some - is a blob whole)
      const curved = parts.some((p) => p.straight.some((s) => !s));
      if (parts.length > 1 && curved) {
        const pts = parts.flatMap((p) => p.pts);
        out.blobs.push({ pts, parts: parts.map((p) => p.pts), box: boxOf(pts), curved, ink });
        continue;
      }
      for (const p of parts) {
        const pc = p.straight.some((s) => !s);
        const read = filledShape(p.pts, pc);
        if (read && "wedge" in read) {
          out.wedges.push({ ...read.wedge, ink });
          continue;
        }
        const made = read && "stroke" in read ? { ...read.stroke, ink } : { pts: p.pts, parts: [p.pts], box: boxOf(p.pts), curved: pc, ink };
        if ("a" in made) out.strokes.push(made);
        else out.blobs.push(made);
        if (!pc) cornersOf.set(made, p.pts);
      }
      if (!stroked) continue;
    }
    if (!stroked) continue;
    const w = Math.max(path.width, 0.1);
    const ink = path.stroke!;
    const dash = path.dash ? { dash: true as const } : {};
    for (const p of parts) {
      if (p.straight.every(Boolean)) {
        const pts = p.closed && dist(p.pts[0], p.pts[p.pts.length - 1]) > 1e-3 ? [...p.pts, p.pts[0]] : p.pts;
        for (let i = 1; i < pts.length; i++) if (dist(pts[i - 1], pts[i]) > 1e-3) out.strokes.push({ a: pts[i - 1], b: pts[i], w, ink, ...dash });
      } else {
        out.curves.push({ pts: p.pts, closed: p.closed, w, ink });
      }
    }
  }
  // (a line drawn again over a longer one - a joint drawn as short pieces along the bonds that meet there, as RDKit draws
  // one - is that line's, not a line of its own)
  out.strokes = out.strokes.filter((s) => !out.strokes.some((t) => t !== s && drawnOver(s, t)));
  // (a wedge drawn in two colours - black from its stereocentre to its middle, its wide half on in its atom's colour, as RDKit
  // draws one by default - is one wedge: a filled four-cornered shape of another colour, its narrow end at the wedge's wide one,
  // widening on the same way)
  out.wedges = out.wedges.map((w) => {
    const l = dist(w.tip, w.base);
    if (!l) return w;
    const u = { x: (w.base.x - w.tip.x) / l, y: (w.base.y - w.tip.y) / l };
    // (read as a shape of no kind, or as a line where it is long and its ends near as wide)
    for (const b of [...out.blobs, ...out.strokes]) {
      const pts = cornersOf.get(b);
      if (!pts || (b.ink ?? "") === (w.ink ?? "")) continue;
      const corners = pts.filter((p, i) => !pts.slice(0, i).some((q) => dist(p, q) < 1e-3));
      if (corners.length !== 4) continue;
      const near = corners.filter((p) => dist(p, w.base) <= 0.75 * w.w + 0.5);
      const far = corners.filter((p) => !near.includes(p));
      if (near.length !== 2 || far.length !== 2) continue;
      const end = { x: (far[0].x + far[1].x) / 2, y: (far[0].y + far[1].y) / 2 };
      const on = (end.x - w.base.x) * u.x + (end.y - w.base.y) * u.y;
      const off = Math.abs((end.x - w.base.x) * u.y - (end.y - w.base.y) * u.x);
      if (on <= 0 || off > 0.2 * on || dist(far[0], far[1]) <= dist(near[0], near[1])) continue;
      out.blobs = out.blobs.filter((x) => x !== b);
      out.strokes = out.strokes.filter((x) => x !== b);
      return { ...w, base: end, w: dist(far[0], far[1]), outline: [...(w.outline ?? []), ...corners] };
    }
    return w;
  });
  // (a wedge's edges stroked round it - filled, then outlined, as RDKit draws one - its own, no lines: each end at a corner of it)
  const atCorner = (p: Point, w: Wedge, d: number) => (w.outline ?? []).some((q) => dist(p, q) <= d);
  out.strokes = out.strokes.filter((s) => !out.wedges.some((w) => atCorner(s.a, w, Math.max(0.5, 2 * s.w)) && atCorner(s.b, w, Math.max(0.5, 2 * s.w))));
  // (a line drawn in two colours - a bond to an atom drawn in that atom's colour from its middle on, as RDKit draws one by
  // default - is one line: two lines of different colours, end to end along one way, nothing else ending where they meet)
  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i < out.strokes.length && !merged; i++) {
      for (let j = 0; j < out.strokes.length && !merged; j++) {
        const [s, t] = [out.strokes[i], out.strokes[j]];
        if (i === j || (s.ink ?? "") === (t.ink ?? "") || s.dash || t.dash || s.outline || t.outline) continue;
        const w = Math.max(s.w, t.w);
        if (dist(s.b, t.a) > w) continue;
        const ls = dist(s.a, s.b), lt = dist(t.a, t.b);
        if (!ls || !lt) continue;
        const cos = ((s.b.x - s.a.x) * (t.b.x - t.a.x) + (s.b.y - s.a.y) * (t.b.y - t.a.y)) / (ls * lt);
        if (cos < Math.cos((3 * Math.PI) / 180)) continue;
        // (a line side by side with it - a double bond's other, its colours changing at the same place - is no other ending there)
        const alongside = (o: Stroke) => {
          const lo = dist(o.a, o.b);
          return lo > 0 && Math.abs(((o.b.x - o.a.x) * (s.b.y - s.a.y) - (o.b.y - o.a.y) * (s.b.x - s.a.x)) / (lo * ls)) < Math.sin((3 * Math.PI) / 180);
        };
        const others = out.strokes.filter((o, k) => k !== i && k !== j && (dist(o.a, s.b) <= 2 * w || dist(o.b, s.b) <= 2 * w) && !alongside(o));
        if (others.length) continue;
        out.strokes[i] = { a: s.a, b: t.b, w: Math.max(s.w, t.w), ...(s.ink ? { ink: s.ink } : {}) };
        out.strokes.splice(j, 1);
        merged = true;
      }
    }
  }
  return out;
}

export function boxOf(pts: readonly Point[]): Box {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return [x0, y0, x1, y1];
}

/** A box turned about a point by a quarter or more: the box round its turned corners. */
function turnedBox(b: Box, turn: (p: Point) => Point): Box {
  return boxOf([turn({ x: b[0], y: b[1] }), turn({ x: b[2], y: b[1] }), turn({ x: b[0], y: b[3] }), turn({ x: b[2], y: b[3] })]);
}

/**
 * A figure whose words read other than left to right as the page shows it
 * - a scheme printed sideways, a page turned a quarter - turned so that
 * they do: by the quarter most of its letters read, turned back; and how a
 * point of the turned figure is taken back to the page. A figure whose
 * words read left to right, or that has none, is as it was.
 */
export function uprightOf(drawn: FigureDrawn): { drawn: FigureDrawn; back: (p: Point) => Point; quarters: number } {
  const votes = [0, 0, 0, 0];
  for (const l of drawn.letters) if (l.dir != null && Number.isFinite(l.dir)) votes[(((Math.round(l.dir / (Math.PI / 2)) % 4) + 4) % 4)]++;
  const quarters = votes.indexOf(Math.max(...votes));
  if (!quarters || !votes[quarters]) return { drawn, back: (p) => p, quarters: 0 };
  const a = -(quarters * Math.PI) / 2;
  const [c, s] = [Math.round(Math.cos(a)), Math.round(Math.sin(a))];
  const turn = (p: Point): Point => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c });
  const back = (p: Point): Point => ({ x: p.x * c + p.y * s, y: -p.x * s + p.y * c });
  const step = (st: PathStep): PathStep => {
    if (st[0] === "Z") return st;
    const q = turn({ x: st[1], y: st[2] });
    return [st[0], q.x, q.y];
  };
  return {
    drawn: {
      paths: drawn.paths.map((p) => ({ ...p, d: p.d.map(step) })),
      letters: drawn.letters.map((l) => {
        const at = l.at ? turn({ x: l.at[0], y: l.at[1] }) : null;
        return { ...l, box: turnedBox(l.box, turn), at: at ? [at.x, at.y] : null, ...(l.loose ? { loose: turnedBox(l.loose, turn) } : {}), ...(l.dir != null ? { dir: l.dir + a } : {}) };
      }),
      pictures: drawn.pictures.map((b) => turnedBox(b, turn)),
    },
    back,
    quarters,
  };
}

/** Whether line `s` lies on a longer line `t`, along it and within it, as one drawn again over it. */
function drawnOver(s: Stroke, t: Stroke): boolean {
  const lt = dist(t.a, t.b);
  if (lt <= 1.5 * dist(s.a, s.b)) return false;
  const u = { x: (t.b.x - t.a.x) / lt, y: (t.b.y - t.a.y) / lt };
  const ls = dist(s.a, s.b) || 1;
  const w = Math.max(s.w, t.w);
  // (its way, where it is long enough to have one: a piece a few widths long, its ends written to a hundredth, may seem turned)
  if (ls > 4 * w && Math.abs(u.x * (s.b.y - s.a.y) / ls - u.y * (s.b.x - s.a.x) / ls) > Math.sin((3 * Math.PI) / 180)) return false;
  const on = (p: Point) => {
    const along = (p.x - t.a.x) * u.x + (p.y - t.a.y) * u.y;
    return along >= -w && along <= lt + w && Math.abs((p.y - t.a.y) * u.x - (p.x - t.a.x) * u.y) <= w;
  };
  return on(s.a) && on(s.b);
}
