import { describe, expect, it } from "vitest";
import { cisAt, configuredFrom, FLAT_ALLENE, runsFrom3d, senseAt, torsionSide, type Place } from "./from3d";
import { FLAT_VOLUME_3D, HANDED } from "./geometry";
import { cipIn3d } from "../../cip/in3d";

/** A tetrahedron's four corners round a centre at the origin, a bond long: the first straight down, the other three round it above. */
const corners = (turn = 1): Place[] => {
  const up = 1 / 3;
  const round = Math.sqrt(8) / 3;
  const at = (deg: number): Place => [turn * round * Math.cos((deg * Math.PI) / 180), round * Math.sin((deg * Math.PI) / 180), up];
  return [[0, 0, -1], at(90), at(-30), at(210)];
};

/** CHFClBr in places: C 0, H 1, Br 2, Cl 3, F 4 - looked at from above, the H away, Br, Cl, F run clockwise where `turn` is 1. */
const halomethane = (turn: 1 | -1) => {
  const [h, br, cl, f] = corners(turn);
  return { atoms: ["C", "H", "Br", "Cl", "F"].map((el) => ({ el })), bonds: [1, 2, 3, 4].map((a2) => ({ a1: 0, a2, order: 1 })), xyz: [[0, 0, 0], h, br, cl, f].flat() };
};

