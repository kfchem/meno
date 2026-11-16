import { describe, expect, it } from "vitest";
import { EXACT, FLAT_VOLUME_3D, FLAT_VOLUME_DRAWN, HANDED, IN_LINE_VOLUME, parity, sideOfLine, signedVolume, torsionSense, volumeSign } from "./geometry";

describe("the sign of a permutation", () => {
  it("is +1 for none, -1 for one swap, +1 for a 3-cycle and for two swaps", () => {
    expect(parity([0, 1, 2, 3])).toBe(1);
    expect(parity([1, 0, 2, 3])).toBe(-1);
    expect(parity([1, 2, 0, 3])).toBe(1);
    expect(parity([3, 2, 1, 0])).toBe(1);
    // (and on two and three, where the pairs not inverted are odd in number: a count of the wrong pairs would show)
    expect(parity([0, 1])).toBe(1);
    expect(parity([1, 0])).toBe(-1);
    expect(parity([0, 1, 2])).toBe(1);
    expect(parity([2, 1, 0])).toBe(-1);
  });

  it("takes an H's stand-in as each caller places it, and the two give opposite signs: never to be made one", () => {
    // (neighbours 3, H, 5, 7: H as -1 sorts first - one swap; as Infinity it sorts last - two)
    expect(parity([3, -1, 5, 7])).toBe(-1);
    expect(parity([3, Infinity, 5, 7])).toBe(1);
  });

  it("is the same number for a permutation of 0..n-1 as its cycles count it: every permutation of four", () => {
    const perms = (xs: number[]): number[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
    for (const p of perms([0, 1, 2, 3])) {
      const seen = p.map(() => false);
      let sign = 1;
      for (let i = 0; i < p.length; i++) {
        let len = 0;
        for (let j = i; !seen[j]; j = p[j]) {
          seen[j] = true;
          len++;
        }
        if (len && len % 2 === 0) sign = -sign;
      }
      expect(parity(p), p.join()).toBe(sign);
    }
  });
});

describe("the sign of a volume", () => {
  it("is +1 for the unit axes from the origin, in order - clockwise seen from the origin looking out - and -1 with two swapped", () => {
    expect(volumeSign([1, 0, 0], [0, 1, 0], [0, 0, 1])).toBe(1);
    expect(volumeSign([0, 1, 0], [1, 0, 0], [0, 0, 1])).toBe(-1);
    expect(signedVolume([2, 0, 0], [0, 3, 0], [0, 0, 1])).toBe(6);
  });

  it("is 0 for four places in one plane, at any tolerance above nought, and exactly 0 at EXACT", () => {
    expect(volumeSign([1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 0], 1e-12)).toBe(0);
    expect(volumeSign([1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 0], EXACT)).toBe(0);
    expect(volumeSign([1, 0, 0], [0, 1, 0], [0, 0, 1e-9], [0, 0, 0], EXACT)).toBe(1);
  });

  it("is seen from the fourth place when one is given, the same under a turn and a shift, and turned by a reflection", () => {
    const [a, b, c, o] = [[1.2, 0.3, -0.4], [-0.5, 1.1, 0.2], [0.1, -0.7, 1.3], [0.2, 0.1, 0.05]];
    const want = volumeSign(a, b, c, o);
    // (turned about z by 1 radian, and moved)
    const t = (p: number[]) => [Math.cos(1) * p[0] - Math.sin(1) * p[1] + 5, Math.sin(1) * p[0] + Math.cos(1) * p[1] - 2, p[2] + 7];
    expect(volumeSign(t(a), t(b), t(c), t(o))).toBe(want);
    const m = (p: number[]) => [-p[0], p[1], p[2]];
    expect(volumeSign(m(a), m(b), m(c), m(o))).toBe(-want);
  });
});

describe("the sign of a torsion and the side of a line", () => {
  it("is IUPAC's for a torsion: q at the origin, r up z, p along x, s = r + y: the front bond turns clockwise onto the back, +1", () => {
    expect(torsionSense([1, 0, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1])).toBe(1);
    expect(torsionSense([1, 0, 0], [0, 0, 0], [0, 0, 1], [0, -1, 1])).toBe(-1);
    expect(torsionSense([1, 0, 0], [0, 0, 0], [0, 0, 1], [1, 0, 1])).toBe(0);
  });

  it("is positive for two places on one side of a bond (cis), negative across it (trans), 0 for one on its line", () => {
    expect(sideOfLine([0, 0, 0], [1, 0, 0], [-0.5, 1, 0], [1.5, 1, 0])).toBeGreaterThan(0);
    expect(sideOfLine([0, 0, 0], [1, 0, 0], [-0.5, 1, 0], [1.5, -1, 0])).toBeLessThan(0);
    expect(sideOfLine([0, 0, 0], [1, 0, 0], [-1, 0, 0], [1.5, -1, 0])).toBe(0);
  });
});

describe("the tolerances, each its user's as it was", () => {
  it("are the numbers each user had: no value changes in the move", () => {
    expect([FLAT_VOLUME_3D, FLAT_VOLUME_DRAWN, EXACT, HANDED, IN_LINE_VOLUME]).toEqual([1e-6, 1e-6, 0, 0.05, 1e-9]);
  });
});
