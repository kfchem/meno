import { describe, expect, it } from "vitest";
import type { Molecule3D } from "../store/types";
import { editedFrom, isResult, movingAtoms, placesOf, settable, stereoAfter, valueOf, withValue } from "./edit3d";

/** Butane, C1-C2-C3-C4, anti, with a hydrogen on C1 (4) and one on C4 (5); and a bonded list for ring tests. */
const butane = (): Molecule3D => ({
  id: 1,
  atoms: [
    { el: "C", x: 0, y: 0, z: 0 },
    { el: "C", x: 1.5, y: 0, z: 0 },
    { el: "C", x: 2, y: 1.4, z: 0 },
    { el: "C", x: 3.5, y: 1.4, z: 0 },
    { el: "H", x: -0.5, y: -0.9, z: 0.3 },
    { el: "H", x: 4, y: 2.3, z: 0.3 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 1, a2: 2, order: 1 },
    { a1: 2, a2: 3, order: 1 },
    { a1: 0, a2: 4, order: 1 },
    { a1: 3, a2: 5, order: 1 },
  ],
  at: { x: 0, y: 0 },
});

/** Cyclopentane's ring (0-4) with a methyl's carbon on atom 4 (5) and a hydrogen on it (6). */
const ring = () => ({
  atoms: Array.from({ length: 7 }, () => ({})),
  bonds: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 0],
    [4, 5],
    [5, 6],
  ].map(([a1, a2]) => ({ a1, a2 })),
});

describe("what setting a measurement moves", () => {
  it("is the side of the last atom chosen, cut at the bond before it - for a torsion angle, the third's", () => {
    expect(movingAtoms(butane(), [0, 1])).toEqual([1, 2, 3, 5]);
    expect(movingAtoms(butane(), [1, 0])).toEqual([0, 4]);
    expect(movingAtoms(butane(), [0, 1, 2])).toEqual([2, 3, 5]);
    expect(movingAtoms(butane(), [0, 1, 2, 3])).toEqual([2, 3, 5]);
    expect(movingAtoms(butane(), [3, 2, 1, 0])).toEqual([0, 1, 4]);
  });

  it("is, in a ring, the last atom and what hangs on it alone - and nothing for a torsion angle about a ring's bond", () => {
    expect(movingAtoms(ring(), [3, 4])).toEqual([4, 5, 6]);
    expect(movingAtoms(ring(), [2, 3, 4])).toEqual([4, 5, 6]);
    expect(movingAtoms(ring(), [0, 1, 2, 3])).toBeNull();
    // (about the bond out of the ring: the methyl turns)
    expect(movingAtoms(ring(), [3, 4, 5, 6])).toEqual([5, 6]);
  });

  it("is the whole piece the last atom is in, where it is bonded to none of the others", () => {
    const two = { atoms: Array.from({ length: 4 }, () => ({})), bonds: [{ a1: 0, a2: 1 }, { a1: 2, a2: 3 }] };
    expect(movingAtoms(two, [0, 2])).toEqual([2, 3]);
    // (a torsion angle about no bond: none)
    expect(movingAtoms(two, [0, 1, 2, 3])).toBeNull();
    expect(movingAtoms(two, [0, 0])).toBeNull();
  });
});

