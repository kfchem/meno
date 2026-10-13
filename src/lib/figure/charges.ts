/**
 * Charges drawn in a ring beside an atom, as Meno draws them and many
 * papers do: a small circle - Meno's, a few dozen short pieces round it -
 * with a "+" (two strokes crossing) or a "-" (one) in it. Read as the charge
 * of the atom it is by, and nothing else: never a bond, a hash's stroke, nor
 * a scheme's "+" sign.
 */
import type { Point, Shapes } from "./drawn";

/** A charge drawn in a ring: its middle, its ring's radius, its sign, and what it is drawn with. */
export type ChargeMark = { at: Point; r: number; charge: 1 | -1; of: object[] };

const dist = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y);
const mid = (p: Point, q: Point): Point => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });

/** How large a piece of a ring is at most, in bonds; how near the next; how many make one; how large a ring is, at least and at most. */
const PIECE = 0.12;
const NEXT = 0.12;
const LEAST_PIECES = 8;
const RING = [0.05, 0.5] as const;
/** How many of the nearest pieces each is joined to: its ring's, on either side, before another ring's set close by. */
const NEAREST = 3;
/** How much of a ring may be missing, at most, in radians (a box drawn across one may cut some off). */
const OPEN = (2 * Math.PI) / 3;

/** The circle nearest `points`, by least squares (x² + y² + Dx + Ey + F = 0); none for points all in a line. */
function circleThrough(points: readonly Point[]): { at: Point; r: number } | null {
  // (about their mean: there x and y sum to nothing, F is minus the mean x² + y², and D, E come of the 2 x 2 rest)
  const m = { x: points.reduce((t, p) => t + p.x, 0) / points.length, y: points.reduce((t, p) => t + p.y, 0) / points.length };
  let xx = 0, xy = 0, yy = 0, xz = 0, yz = 0, z = 0;
  for (const p of points) {
    const x = p.x - m.x, y = p.y - m.y, zz = x * x + y * y;
    xx += x * x; xy += x * y; yy += y * y; xz += x * zz; yz += y * zz; z += zz;
  }
  const det = xx * yy - xy * xy;
  if (Math.abs(det) < 1e-12) return null;
  const d = -(xz * yy - yz * xy) / det, e = -(yz * xx - xz * xy) / det;
  const r = Math.sqrt((d * d + e * e) / 4 + z / points.length);
  return Number.isFinite(r) ? { at: { x: m.x - d / 2, y: m.y - e / 2 }, r } : null;
}

/** The charges `shapes` draw in rings, a figure's bonds `bond` long. */
export function chargeMarks(shapes: Shapes, bond: number): ChargeMark[] {
  if (!bond) return [];
  // the rings' pieces: small filled shapes, however they were read
  const pieces: { p: Point; of: object }[] = [];
  for (const b of shapes.blobs) {
    if (Math.max(b.box[2] - b.box[0], b.box[3] - b.box[1]) < PIECE * bond) pieces.push({ p: { x: (b.box[0] + b.box[2]) / 2, y: (b.box[1] + b.box[3]) / 2 }, of: b });
  }
  for (const w of shapes.wedges) if (dist(w.tip, w.base) < PIECE * bond) pieces.push({ p: mid(w.tip, w.base), of: w });
  for (const s of shapes.strokes) if (s.outline && dist(s.a, s.b) < PIECE * bond) pieces.push({ p: mid(s.a, s.b), of: s });
  // (each with its nearest: a ring of them one group, apart from another ring set close by)
  const group = pieces.map((_, i) => i);
  const root = (i: number): number => (group[i] === i ? i : (group[i] = root(group[i])));
  for (let i = 0; i < pieces.length; i++) {
    const near = pieces
      .map((q, j) => ({ j, d: dist(pieces[i].p, q.p) }))
      .filter((n) => n.j !== i && n.d < NEXT * bond)
      .sort((a, b) => a.d - b.d)
      .slice(0, NEAREST);
    for (const n of near) group[root(i)] = root(n.j);
  }
  const groups = new Map<number, typeof pieces>();
  pieces.forEach((p, i) => groups.set(root(i), [...(groups.get(root(i)) ?? []), p]));
  const marks: ChargeMark[] = [];
  for (const ring of groups.values()) {
    if (ring.length < LEAST_PIECES) continue;
    // a ring: its pieces as far from its middle, round most of it
    const circle = circleThrough(ring.map((q) => q.p));
    if (!circle) continue;
    const { at, r } = circle;
    if (r < RING[0] * bond || r > RING[1] * bond || ring.some((q) => Math.abs(dist(q.p, at) - r) > 0.25 * r)) continue;
    const angles = ring.map((q) => Math.atan2(q.p.y - at.y, q.p.x - at.x)).sort((a, b) => a - b);
    const gaps = angles.map((a, i) => (i ? a - angles[i - 1] : a + 2 * Math.PI - angles[angles.length - 1]));
    if (Math.max(...gaps) > OPEN) continue;
    // its sign: one stroke across its middle, and another square to it for a "+" (however the page is turned)
    const inside = shapes.strokes.filter((s) => !s.outline && dist(s.a, at) < 0.95 * r && dist(s.b, at) < 0.95 * r && dist(s.a, s.b) > 0.5 * r);
    if (inside.length < 1 || inside.length > 2 || inside.some((s) => dist(mid(s.a, s.b), at) > 0.3 * r)) continue;
    if (inside.length === 2) {
      const [s, t] = inside;
      const cos = ((s.b.x - s.a.x) * (t.b.x - t.a.x) + (s.b.y - s.a.y) * (t.b.y - t.a.y)) / (dist(s.a, s.b) * dist(t.a, t.b));
      if (Math.abs(cos) > 0.3) continue;
    }
    marks.push({ at, r, charge: inside.length === 2 ? 1 : -1, of: [...ring.map((q) => q.of), ...inside] });
  }
  return marks;
}

/** `shapes` without what the charges `marks` are drawn with. */
export function withoutMarks(shapes: Shapes, marks: readonly ChargeMark[]): Shapes {
  if (!marks.length) return shapes;
  const used = new Set(marks.flatMap((m) => m.of));
  return {
    strokes: shapes.strokes.filter((s) => !used.has(s)),
    wedges: shapes.wedges.filter((w) => !used.has(w)),
    curves: shapes.curves,
    blobs: shapes.blobs.filter((b) => !used.has(b)),
  };
}