describe("a configuration read from places", () => {
  it("reads (R)- and (S)-CHFClBr, each other's mirror image: Br, Cl, F clockwise with the H away is R", () => {
    expect(cipIn3d(halomethane(1)).atoms).toEqual({ "0": "R" });
    expect(cipIn3d(halomethane(-1)).atoms).toEqual({ "0": "S" });
    // (the sense itself, by the volume the first three neighbours span seen from the centre: one sign, and the other for the mirror)
    const sense = (turn: 1 | -1) => {
      const m = halomethane(turn);
      const places = Object.fromEntries([0, 1, 2, 3, 4].map((i) => [i, m.xyz.slice(3 * i, 3 * i + 3) as unknown as Place]));
      return configuredFrom(m.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })), places, [0], []).centres.map((c) => c.sense);
    };
    expect(sense(1)).toHaveLength(1);
    expect(sense(-1)).toEqual(sense(1).map((s) => -s));
  });

  it("reads no configuration at a centre whose four groups lie flat, and reads one just past the flat volume", () => {
    const bonds = [1, 2, 3, 4].map((b) => ({ a: 0, b, order: 1 }));
    const flat: Record<number, Place> = { 0: [0, 0, 0], 1: [1, 0, 0], 2: [0, 1, 0], 3: [-1, 0, 0], 4: [0, -1, 0] };
    expect(configuredFrom(bonds, flat, [0], []).centres).toEqual([]);
    // (the first three neighbours' volume seen from the centre: under `FLAT_VOLUME_3D` none, over it one - the tolerance as it stands)
    const lifted = (z: number): Record<number, Place> => ({ ...flat, 3: [-1, 0, z] });
    expect(configuredFrom(bonds, lifted(FLAT_VOLUME_3D / 2), [0], []).centres).toEqual([]);
    expect(configuredFrom(bonds, lifted(FLAT_VOLUME_3D * 2), [0], []).centres).toHaveLength(1);
  });

  it("reads (E)- and (Z)-but-2-ene: the two methyls on opposite sides, then on one side; none where an end's group lies on the line", () => {
    // (C1 0, C2 1, C3 2, C4 3: the double bond 1-2)
    const bonds = [
      { a: 0, b: 1, order: 1 },
      { a: 1, b: 2, order: 2 },
      { a: 2, b: 3, order: 1 },
    ];
    const at = (c4: Place): Record<number, Place> => ({ 0: [-0.7, 1.2, 0], 1: [0, 0, 0], 2: [1.34, 0, 0], 3: c4 });
    expect(configuredFrom(bonds, at([2.04, -1.2, 0]), [], [1]).doubles).toEqual([{ bond: 1, ends: [0, 3], cis: false }]);
    expect(configuredFrom(bonds, at([2.04, 1.2, 0]), [], [1]).doubles).toEqual([{ bond: 1, ends: [0, 3], cis: true }]);
    expect(configuredFrom(bonds, at([2.84, 0, 0]), [], [1]).doubles).toEqual([]);
  });

  it("reads an allene's axis - penta-2,3-diene's two hands, each other's mirror image - and none where its two ends' planes are one", () => {
    // (C1 0, C2 1, C3 2, C4 3, C5 4, and an H on each of C2 and C4: 5, 6)
    const bonds = [
      { a1: 0, a2: 1, order: 1 },
      { a1: 1, a2: 2, order: 2 },
      { a1: 2, a2: 3, order: 2 },
      { a1: 3, a2: 4, order: 1 },
      { a1: 1, a2: 5, order: 1 },
      { a1: 3, a2: 6, order: 1 },
    ];
    const around: number[][] = [[], [], [], [], [], [], []];
    for (const b of bonds) {
      around[b.a1].push(b.a2);
      around[b.a2].push(b.a1);
    }
    // (the run along x; C1 and C2's H in the xy plane, C5 and C4's H turned `deg` about the run from it - square is 90)
    const placed = (deg: number, mirror = 1): Record<number, Place> => {
      const t = (deg * Math.PI) / 180;
      const turned = (y: number): Place => [0, mirror * y * Math.cos(t), y * Math.sin(t)];
      const [c5, h4] = [turned(1.2), turned(-1.0)];
      return { 0: [-0.7, 1.2, 0], 1: [0, 0, 0], 2: [1.31, 0, 0], 3: [2.62, 0, 0], 4: [3.32 + c5[0], c5[1], c5[2]], 5: [-0.5, -0.9, 0], 6: [2.62 + h4[0], h4[1], h4[2]] };
    };
    const square = runsFrom3d(around, bonds, placed(90), around.map(() => ({ el: "C" })));
    expect(square.axes).toHaveLength(1);
    expect(square.shownOn.axes).toEqual([1]);
    const mirror = runsFrom3d(around, bonds, placed(-90), around.map(() => ({ el: "C" })));
    expect(mirror.axes.map((a) => a.sense)).toEqual(square.axes.map((a) => -a.sense));
    // (turned under `FLAT_ALLENE`'s sine from one plane: no hand)
    expect(FLAT_ALLENE).toBe(0.5);
    expect(runsFrom3d(around, bonds, placed(20), around.map(() => ({ el: "C" }))).axes).toEqual([]);
    expect(runsFrom3d(around, bonds, placed(40), around.map(() => ({ el: "C" }))).axes).toHaveLength(1);
  });

  it("reads a centre's sense from its first three neighbours, and none under the tolerance its reader names", () => {
    const [, br, cl, f] = corners(1);
    expect(senseAt([0, 0, 0], [br, cl, f])).toBe(senseAt([0, 0, 0], [br, f, cl]) * -1);
    expect(Math.abs(senseAt([0, 0, 0], [br, cl, f]))).toBe(1);
    // (three neighbours nearly in a plane with the centre: a sense exactly, none at HANDED's size)
    const flat: Place[] = [[1, 0, 0], [0, 1, 0], [-1, -1, 0.01]];
    expect(senseAt([0, 0, 0], flat)).not.toBe(0);
    expect(senseAt([0, 0, 0], flat, HANDED)).toBe(0);
  });

  it("reads a double bond's side: cis, trans, or none where an end group lies on its line", () => {
    const [a, b]: Place[] = [[0, 0, 0], [1.34, 0, 0]];
    expect(cisAt(a, b, [-0.7, 1.2, 0], [2.04, 1.2, 0])).toBe(true);
    expect(cisAt(a, b, [-0.7, 1.2, 0], [2.04, -1.2, 0])).toBe(false);
    expect(cisAt(a, b, [-0.7, 1.2, 0], [2.84, 0, 0])).toBe(null);
  });

  it("reads a torsion's way: its ends on one side under 90 degrees, on opposite sides past it, none where a plane is none", () => {
    const [a, b, c]: Place[] = [[-0.7, 1.2, 0], [0, 0, 0], [1.34, 0, 0]];
    expect(torsionSide(a, b, c, [2.04, 1.2, 0])).toBeGreaterThan(0);
    expect(torsionSide(a, b, c, [2.04, -1.2, 0])).toBeLessThan(0);
    // (turned 80 degrees and 100 about the bond: either side of square)
    const turned = (deg: number): Place => [2.04, 1.2 * Math.cos((deg * Math.PI) / 180), 1.2 * Math.sin((deg * Math.PI) / 180)];
    expect(torsionSide(a, b, c, turned(80))).toBeGreaterThan(0);
    expect(torsionSide(a, b, c, turned(100))).toBeLessThan(0);
    expect(torsionSide(a, b, c, [2.84, 0, 0])).toBe(0);
  });
});
