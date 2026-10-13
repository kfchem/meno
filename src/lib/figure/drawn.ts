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
  const [w0, w1] = [widthAt(-0.4 * long), widthAt(0.4 * long)];
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
  return null;
}

/** The shapes a figure's paths make: what is drawn in paper's colour left out. */
export function shapesOf(drawn: FigureDrawn): Shapes {
  const out: Shapes = { strokes: [], wedges: [], curves: [], blobs: [] };
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
        if (read && "stroke" in read) out.strokes.push({ ...read.stroke, ink });
        else if (read && "wedge" in read) out.wedges.push({ ...read.wedge, ink });
        else out.blobs.push({ pts: p.pts, parts: [p.pts], box: boxOf(p.pts), curved: pc, ink });
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