describe("a measurement set to a value", () => {
  const xyz = placesOf(butane(), 0);
  it("comes to that value, the fixed side where it was", () => {
    for (const [path, value] of [
      [[0, 1], 1.54],
      [[0, 1, 2], 111.5],
      [[0, 1, 2, 3], 60],
      [[0, 1, 2, 3], -60],
      [[0, 1, 2, 3], 180],
    ] as [number[], number][]) {
      const moving = movingAtoms(butane(), path)!;
      const next = withValue(xyz, path, value, moving);
      expect(valueOf(next, path)).toBeCloseTo(settable(path.length === 4 ? "torsion" : path.length === 3 ? "angle" : "distance", value), 6);
      // (what does not move stays where it was, to the last digit)
      for (let i = 0; i < 6; i++) if (!moving.includes(i)) expect(next.slice(3 * i, 3 * i + 3)).toEqual(xyz.slice(3 * i, 3 * i + 3));
    }
  });

  it("keeps the moving part's own shape: its bonds as long as they were", () => {
    const next = withValue(xyz, [0, 1, 2, 3], 75, movingAtoms(butane(), [0, 1, 2, 3])!);
    const len = (p: number[], a: number, b: number) => Math.hypot(p[3 * a] - p[3 * b], p[3 * a + 1] - p[3 * b + 1], p[3 * a + 2] - p[3 * b + 2]);
    expect(len(next, 2, 3)).toBeCloseTo(len(xyz, 2, 3), 9);
    expect(len(next, 3, 5)).toBeCloseTo(len(xyz, 3, 5), 9);
  });

  it("is kept within what can be set, a torsion angle brought round", () => {
    expect(settable("distance", 0.1)).toBe(0.5);
    expect(settable("angle", 200)).toBe(179);
    expect(settable("torsion", 190)).toBeCloseTo(-170, 9);
    expect(settable("torsion", -180)).toBe(180);
  });
});

describe("a molecule's frames, results and stereo labels as it is edited", () => {
  it("reads the frame shown", () => {
    const m = { ...butane(), frames: [placesOf(butane(), 0).map((v) => v + 1)] };
    expect(placesOf(m, 1)[0]).toBe(1);
    expect(placesOf(m, 0)[0]).toBe(0);
  });

  it("takes a conformer set, a trajectory or a calculation's result as a result, never edited in place", () => {
    expect(isResult(butane())).toBe(false);
    expect(isResult({ ...butane(), conformerSet: true })).toBe(true);
    expect(isResult({ ...butane(), frames: [[]] })).toBe(true);
    expect(isResult({ ...butane(), energies: [-1] })).toBe(true);
    expect(editedFrom({ ...butane(), conformerSet: true, frames: [[], []], numbers: [3, 7, 9] }, 1)).toBe("conformer 7");
    expect(editedFrom({ ...butane(), frames: [[]] }, 1)).toBe("frame 2");
    expect(editedFrom({ ...butane(), name: "opt.log", energies: [-1] }, 0)).toBe("opt.log");
  });

  it("swaps R and S at a centre turned inside out, and E and Z at a double bond turned past square", () => {
    // a centre (0) with three neighbours; the third moved through to the other side
    const m = {
      atoms: [0, 1, 2, 3].map(() => ({ el: "C", x: 0, y: 0, z: 0 })),
      bonds: [1, 2, 3].map((k) => ({ a1: 0, a2: k, order: 1 })),
      stereo: { atoms: { 0: "R" }, bonds: {} },
    };
    const before = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
    const after = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, -1];
    expect(stereoAfter(m, before, after)!.atoms[0]).toBe("S");
    expect(stereoAfter(m, before, before)!.atoms[0]).toBe("R");
    // a double bond 1=2 with 0 on 1 and 3 on 2: cis, then turned to trans
    const db = {
      atoms: [0, 1, 2, 3].map(() => ({ el: "C", x: 0, y: 0, z: 0 })),
      bonds: [
        { a1: 0, a2: 1, order: 1 },
        { a1: 1, a2: 2, order: 2 },
        { a1: 2, a2: 3, order: 1 },
      ],
      stereo: { atoms: {}, bonds: { 1: "Z" } },
    };
    const cis = [0, 1, 0, 0, 0, 0, 1.3, 0, 0, 1.3, 1, 0];
    const trans = [0, 1, 0, 0, 0, 0, 1.3, 0, 0, 1.3, -1, 0];
    expect(stereoAfter(db, cis, trans)!.bonds[1]).toBe("E");
  });
});
