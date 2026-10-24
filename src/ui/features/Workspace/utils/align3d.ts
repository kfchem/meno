import type { Turn3D } from "../store/types";

/**
 * The turn that lays points in 3D best over points on the page: of all
 * rotations, the one taking `from` (x, y and z in turn, about their own
 * centre) nearest to `to` (x and y in turn, about theirs, on the page) - as
 * the quaternion x, y, z, w. Horn's: the eigenvector of the largest
 * eigenvalue of his 4 x 4 matrix, found by Jacobi's sweeps.
 */
export function turnOnto(from: ArrayLike<number>, to: ArrayLike<number>): Turn3D {
  const n = Math.floor(Math.min(from.length / 3, to.length / 2));
  if (n < 2) return [0, 0, 0, 1];
  // (the page's points stood in 3D, at no height)
  const flat = new Float64Array(3 * n);
  for (let i = 0; i < n; i++) {
    flat[3 * i] = to[2 * i];
    flat[3 * i + 1] = to[2 * i + 1];
  }
  return hornTurn(from, flat, n);
}

/**
 * The turn that lays points in 3D best over others in 3D - the same atoms,
 * in the same order, as two calculations gave them: of all rotations, the
 * one taking `from` (x, y and z in turn, about its own centre) nearest to
 * `to` (about its), as the quaternion x, y, z, w. Horn's, as `turnOnto`.
 */
export function turnOver(from: ArrayLike<number>, to: ArrayLike<number>): Turn3D {
  const n = Math.floor(Math.min(from.length, to.length) / 3);
  return n < 2 ? [0, 0, 0, 1] : hornTurn(from, to, n);
}

/**
 * The turn a molecule in 3D is first seen at, its coordinates as they are:
 * along its principal axes - its longest extent across the screen, its next
 * up it, its least towards the viewer - so that a linear molecule (HCN) is
 * seen side-on, not end-on as one ball, and a planar one face-on. Of the
 * points `xyz` (x, y and z in turn): the axes of their spread about their
 * centre (Jacobi's sweeps), and the turn laying them over those axes on the
 * page (`turnOnto`). None for one point, or points all in one place.
 *
 * The same molecule is always seen the same way, whatever noise its
 * coordinates carry - two calculations of it alike: each axis pointing the
 * way the lowest-numbered point off it lies; and where the spread is alike
 * two or three ways (`ALIKE`, a symmetric top - benzene, methane), the axes
 * in that plane, or space, taken through the lowest-numbered points off
 * the rest, not as the sweeps happen to leave them.
 */
export function principalTurn(xyz: ArrayLike<number>): Turn3D | undefined {
  const n = Math.floor(xyz.length / 3);
  if (n < 2) return undefined;
  const c = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) c[k] += xyz[3 * i + k] / n;
  const d = Array.from({ length: n }, (_, i) => [0, 1, 2].map((k) => xyz[3 * i + k] - c[k]));
  const spread = [0, 1, 2].map(() => [0, 0, 0]);
  for (const p of d) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) spread[a][b] += p[a] * p[b];
  const { values, vectors } = jacobi(spread);
  const order = [0, 1, 2].sort((a, b) => values[b] - values[a] || a - b);
  const [l1, l2, l3] = order.map((k) => values[k]);
  if (!(l1 > 1e-9)) return undefined;
  const axis = (k: number) => [vectors[0][order[k]], vectors[1][order[k]], vectors[2][order[k]]];
  // (how far a point must lie off an axis to count as off it: a twentieth of the farthest's distance - a centre atom's
  //  jitter, as a methane's carbon's, never counts)
  const far = Math.sqrt(Math.max(...d.map((p) => dot(p, p))));
  const off = 0.05 * far;
  const alike = (a: number, b: number) => a - b <= ALIKE * l1;
  let e1: number[], e2: number[];
  if (alike(l1, l3)) {
    // (alike every way - a spherical top: through the first point off the centre, then the first off that line)
    e1 = unit(d.find((p) => norm(p) > off) ?? axis(0));
    e2 = unit(d.map((p) => without(p, e1)).find((q) => norm(q) > off) ?? axis(1));
  } else if (alike(l1, l2)) {
    // (alike across a plane - an oblate top, benzene: in that plane, through the first point off its normal)
    const normal = axis(2);
    e1 = unit(d.map((p) => without(p, normal)).find((q) => norm(q) > off) ?? axis(0));
    e2 = cross(normal, e1);
  } else {
    e1 = axis(0);
    // (alike across the plane of the other two - a prolate top, CH3Cl: in it, through the first point off the long axis)
    e2 = alike(l2, l3) ? unit(d.map((p) => without(p, e1)).find((q) => norm(q) > off) ?? axis(1)) : axis(1);
  }
  // (each pointing the way the lowest-numbered point off it lies)
  e1 = towards(e1, d, off);
  e2 = towards(e2, d, off);
  // (where each point lies along the two: on the page, across and up)
  const onPage = new Float64Array(2 * n);
  d.forEach((p, i) => {
    onPage[2 * i] = dot(p, e1);
    onPage[2 * i + 1] = dot(p, e2);
  });
  return turnOnto(xyz, onPage);
}

