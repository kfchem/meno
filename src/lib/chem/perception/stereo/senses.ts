/**
 * How a drawing's bonds say a configuration, read from their places: the sign of the volume a centre's bonds span as drawn
 * (`drawnVolume`), the way an axis drawn flat turns (`drawnAxisSense`, by `torsionSense`), and the free corners of a tetrahedron two or
 * three of its bonds leave (`freeCorners`). Geometry only; the reader of a drawing (./from2d) and the layout's placing of wedges
 * (lib/layout/stereo, which imports them back) both go by them.
 */
import type { Axial } from "./types";

type Point = { x: number; y: number };
type Vec3 = [number, number, number];
const det = (a: Vec3, b: Vec3, c: Vec3) =>
  a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

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
 * drawn are read: the two bonds in the page, the shorter way round - but
 * where those two lie straight across the centre from each other, a T, it
 * says nothing: two plain bonds 180 degrees apart with a wedge between
 * them depict a T-shaped configuration, not a tetrahedral one (IUPAC 2006,
 * Brecher, Pure Appl. Chem. 78, 1897, ST-1.2.12), as the reader of a
 * drawing (./from2d) reads one.
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
  const v = neighbours.map((p, i): Vec3 | null => {
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
  return 0;
}

/** The sign of the torsion p-q-r-s, IUPAC's: + where, looking from q to r, p turns clockwise onto s. */
export function torsionSense(p: readonly number[], q: readonly number[], r: readonly number[], s: readonly number[]): 1 | -1 | 0 {
  const b1 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
  const b2 = [r[0] - q[0], r[1] - q[1], r[2] - q[2]];
  const b3 = [s[0] - r[0], s[1] - r[1], s[2] - r[2]];
  const c = [b2[1] * b3[2] - b2[2] * b3[1], b2[2] * b3[0] - b2[0] * b3[2], b2[0] * b3[1] - b2[1] * b3[0]];
  const v = b1[0] * c[0] + b1[1] * c[1] + b1[2] * c[2];
  return Math.abs(v) < 1e-9 ? 0 : v > 0 ? 1 : -1;
}

/**
 * How an axis drawn flat - `pos` - turns, where `lifted`, a neighbour of
 * its first end, stands `up` (+1) or down (-1) out of the page and the
 * rest are in it: its sense, as `Axial` has it, or 0.
 */
export function drawnAxisSense(
  pos: (a: number) => Point,
  axis: Omit<Axial, "sense">,
  lifted: number,
  up: 1 | -1,
): 1 | -1 | 0 {
  const [i, j] = axis.atoms;
  const [a, b] = axis.refs;
  // (the end's other neighbour stands the other way: the ring turned about the axis)
  const z = lifted === a ? up : -up;
  const at = (k: number, depth = 0) => [pos(k).x, pos(k).y, depth];
  return torsionSense(at(a, z), at(i), at(j), at(b));
}

/**
 * Where the bonds of a tetrahedral atom that are not among `us` (its bonds
 * given, as unit vectors) point: with three given, the one corner left;
 * with two, the two either side of their plane.
 */
export function freeCorners(us: readonly Vec3[]): Vec3[] {
  const away = unit(us.reduce((s, u) => [s[0] - u[0], s[1] - u[1], s[2] - u[2]] as Vec3, [0, 0, 0] as Vec3));
  if (us.length !== 2) return [away];
  const across = unit(cross(us[0], us[1]));
  const k = Math.cos((54.75 * Math.PI) / 180);
  const j = Math.sin((54.75 * Math.PI) / 180);
  return [
    [0, 1, 2].map((c) => away[c] * k + across[c] * j) as Vec3,
    [0, 1, 2].map((c) => away[c] * k - across[c] * j) as Vec3,
  ];
}
