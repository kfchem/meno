/**
 * Writing by hand on the page (docs/PRESENTING.md, *Handwriting*): what a
 * stroke draws - as thick as the pen was pressed where the system said, else
 * even, its ends tapered - worked out once for the canvas, for SVG and for
 * EMF alike; how what the pointer gives is smoothed as it comes, so that
 * nothing jumps when the pen is lifted; where a press takes a stroke; and
 * how far strokes reach.
 *
 * A stroke's points are on the page, in its units: x, y and how hard the pen
 * pressed there (0 to 1), one after another. A width is in points, as the
 * drawing's labels' size is, `pointPx` page units to the point.
 */
import type { Vec2 } from "./layout2d";
import { MENO_SET, type ColourSet } from "./palette";

/** What writes: a pen, or a marker - see-through, under the words. */
export type InkPen = "pen" | "marker";

/** A stroke: its points (x, y and the pressure at each), and whether the pressure was the pen's own. */
export type InkStroke = { points: number[]; pressure?: true };

/** The widths each pen writes in, in points: thin, regular and thick. */
export const INK_WIDTHS_PT: Record<InkPen, readonly [number, number, number]> = { pen: [0.75, 1.5, 3], marker: [6, 10, 16] };
/** How see-through a marker is. */
export const MARKER_OPACITY = 0.38;

/** The colour a marker writes in when it is given none of its own: the first of the colour set in use (`set`). */
export function markerColour(set: ColourSet): string {
  return set.colours[0] ?? MENO_SET.colours[0];
}

/** A stroke's points as places. */
export function placesOf(s: InkStroke): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i + 1 < s.points.length; i += 3) out.push({ x: s.points[i], y: s.points[i + 1] });
  return out;
}

/** Whether a stroke's points are all at one place: a dot. */
function isDot(pts: readonly Vec2[]): boolean {
  return pts.length === 1 || pts.every((p) => Math.hypot(p.x - pts[0].x, p.y - pts[0].y) < 1e-9);
}

/** How thick a stroke is at each point, as a share of its width: as pressed, where it was; else even, tapered over its ends. */
function thickness(s: InkStroke, pts: readonly Vec2[], width: number, taper: boolean): number[] {
  const n = pts.length;
  if (s.pressure) return pts.map((_, i) => 0.35 + 1.3 * Math.max(0, Math.min(1, s.points[3 * i + 2] ?? 0.5)));
  if (!taper) return pts.map(() => 1);
  // (along it, from each end)
  const along = [0];
  for (let i = 1; i < n; i++) along.push(along[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = along[n - 1];
  const reach = Math.min(2.5 * width, total / 3);
  return along.map((d) => (reach > 0 ? 0.3 + 0.7 * Math.min(1, d / reach, (total - d) / reach) : 1));
}

/** Points round a half circle about `c`, from the direction `a` turning clockwise to its opposite, `r` out: from a stroke's left side round its end to its right, outward. */
function cap(c: Vec2, a: number, r: number, out: Vec2[]): void {
  const steps = 6;
  for (let k = 1; k < steps; k++) {
    const t = a - (Math.PI * k) / steps;
    out.push({ x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) });
  }
}

/**
 * A stroke's outline, `width` wide at its fullest (in the page's units): up
 * one side, round its end, back down the other and round its start - one
 * polygon, filled as one (it may cross itself where the stroke does). A
 * dot, where it is one point.
 */
export function strokeOutline(s: InkStroke, width: number, taper = true): Vec2[] {
  const pts = placesOf(s);
  if (!pts.length) return [];
  const half = width / 2;
  if (isDot(pts)) {
    const r = half * (s.pressure ? 0.35 + 1.3 * (s.points[2] ?? 0.5) : 1);
    return Array.from({ length: 12 }, (_, k) => ({ x: pts[0].x + r * Math.cos((k * Math.PI) / 6), y: pts[0].y + r * Math.sin((k * Math.PI) / 6) }));
  }
  const w = thickness(s, pts, width, taper).map((f) => f * half);
  const n = pts.length;
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    left.push({ x: pts[i].x + nx * w[i], y: pts[i].y + ny * w[i] });
    right.push({ x: pts[i].x - nx * w[i], y: pts[i].y - ny * w[i] });
  }
  const out: Vec2[] = [...left];
  const end = Math.atan2(pts[n - 1].y - pts[n - 2].y, pts[n - 1].x - pts[n - 2].x);
  cap(pts[n - 1], end + Math.PI / 2, w[n - 1], out);
  for (let i = n - 1; i >= 0; i--) out.push(right[i]);
  const start = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
  cap(pts[0], start - Math.PI / 2, w[0], out);
  return out;
}

/**
 * A stroke as triangles, for the canvas: the pairs of points either side
 * of it as it goes, and indices among them, three for each triangle - a
 * strip that never needs a crossing outline cut up - and its ends round.
 */
