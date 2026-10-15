/**
 * How far apart two geometries of the same atoms, in the same order, are
 * once laid over each other as well as they go: the root-mean-square
 * deviation after the best fit, by the quaternion method (B. K. P. Horn,
 * J. Opt. Soc. Am. A 4, 629 (1987); E. A. Coutsias, C. Seok and K. A. Dill,
 * J. Comput. Chem. 25, 1849 (2004)) - the largest eigenvalue of a 4 x 4
 * matrix built from the two, found by Jacobi's method. Atoms are taken in
 * their own order: symmetric atoms swapped are not seen as the same.
 */

/** The RMSD between two geometries, x, y and z by atom in turn, of as many atoms, after the best fit; in their units. */
export function rmsd(p: readonly number[], q: readonly number[]): number {
  const n = Math.min(p.length, q.length) / 3;
  if (n < 1) return 0;
  return rmsdCentred(centred(p, n), centred(q, n));
}

/** A geometry about its centre - x, y and z by atom in turn - and the sum of its atoms' squared distances from it: what `rmsdCentred` takes, worked out once for a geometry compared with many. */
export type Centred = { xyz: Float64Array; g: number };

/** A geometry's first `n` atoms about their centre (`n`, all of them). */
export function centred(xyz: readonly number[], n = Math.floor(xyz.length / 3)): Centred {
  const c = centre(xyz, n);
  const out = new Float64Array(3 * n);
  let g = 0;
  for (let i = 0; i < 3 * n; i++) {
    out[i] = xyz[i] - c[i % 3];
    g += out[i] * out[i];
  }
  return { xyz: out, g };
}

/** The RMSD between two geometries about their centres, of as many atoms, after the best fit. */
export function rmsdCentred(a: Centred, b: Centred): number {
  const n = Math.min(a.xyz.length, b.xyz.length) / 3;
  if (n < 1) return 0;
  // the correlation of the two
  let xx = 0, xy = 0, xz = 0, yx = 0, yy = 0, yz = 0, zx = 0, zy = 0, zz = 0;
  const p = a.xyz;
  const q = b.xyz;
  for (let i = 0; i < 3 * n; i += 3) {
    const [px, py, pz, qx, qy, qz] = [p[i], p[i + 1], p[i + 2], q[i], q[i + 1], q[i + 2]];
    xx += px * qx; xy += px * qy; xz += px * qz;
    yx += py * qx; yy += py * qy; yz += py * qz;
    zx += pz * qx; zy += pz * qy; zz += pz * qz;
  }
  const m = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ];
  const most = largest(m, (a.g + b.g) / 2);
  return Math.sqrt(Math.max(0, (a.g + b.g - 2 * most) / n));
}

/**
 * The largest eigenvalue of the symmetric, traceless 4 x 4 matrix above:
 * the largest root of its characteristic polynomial - λ⁴ - (t₂/2) λ² -
 * (t₃/3) λ + det, its coefficients from the traces of its square (t₂) and
 * cube (t₃), Newton's identities - found by Newton's method from `above`,
 * a bound no root is over (half the two geometries' summed squares). Its
 * roots all real, the steps come down to the largest root and no further,
 * each lower than the last until the numbers can go no lower. Where the
 * largest root is there more than once (a straight molecule's), Jacobi's
 * rotations find it.
 */
function largest(m: readonly (readonly number[])[], above: number): number {
  let t2 = 0;
  let t3 = 0;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      t2 += m[i][j] * m[j][i];
      for (let k = 0; k < 4; k++) t3 += m[i][j] * m[j][k] * m[k][i];
    }
  }
  const c2 = -t2 / 2;
  const c1 = -t3 / 3;
  const c0 = det4(m);
  // (down from above, each step lower, until one is not: then as near as the numbers go - an RMSD of two near copies is the difference of two near sums, and wants the last digit)
  const at = (x: number) => {
    const x2 = x * x;
    return { f: x2 * x2 + c2 * x2 + c1 * x + c0, df: 4 * x2 * x + 2 * c2 * x + c1, scale: 4 * Math.abs(x2 * x) + 2 * Math.abs(c2 * x) + Math.abs(c1) };
  };
  let x = above;
  for (let step = 0; step < 100; step++) {
    const { f, df } = at(x);
    // (at the root, or past it by the numbers: there)
    if (!(f > 0) || !(df > 0)) break;
    const next = x - f / df;
    if (!(next < x)) break;
    x = next;
  }
  // (a root more than once - two eigenvalues alike, as a straight molecule's are - is where the slope is nought: Newton's steps neither find it surely nor fast, and Jacobi's rotations do)
  const { df, scale } = at(x);
  return df > 1e-6 * scale ? x : Math.max(...eigenvalues(m));
}

/** A 4 x 4 matrix's determinant, by its first row's cofactors. */
function det4(m: readonly (readonly number[])[]): number {
  const d3 = (a: number, b: number, c: number, r: readonly number[][]) =>
    r[0][a] * (r[1][b] * r[2][c] - r[1][c] * r[2][b]) - r[0][b] * (r[1][a] * r[2][c] - r[1][c] * r[2][a]) + r[0][c] * (r[1][a] * r[2][b] - r[1][b] * r[2][a]);
  const rest = [m[1], m[2], m[3]] as number[][];
  return m[0][0] * d3(1, 2, 3, rest) - m[0][1] * d3(0, 2, 3, rest) + m[0][2] * d3(0, 1, 3, rest) - m[0][3] * d3(0, 1, 2, rest);
}

/**
 * How far a geometry's atoms spread about their centre: the root-mean-square
 * of their distances from it (the radius of gyration, every atom counted
 * alike). Two geometries' RMSD after the best fit is never less than the
 * difference of theirs - turned or not, a geometry about its centre is as
 * long as it was, and the difference of two is at least as long as the
 * difference of their lengths - so a pair whose spreads differ by more
 * than a bound is farther apart than it without being laid over each other.
 */
export function spread(xyz: readonly number[]): number {
  const n = xyz.length / 3;
  if (n < 1) return 0;
  const c = centre(xyz, n);
  let sum = 0;
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) sum += (xyz[3 * i + a] - c[a]) ** 2;
  return Math.sqrt(sum / n);
}

function centre(xyz: readonly number[], n: number): [number, number, number] {
  const c: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) c[a] += xyz[3 * i + a] / n;
  return c;
}

/** A symmetric matrix's eigenvalues, by Jacobi's rotations: each off-diagonal element turned to nought in turn until none is left. */
export function eigenvalues(given: readonly (readonly number[])[]): number[] {
  const a = given.map((r) => r.slice());
  const n = a.length;
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const kp = a[k][p];
          const kq = a[k][q];
          a[k][p] = c * kp - s * kq;
          a[k][q] = s * kp + c * kq;
        }
        for (let k = 0; k < n; k++) {
          const pk = a[p][k];
          const qk = a[q][k];
          a[p][k] = c * pk - s * qk;
          a[q][k] = s * pk + c * qk;
        }
      }
    }
  }
  return a.map((r, i) => r[i]);
}
