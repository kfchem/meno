/**
 * Held beside from3d.test.ts: what a configuration read from places says exactly - an allene's absolute hand and its axis whole, a double
 * bond's end group (the first), the side's tolerance, an odd cumulene's in-line bound. (Found in review.)
 */
import { describe, expect, it } from "vitest";
import { configuredFrom, runsFrom3d, type Place } from "./from3d";
import { cipIn3d, runsIn3dOf } from "../../cip/in3d";

/** 1,3-dichloroallene along x: C 0, C 1, C 2; Cl 3 and H 4 on C 0 in the xy plane; Cl 5 and H 6 on C 2 in the xz plane, `turn` 1 or -1 the way round. */
const dichloroallene = (turn: 1 | -1) => ({
  atoms: ["C", "C", "C", "Cl", "H", "Cl", "H"].map((el) => ({ el })),
  bonds: [
    { a1: 0, a2: 1, order: 2 },
    { a1: 1, a2: 2, order: 2 },
    { a1: 0, a2: 3, order: 1 },
    { a1: 0, a2: 4, order: 1 },
    { a1: 2, a2: 5, order: 1 },
    { a1: 2, a2: 6, order: 1 },
  ],
  xyz: [[0, 0, 0], [1.31, 0, 0], [2.62, 0, 0], [-0.7, 1.5, 0], [-0.5, -0.9, 0], [3.32, 0, 1.5 * turn], [3.12, 0, -0.9 * turn]].flat(),
});

describe("an allene's hand and axis in places", () => {
  it("reads Sa where the Cl on the near end and the Cl on the far end turn a quarter turn clockwise (a positive torsion, P), Ra the other way", () => {
    // (the torsion Cl 3 - C 0 - C 2 - Cl 5 is +90 degrees for turn 1: P, which the page shows as Sa; M is Ra - docs/CIP.md, Axes)
    expect(cipIn3d(dichloroallene(1)).bonds["0"]).toBe("Sa");
    expect(cipIn3d(dichloroallene(-1)).bonds["0"]).toBe("Ra");
  });

  it("gives the axis whole: its two end atoms, the lowest-numbered group at each, and the sign of the torsion between them", () => {
    expect(runsIn3dOf(dichloroallene(1)).axes).toEqual([{ atoms: [0, 2], refs: [3, 5], sense: 1 }]);
    expect(runsIn3dOf(dichloroallene(-1)).axes).toEqual([{ atoms: [0, 2], refs: [3, 5], sense: -1 }]);
  });
});

describe("a double bond's end group and its side, in places", () => {
  // (C 1 = C 2, with C 0 above and C 4 below on C 1 - listed in that order - and C 3 on C 2)
  const bonds = [
    { a: 0, b: 1, order: 1 },
    { a: 1, b: 2, order: 2 },
    { a: 1, b: 4, order: 1 },
    { a: 2, b: 3, order: 1 },
  ];
  const at = (c3: Place): Record<number, Place> => ({ 0: [-0.7, 1.2, 0], 1: [0, 0, 0], 2: [1.34, 0, 0], 3: c3, 4: [-0.7, -1.2, 0] });

  it("takes the first group on each end other than the bond's other end: C 0, not C 4", () => {
    expect(configuredFrom(bonds, at([2.04, -1.2, 0]), [], [1]).doubles).toEqual([{ bond: 1, ends: [0, 3], cis: false }]);
    expect(configuredFrom(bonds, at([2.04, 1.2, 0]), [], [1]).doubles).toEqual([{ bond: 1, ends: [0, 3], cis: true }]);
  });

  it("reads a side a hundred times over the flat volume and none a hundred times under it", () => {
    // (C 3 a tenth of a milli-angstrom off the line from C 1 to C 2: a side of some 2e-4 angstrom^4, over FLAT_VOLUME_3D = 1e-6 by two hundred)
    expect(configuredFrom(bonds, at([2.84, 1e-4, 0]), [], [1]).doubles).toEqual([{ bond: 1, ends: [0, 3], cis: true }]);
    expect(configuredFrom(bonds, at([2.84, 1e-9, 0]), [], [1]).doubles).toEqual([]);
  });
});

describe("an odd cumulene's cis or trans in places", () => {
  // 1,4-dichlorobutatriene along x: Cl 0, C 1, C 2, C 3, C 4, Cl 5, H 6 on C 1, H 7 on C 4; the near Cl up, the far Cl turned `deg` about the run from it
  const around: number[][] = [[1], [0, 2, 6], [1, 3], [2, 4], [3, 5, 7], [4], [1], [4]];
  const bonds = [
    { a1: 0, a2: 1, order: 1 },
    { a1: 1, a2: 2, order: 2 },
    { a1: 2, a2: 3, order: 2 },
    { a1: 3, a2: 4, order: 2 },
    { a1: 4, a2: 5, order: 1 },
    { a1: 1, a2: 6, order: 1 },
    { a1: 4, a2: 7, order: 1 },
  ];
  const placed = (deg: number): Record<number, Place> => {
    const t = (deg * Math.PI) / 180;
    return { 0: [-0.6, 1.5, 0], 1: [0, 0, 0], 2: [1.32, 0, 0], 3: [2.64, 0, 0], 4: [3.96, 0, 0], 5: [4.56, 1.5 * Math.cos(t), 1.5 * Math.sin(t)], 6: [-0.6, -0.9, 0], 7: [4.36, -0.9 * Math.cos(t), -0.9 * Math.sin(t)] };
  };

  it("reads cis where the two Cl lie on one side of the run, trans on the two, and nothing where they are turned between", () => {
    expect(runsFrom3d(around, bonds, placed(0), around.map(() => ({ el: "C" }))).cumulated).toEqual([{ atoms: [1, 4], refs: [0, 5], cis: true }]);
    expect(runsFrom3d(around, bonds, placed(180), around.map(() => ({ el: "C" }))).cumulated).toEqual([{ atoms: [1, 4], refs: [0, 5], cis: false }]);
    expect(runsFrom3d(around, bonds, placed(0), around.map(() => ({ el: "C" }))).shownOn.cumulated).toEqual([1]);
  });

  it("keeps the bound where it stands: a turn with a cosine of 0.7 reads one, of 0.3 none", () => {
    // (45.6 degrees and 72.5 degrees from the one side: the groups' offsets within or past half a quarter turn of in line)
    expect(runsFrom3d(around, bonds, placed(45.6), around.map(() => ({ el: "C" }))).cumulated).toEqual([{ atoms: [1, 4], refs: [0, 5], cis: true }]);
    expect(runsFrom3d(around, bonds, placed(72.5), around.map(() => ({ el: "C" }))).cumulated).toEqual([]);
  });
});
