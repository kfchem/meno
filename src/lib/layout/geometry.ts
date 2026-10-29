/** Plane geometry for the layout engine: points, turns and mirrors. */

export type Point = { x: number; y: number };

export const pt = (x: number, y: number): Point => ({ x, y });
export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
export const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x;
export const len = (a: Point): number => Math.hypot(a.x, a.y);
export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
export const angleOf = (a: Point): number => Math.atan2(a.y, a.x);
/** The unit vector at `angle` radians. */
export const dir = (angle: number): Point => ({ x: Math.cos(angle), y: Math.sin(angle) });
export const rad = (deg: number): number => (deg * Math.PI) / 180;
export const deg = (r: number): number => (r * 180) / Math.PI;

export function norm(a: Point): Point {
  const l = len(a);
  return l > 1e-12 ? { x: a.x / l, y: a.y / l } : { x: 1, y: 0 };
}

export function rotate(a: Point, angle: number): Point {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}

/** An angle brought into (-pi, pi]. */
export function wrap(angle: number): number {
  let a = angle % (2 * Math.PI);
  if (a <= -Math.PI) a += 2 * Math.PI;
  if (a > Math.PI) a -= 2 * Math.PI;
  return a;
}

/** The reflection of `p` in the line through `a` and `b`. */
export function mirror(p: Point, a: Point, b: Point): Point {
  const d = norm(sub(b, a));
  const v = sub(p, a);
  const along = scale(d, dot(v, d));
  const across = sub(v, along);
  return add(a, sub(along, across));
}

export function centroid(points: readonly Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  const n = Math.max(points.length, 1);
  return { x: x / n, y: y / n };
}

/**
 * How near, in bond lengths, an atom's mirror image must land on its partner
 * for a drawing to be its own mirror image: a drawing laid out symmetric is,
 * one with an atom a tenth of a bond off it is not.
 */
export const MIRROR_TOL = 0.05;

/**
 * The lines a drawing is its own mirror image in, as their directions in
 * radians (0 to pi): every point reflected lands within `tol` of a point of
 * the same kind, and every edge on an edge of the same kind. Such a line
 * passes through the points' centroid, and either the first point lies on
 * it or its partner lies across it: its partners give every line there can
 * be.
 */
export function mirrorLines(
  points: readonly Point[],
  kinds: readonly string[],
  edges: readonly (readonly [number, number, string])[],
  tol: number,
): number[] {
  const n = points.length;
  if (n < 2) return [];
  const c = centroid(points);
  const edgeKind = new Map<string, string>();
  for (const [a, b, k] of edges) edgeKind.set(a < b ? `${a},${b}` : `${b},${a}`, k);
  const r0 = dist(points[0], c);
  const lines: number[] = [];
  for (let j = 0; j < n; j++) {
    if (kinds[j] !== kinds[0] || Math.abs(dist(points[j], c) - r0) > tol) continue;
    // (the line through the first point, where it is its own partner; the
    // perpendicular bisector of the two otherwise)
    let t: number;
    if (j === 0) {
      if (r0 <= tol) continue;
      t = angleOf(sub(points[0], c));
    } else {
      const d = sub(points[j], points[0]);
      if (len(d) <= tol) continue;
      t = angleOf(d) + Math.PI / 2;
    }
    t = ((t % Math.PI) + Math.PI) % Math.PI;
    if (lines.some((u) => Math.abs(wrap(2 * (u - t))) < 1e-6)) continue;
    const far = add(c, dir(t));
    const image: number[] = [];
    for (let a = 0; a < n; a++) {
      const m = mirror(points[a], c, far);
      const b = points.findIndex((q, i) => kinds[i] === kinds[a] && dist(q, m) <= tol);
      if (b < 0) break;
      image.push(b);
    }
    if (image.length < n) continue;
    const kept = edges.every(([a, b, k]) => {
      const p = image[a];
      const q = image[b];
      return edgeKind.get(p < q ? `${p},${q}` : `${q},${p}`) === k;
    });
    if (kept) lines.push(t);
  }
  return lines;
}

/** Whether p lies inside the polygon (even-odd). */
export function insidePolygon(p: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Whether segments ab and cd cross (not merely touch at an end). */
export function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point) => Math.sign(cross(sub(q, p), sub(r, p)));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/**
 * The directions free round a ring atom: `count` of them splitting evenly the
 * widest gap between its bonds that no ring lies in (a ring lies in the gap
 * its centre is seen in). At a fusion of three rings every gap is 120
 * degrees, and only one of them is outside.
 */