/** How alike two spreads along principal axes may be, as a share of the largest, to be taken as one: a symmetric top's, with noise. */
export const ALIKE = 0.02;

const dot = (p: readonly number[], q: readonly number[]) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const norm = (p: readonly number[]) => Math.sqrt(dot(p, p));
const unit = (p: readonly number[]) => {
  const l = norm(p) || 1;
  return p.map((v) => v / l);
};
const without = (p: readonly number[], along: readonly number[]) => {
  const k = dot(p, along);
  return p.map((v, i) => v - k * along[i]);
};
const cross = (p: readonly number[], q: readonly number[]) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
/** `v`, or the other way, so that the lowest-numbered point lying off the plane across it lies its way. */
const towards = (v: number[], d: readonly number[][], off: number) => {
  const first = d.find((p) => Math.abs(dot(p, v)) > off);
  return first && dot(first, v) < 0 ? v.map((x) => -x) : v;
};

/** The turn `then` made after the turn `first`, as one: the quaternions' product. */
export function turnAfter(then: Turn3D, first: Turn3D): Turn3D {
  const [ax, ay, az, aw] = then;
  const [bx, by, bz, bw] = first;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** Horn's turn of the first `n` points of `from` onto those of `to`, both in 3D: the eigenvector of the largest eigenvalue of his 4 x 4 matrix. */
function hornTurn(from: ArrayLike<number>, to: ArrayLike<number>, n: number): Turn3D {
  const cf = [0, 0, 0];
  const ct = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < 3; a++) {
      cf[a] += from[3 * i + a] / n;
      ct[a] += to[3 * i + a] / n;
    }
  }
  // the cross-covariance, S[a][b] = sum of from_a * to_b, about their centres
  const s = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < 3; a++) {
      const p = from[3 * i + a] - cf[a];
      for (let b = 0; b < 3; b++) s[3 * a + b] += p * (to[3 * i + b] - ct[b]);
    }
  }
  const [sxx, sxy, sxz, syx, syy, syz, szx, szy, szz] = s;
  const m = [
    [sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz],
  ];
  const { values, vectors } = jacobi(m);
  let best = 0;
  for (let k = 1; k < 4; k++) if (values[k] > values[best]) best = k;
  const [w, x, y, z] = [0, 1, 2, 3].map((r) => vectors[r][best]);
  const len = Math.hypot(w, x, y, z) || 1;
  // (the same turn either way round: w kept positive, so the same points give the same quaternion)
  const sign = w < 0 ? -1 / len : 1 / len;
  return [x * sign, y * sign, z * sign, w * sign];
}

/** The eigenvalues and eigenvectors (by column) of a small symmetric matrix, by Jacobi's sweeps. */
function jacobi(input: number[][]): { values: number[]; vectors: number[][] } {
  const n = input.length;
  const a = input.map((row) => [...row]);
  const v: number[][] = a.map((_, i) => a.map((__, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 64; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p], vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: a.map((row, i) => row[i]), vectors: v };
}
