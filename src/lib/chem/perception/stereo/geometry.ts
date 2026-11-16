/**
 * The geometry of a configuration, written once (foundation part 4): the sign of a permutation (`parity`), the sign of a volume
 * (`volumeSign`), the sign of a torsion (`torsionSense`) and which side of a line two places are on (`sideOfLine`). Every reader of a
 * configuration from places - a drawing's, a molecule's in 3D, a SMILES's centres put in order - goes by these, so that two of them cannot
 * read one configuration two ways.
 *
 * **The one convention of a volume:** the three vectors from the centre - or from a fourth place - to three places, in the order given, and
 * the sign of their triple product u . (v x w). It is +1 where the three, in that order, run CLOCKWISE seen from the centre looking out at
 * them (counter-clockwise seen from outside looking in); the unit axes x, y, z from the origin are +1. It is `Tetrahedral.volume`'s.
 *
 * **The tolerances** stay what each user had; each is named here, with its user, its units and what it does at zero:
 *
 * | name | user | at zero | units |
 * |---|---|---|---|
 * | `FLAT_VOLUME_3D` | `stereoOpen` `configuredFrom` | under it: no configuration (a centre, and a double bond's side test) | A^3 (A^4 for the side test) |
 * | `FLAT_VOLUME_DRAWN` | `layout/readBack` | under it: not counted as turned | drawing units (bond lengths) cubed |
 * | `EXACT` | `lonePairsIn3d` (after its angle sum), `pageMirror`, `edit3d`, `compareBonding`, `referenceNumbering` | the exact sign, 0 only at 0 | A^3 |
 * | `HANDED` | `settle` | at or under it: no way round | A^3 (a tetrahedral centre's are some 0.9) |
 * | `IN_LINE_VOLUME` | `torsionSense` | under it: 0 | its caller's lengths cubed |
 *
 * No basis from a text is claimed for any of them: they are each user's own, kept as they were (a move: no answer changes).
 */

/** Under this, a volume in 3D (A^3) says no configuration: `stereoOpen` `configuredFrom`'s centres; its double bonds' side test, in A^4. */
export const FLAT_VOLUME_3D = 1e-6;
/** Under this, a volume as drawn (bond lengths cubed) says nothing turned: `layout/readBack`. One number with `FLAT_VOLUME_3D`, another unit. */
export const FLAT_VOLUME_DRAWN = 1e-6;
/** The exact sign: 0 only where the volume is exactly 0. */
export const EXACT = 0;
/**
 * The least triple product, in cubic angstroms, that says which way round three bonds go (`settle`): a tetrahedral centre's are some 0.9; a
 * planar one's (an =CH2's) are nought but for noise, which says no way round - a hundredth of an angstrom in a place can turn its sign, and
 * its hydrogens are then told apart by their fit alone. At or under it: no way round.
 */
export const HANDED = 0.05;
/** Under this, a torsion's triple product (its caller's lengths cubed) is 0: the four in a plane or a line. */
export const IN_LINE_VOLUME = 1e-9;

type V3 = readonly [number, number, number] | readonly number[];

/**
 * The sign of the permutation that sorts distinct numbers `xs` rising: +1 for an even one, -1 for an odd. An H's stand-in is the caller's
 * own (-1 to sort it first, Infinity to sort it last): never made one, since the same neighbours give opposite signs by the two - each right
 * for its own target order.
 */
export function parity(xs: readonly number[]): 1 | -1 {
  let sign: 1 | -1 = 1;
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) if (xs[i] > xs[j]) sign = sign === 1 ? -1 : 1;
  return sign;
}

/**
 * The sign of the volume three places `a`, `b`, `c` span seen from `from` (the origin where none is given): the triple product of the
 * vectors from it to them, in order (see the header) - 0 where its size is at or under `tolerance` (0: only where it is exactly 0).
 */
export function volumeSign(a: V3, b: V3, c: V3, from: V3 = [0, 0, 0], tolerance = EXACT): 1 | -1 | 0 {
  const v = signedVolume(a, b, c, from);
  return Math.abs(v) <= tolerance ? 0 : v > 0 ? 1 : -1;
}

/** The signed volume three places span seen from `from`: u . (v x w), u, v, w the vectors from it to them, in order. */
export function signedVolume(a: V3, b: V3, c: V3, from: V3 = [0, 0, 0]): number {
  const [u0, u1, u2] = [a[0] - from[0], a[1] - from[1], a[2] - from[2]];
  const [v0, v1, v2] = [b[0] - from[0], b[1] - from[1], b[2] - from[2]];
  const [w0, w1, w2] = [c[0] - from[0], c[1] - from[1], c[2] - from[2]];
  return u0 * (v1 * w2 - v2 * w1) - u1 * (v0 * w2 - v2 * w0) + u2 * (v0 * w1 - v1 * w0);
}

/** The sign of the torsion p-q-r-s, IUPAC's: + where, looking from q to r, p turns clockwise onto s; 0 under `IN_LINE_VOLUME`. */
export function torsionSense(p: V3, q: V3, r: V3, s: V3): 1 | -1 | 0 {
  const b1 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
  const b2 = [r[0] - q[0], r[1] - q[1], r[2] - q[2]];
  const b3 = [s[0] - r[0], s[1] - r[1], s[2] - r[2]];
  const c = [b2[1] * b3[2] - b2[2] * b3[1], b2[2] * b3[0] - b2[0] * b3[2], b2[0] * b3[1] - b2[1] * b3[0]];
  const v = b1[0] * c[0] + b1[1] * c[1] + b1[2] * c[2];
  return Math.abs(v) < IN_LINE_VOLUME ? 0 : v > 0 ? 1 : -1;
}

/**
 * Which side of the line through `a` and `b` two places `p` (bonded to `a`) and `q` (bonded to `b`) are on, in 3D: the dot product of
 * (axis x (p - a)) and (axis x (q - b)), the axis b - a - positive where they are on one side (cis), negative where on opposite sides
 * (trans), 0 where one of them lies on the line.
 */
export function sideOfLine(a: V3, b: V3, p: V3, q: V3): number {
  const axis = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const cross = (u: readonly number[], v: readonly number[]) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const s = cross(axis, [p[0] - a[0], p[1] - a[1], p[2] - a[2]]);
  const t = cross(axis, [q[0] - b[0], q[1] - b[1], q[2] - b[2]]);
  return s[0] * t[0] + s[1] * t[1] + s[2] * t[2];
}