export function splitOutside(
  taken: readonly number[],
  ringCentres: readonly number[],
  count: number,
): number[] {
  if (count <= 0) return [];
  const sorted = [...taken].sort((p, q) => p - q);
  if (sorted.length < 2) return splitWidestGap(taken, count);
  let from = sorted[0];
  let gap = -1;
  sorted.forEach((t, i) => {
    const next = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 2 * Math.PI;
    const inside = ringCentres.some((c) => {
      let u = c - t;
      while (u < 0) u += 2 * Math.PI;
      while (u >= 2 * Math.PI) u -= 2 * Math.PI;
      return u > 1e-6 && u < next - t - 1e-6;
    });
    if (!inside && next - t > gap + 1e-9) {
      gap = next - t;
      from = t;
    }
  });
  if (gap < 0) return splitWidestGap(taken, count);
  // two on one ring atom - a gem-dimethyl - close together, 60 degrees
  // apart either side of straight out, as they are always drawn; not
  // spread evenly over the room
  if (count === 2 && gap > Math.PI / 2) {
    const mid = from + gap / 2;
    const half = Math.min(Math.PI / 6, gap / 4);
    return [mid - half, mid + half];
  }
  return Array.from({ length: count }, (_, i) => from + (gap * (i + 1)) / (count + 1));
}

/**
 * The directions free around a point, given the directions already taken:
 * `count` directions splitting the widest gap between them evenly. With
 * nothing taken, `count` directions evenly round, the first at `start`.
 */
export function splitWidestGap(taken: readonly number[], count: number, start = 0): number[] {
  if (count <= 0) return [];
  if (!taken.length) {
    return Array.from({ length: count }, (_, i) => start + (i * 2 * Math.PI) / count);
  }
  const sorted = [...taken].sort((p, q) => p - q);
  let from = sorted[0];
  let gap = -1;
  sorted.forEach((t, i) => {
    const next = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 2 * Math.PI;
    if (next - t > gap + 1e-9) {
      gap = next - t;
      from = t;
    }
  });
  return Array.from({ length: count }, (_, i) => from + (gap * (i + 1)) / (count + 1));
}

type V3 = [number, number, number];
const det = (a: V3, b: V3, c: V3) =>
  a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);

/**
 * The sign of the volume a centre's first three neighbours span as drawn,
 * or 0 where the drawing does not say. With the first three all in the
 * page, the fourth, on its wedge, says it: it stands opposite them.
 *
 * All four bonds drawn, what is read is the way they run round the centre
 * and which of them stand out of the page, as a reader reads it (and
 * RDKit): each is taken as a direction, spread evenly round the centre in
 * the order it is drawn in - a wedge out of the page, hashes behind it, and
 * the bonds in the page leaning a little the other way, as a tetrahedral
 * centre's do. Read from the angles as drawn, three bonds in the page that
 * all lie within 180 degrees of each other - a drawing can come to that -
 * could say one thing with two of them and the wedge, and the opposite
 * with the other two. With three drawn and the H left out, the angles as
 * drawn are read: the two bonds in the page, the shorter way round - and
 * where those two lie straight across the centre from each other, a T,
 * the H is read as a bond in the page in the widest gap, as RDKit reads it.
 */
export function drawnVolume(
  at: Point,
  neighbours: readonly (Point | null)[],
  lift: readonly number[],
): number {
  const drawn = neighbours.flatMap((p, i) => (p ? [{ i, angle: Math.atan2(p.y - at.y, p.x - at.x) }] : []));
  const lean = -drawn.reduce((s, { i }) => s + lift[i], 0) / 3;
  drawn.sort((p, q) => p.angle - q.angle);
  const round = new Map(drawn.map(({ i, angle }, k) => [i, drawn.length >= 4 ? (2 * Math.PI * k) / drawn.length : angle]));
  const v = neighbours.map((p, i): V3 | null => {
    if (!p) return null;
    const a = round.get(i)!;
    return [Math.cos(a), Math.sin(a), lift[i] || (drawn.length >= 4 ? lean : 0)];
  });
  if (v[0] && v[1] && v[2]) {
    const d = det(v[0], v[1], v[2]);
    if (Math.abs(d) > 1e-6) return Math.sign(d);
  }
  if (v[0] && v[1] && v[3]) {
    const d = -det(v[0], v[1], v[3]);
    if (Math.abs(d) > 1e-6) return Math.sign(d);
  }
  const h = neighbours.indexOf(null);
  if (drawn.length === 3 && neighbours.length === 4 && h >= 0) {
    // (a T: the H in the widest gap, in the page)
    let widest = 0;
    let across = 0;
    drawn.forEach((p, k) => {
      const next = k + 1 < drawn.length ? drawn[k + 1].angle : drawn[0].angle + 2 * Math.PI;
      if (next - p.angle > widest) {
        widest = next - p.angle;
        across = p.angle + widest / 2;
      }
    });
    const withH = neighbours.map((p, i) => (i === h ? { x: at.x + Math.cos(across), y: at.y + Math.sin(across) } : p));
    return drawnVolume(at, withH, lift);
  }
  return 0;
}
