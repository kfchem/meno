import { describe, expect, it } from "vitest";
import { centred, eigenvalues, rmsd, rmsdCentred, spread } from "./rmsd";

// four atoms, not in a plane
const water = [0, 0, 0, 0.96, 0, 0, -0.24, 0.93, 0, 0.3, 0.2, 0.8];

/** `xyz` turned by `angle` about the axis (1, 1, 1), and moved by (5, -2, 3). */
function turned(xyz: readonly number[], angle: number): number[] {
  const k = [1, 1, 1].map((v) => v / Math.sqrt(3));
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const out: number[] = [];
  for (let i = 0; i < xyz.length; i += 3) {
    const v = [xyz[i], xyz[i + 1], xyz[i + 2]];
    const dot = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
    const cross = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
    // Rodrigues' rotation
    for (let a = 0; a < 3; a++) out.push(v[a] * c + cross[a] * s + k[a] * dot * (1 - c) + [5, -2, 3][a]);
  }
  return out;
}

describe("rmsd", () => {
  it("is nought for a geometry and itself, moved and turned", () => {
    expect(rmsd(water, water)).toBeCloseTo(0, 6);
    expect(rmsd(water, turned(water, 1.1))).toBeCloseTo(0, 6);
    expect(rmsd(turned(water, -2.5), water)).toBeCloseTo(0, 6);
  });

  it("is the atoms' deviation where no turn brings them closer", () => {
    // two atoms each 0.1 out along the line between them: nothing turns that back
    const a = [0, 0, 0, 1, 0, 0];
    const b = [-0.1, 0, 0, 1.1, 0, 0];
    expect(rmsd(a, b)).toBeCloseTo(0.1, 6);
  });

  it("does not see symmetric atoms swapped", () => {
    const swapped = [water[3], water[4], water[5], water[0], water[1], water[2], ...water.slice(6)];
    expect(rmsd(water, swapped)).toBeGreaterThan(0.1);
  });
});

describe("eigenvalues", () => {
  it("are a diagonal matrix's diagonal, and a symmetric one's roots", () => {
    expect(eigenvalues([[3, 0], [0, -1]]).sort()).toEqual([-1, 3]);
    const got = eigenvalues([[2, 1], [1, 2]]).sort((p, q) => p - q);
    expect(got[0]).toBeCloseTo(1, 10);
    expect(got[1]).toBeCloseTo(3, 10);
  });
});

describe("the RMSD, worked out fast", () => {
  /** The RMSD as the quaternion method has it, its largest eigenvalue found by Jacobi's rotations alone: what the fast way must agree with. */
  function byJacobi(p: readonly number[], q: readonly number[]): number {
    const n = p.length / 3;
    const c = (x: readonly number[]) => [0, 1, 2].map((a) => x.filter((_, i) => i % 3 === a).reduce((s, v) => s + v, 0) / n);
    const cp = c(p);
    const cq = c(q);
    const s = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    let spread = 0;
    for (let i = 0; i < n; i++)
      for (let a = 0; a < 3; a++) {
        spread += (p[3 * i + a] - cp[a]) ** 2 + (q[3 * i + a] - cq[a]) ** 2;
        for (let b = 0; b < 3; b++) s[3 * a + b] += (p[3 * i + a] - cp[a]) * (q[3 * i + b] - cq[b]);
      }
    const [xx, xy, xz, yx, yy, yz, zx, zy, zz] = s;
    const m = [
      [xx + yy + zz, yz - zy, zx - xz, xy - yx],
      [yz - zy, xx - yy - zz, xy + yx, zx + xz],
      [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
      [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
    ];
    return Math.sqrt(Math.max(0, (spread - 2 * Math.max(...eigenvalues(m))) / n));
  }

  it("agrees with Jacobi's to a millionth of an ångström - near copies, straight molecules and copies alike", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 4 - 2;
    let worst = 0;
    for (let k = 0; k < 6000; k++) {
      const n = 1 + (k % 40);
      // (straight: every atom on one line)
      const p = k % 5 === 4 ? Array.from({ length: n }, () => rnd()).flatMap((t) => [t, 2 * t, -t]) : Array.from({ length: 3 * n }, rnd);
      const q = k % 3 === 0 ? p.map((v) => v + 0.01 * rnd()) : k % 3 === 1 ? turned(p, 1.1) : Array.from({ length: 3 * n }, rnd);
      worst = Math.max(worst, Math.abs(rmsd(p, q) - byJacobi(p, q)));
    }
    expect(worst).toBeLessThan(1e-6);
  });

  it("is never less than the difference of the two geometries' spreads about their centres", () => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 6 - 3;
    for (let k = 0; k < 500; k++) {
      const n = 2 + (k % 20);
      const p = Array.from({ length: 3 * n }, rnd);
      const q = Array.from({ length: 3 * n }, rnd);
      expect(rmsd(p, q)).toBeGreaterThanOrEqual(Math.abs(spread(p) - spread(q)) - 1e-12);
      expect(rmsdCentred(centred(p), centred(q))).toBeCloseTo(rmsd(p, q), 12);
    }
  });
});