export function strokeTriangles(s: InkStroke, width: number, taper = true): { positions: number[]; indices: number[] } {
  const outline = strokeOutline(s, width, taper);
  const pts = placesOf(s);
  const positions: number[] = [];
  const indices: number[] = [];
  if (!outline.length) return { positions, indices };
  if (isDot(pts)) {
    // (a dot: a fan about its middle)
    positions.push(pts[0].x, pts[0].y);
    for (const p of outline) positions.push(p.x, p.y);
    for (let k = 1; k <= outline.length; k++) indices.push(0, k, (k % outline.length) + 1);
    return { positions, indices };
  }
  // (the outline holds n left points, a cap, n right points backwards, a cap)
  const n = pts.length;
  const capN = (outline.length - 2 * n) / 2;
  for (const p of outline) positions.push(p.x, p.y);
  const leftAt = (i: number) => i;
  const rightAt = (i: number) => n + capN + (n - 1 - i);
  for (let i = 0; i < n - 1; i++) indices.push(leftAt(i), rightAt(i), leftAt(i + 1), leftAt(i + 1), rightAt(i), rightAt(i + 1));
  // (each end's cap: a fan from that end's middle)
  const fan = (centre: Vec2, from: number, capFirst: number, to: number) => {
    const c = positions.length / 2;
    positions.push(centre.x, centre.y);
    const ring = [from, ...Array.from({ length: capN }, (_, k) => capFirst + k), to];
    for (let k = 0; k + 1 < ring.length; k++) indices.push(c, ring[k], ring[k + 1]);
  };
  fan(pts[n - 1], leftAt(n - 1), n, rightAt(n - 1));
  fan(pts[0], rightAt(0), 2 * n + capN, leftAt(0));
  return { positions, indices };
}

/** Whether a press at `p` takes the stroke: within `reach` of its line, besides half its width. */
export function strokeHit(s: InkStroke, p: Vec2, reach: number, width: number): boolean {
  const pts = placesOf(s);
  const r = reach + width / 2;
  if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y) <= r;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    if (Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)) <= r) return true;
  }
  return false;
}

/** The box round strokes `width` wide - none, with none. */
export function strokesBounds(strokes: readonly InkStroke[], width: number): { x0: number; y0: number; x1: number; y1: number } | null {
  let b: { x0: number; y0: number; x1: number; y1: number } | null = null;
  const h = width;
  for (const s of strokes)
    for (const p of placesOf(s)) {
      b = b ? { x0: Math.min(b.x0, p.x - h), y0: Math.min(b.y0, p.y - h), x1: Math.max(b.x1, p.x + h), y1: Math.max(b.y1, p.y + h) } : { x0: p.x - h, y0: p.y - h, x1: p.x + h, y1: p.y + h };
    }
  return b;
}

/** A stroke moved by `d`. */
export function strokeMoved(s: InkStroke, d: Vec2): InkStroke {
  const points = s.points.slice();
  for (let i = 0; i + 1 < points.length; i += 3) {
    points[i] += d.x;
    points[i + 1] += d.y;
  }
  return { ...s, points };
}

/**
 * The 1€ filter (Casiez, Roussel and Vogel, CHI 2012): a low-pass filter
 * whose cutoff rises with speed, so that a slow hand's jitter is taken out
 * and a quick one is not lagged behind. `minCutoff` in hertz; `beta`, how
 * far the cutoff rises with speed; time in seconds.
 */
export class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private t = 0;
  constructor(
    private readonly minCutoff = 1.2,
    private readonly beta = 0.02,
    private readonly dCutoff = 1,
  ) {}
  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  /** The value `v` at time `t`, filtered. */
  next(v: number, t: number): number {
    if (this.x == null) {
      this.x = v;
      this.t = t;
      return v;
    }
    const dt = Math.max(t - this.t, 1e-3);
    this.t = t;
    const ad = OneEuro.alpha(this.dCutoff, dt);
    this.dx = ad * ((v - this.x) / dt) + (1 - ad) * this.dx;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    const a = OneEuro.alpha(cutoff, dt);
    this.x = a * v + (1 - a) * this.x;
    return this.x;
  }
}

/** Points nearer to the one before than `least` dropped - the last kept - so a stroke holds no more points than its shape needs. */
export function thinned(points: readonly number[], least: number): number[] {
  const out: number[] = [];
  const n = points.length / 3;
  for (let i = 0; i < n; i++) {
    const x = points[3 * i];
    const y = points[3 * i + 1];
    const k = out.length;
    if (k && i < n - 1 && Math.hypot(x - out[k - 3], y - out[k - 2]) < least) continue;
    out.push(x, y, points[3 * i + 2]);
  }
  return out;
}

/** A stroke carried round `about` by `angle`. */
export function strokeTurned(s: InkStroke, about: Vec2, angle: number): InkStroke {
  const c = Math.cos(angle);
  const sn = Math.sin(angle);
  const points = s.points.slice();
  for (let i = 0; i + 1 < points.length; i += 3) {
    const dx = points[i] - about.x;
    const dy = points[i + 1] - about.y;
    points[i] = about.x + dx * c - dy * sn;
    points[i + 1] = about.y + dx * sn + dy * c;
  }
  return { ...s, points };
}

/** How wide a piece of writing is, in the page's units. */
export function inkWidth(k: { pen: InkPen; width: 0 | 1 | 2 }, pointPx: number): number {
  return INK_WIDTHS_PT[k.pen][k.width] * pointPx;
}

/** The colour a piece is written in: its own, or its pen's - a pen's the drawing's `ink`, a marker's `marker` (`markerColour`). */
export function inkColour(k: { pen: InkPen; color?: string }, ink: string, marker: string): string {
  return k.color ?? (k.pen === "marker" ? marker : ink);
}

/**
 * Whether a stroke's points - x, y and pressure each - tell a pressure:
 * not so where every one is the same, as a pen that tells none gives (0.5
 * throughout), which is then written as a mouse writes - even, its ends
 * tapered - not as a pen pressed evenly from end to end.
 */
export function pressureFelt(points: readonly number[]): boolean {
  for (let i = 5; i < points.length; i += 3) if (points[i] !== points[2]) return true;
  return false;
}
