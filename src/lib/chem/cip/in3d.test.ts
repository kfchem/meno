import { describe, expect, it } from "vitest";
import { cipIn3d } from "./in3d";

/** Four groups round a C at the corners of a tetrahedron: CHFClBr, H, F, Cl, Br in that order of places. */
const tetrahedron = [
  [1, 1, 1],
  [1, -1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
];
function chfclbr(order: string[]) {
  const atoms = [{ el: "C" }, ...order.map((el) => ({ el }))];
  const bonds = order.map((_, k) => ({ a1: 0, a2: k + 1, order: 1 }));
  const xyz = [0, 0, 0, ...tetrahedron.flatMap((p) => p.map((v) => v * 0.63))];
  return { atoms, bonds, xyz };
}

describe("R and S, E and Z of a molecule in 3D, read from its places", () => {
  it("reads a centre from where its four groups are - two swapped, the other one", () => {
    const one = cipIn3d(chfclbr(["H", "F", "Cl", "Br"])).atoms["0"];
    const other = cipIn3d(chfclbr(["H", "Cl", "F", "Br"])).atoms["0"];
    expect(new Set([one, other])).toEqual(new Set(["R", "S"]));
  });

  it("gives an atom of four groups two of them alike none: a CH2Cl2's C", () => {
    expect(cipIn3d(chfclbr(["H", "H", "Cl", "Cl"])).atoms).toEqual({});
  });

  it("reads a double bond's E or Z from its dihedral - not one in a ring of seven atoms or fewer", () => {
    // (1,2-dichloroethene in the plane z = 0: Cl0-C1=C2-Cl3, its Cl trans; then cis - each atom placed, its H too)
    const dichloroethene = (cis: boolean) => ({
      atoms: [{ el: "Cl" }, { el: "C" }, { el: "C" }, { el: "Cl" }, { el: "H" }, { el: "H" }],
      bonds: [
        { a1: 0, a2: 1, order: 1 },
        { a1: 1, a2: 2, order: 2 },
        { a1: 2, a2: 3, order: 1 },
        { a1: 1, a2: 4, order: 1 },
        { a1: 2, a2: 5, order: 1 },
      ],
      xyz: [-0.7, 1.2, 0, 0, 0, 0, 1.33, 0, 0, 2.03, cis ? 1.2 : -1.2, 0, -0.5, -0.9, 0, 1.83, cis ? -0.9 : 0.9, 0],
    });
    expect(cipIn3d(dichloroethene(false)).bonds).toEqual({ "1": "E" });
    expect(cipIn3d(dichloroethene(true)).bonds).toEqual({ "1": "Z" });
    // (a ring of four closed through the two Cl, as a cyclobutene's: none)
    const ring = dichloroethene(true);
    expect(cipIn3d({ ...ring, bonds: [...ring.bonds, { a1: 0, a2: 3, order: 1 }] }).bonds).toEqual({});
  });

  it("gives a protonated amine's N none, its H coming and going: four groups round it all different", () => {
    // (N-ethyl-N-methylpropan-1-aminium's N, at the middle of its tetrahedron: methyl, ethyl's CH2, propyl's CH2, its H)
    const atoms = [{ el: "N", charge: 1 }, { el: "C" }, { el: "C" }, { el: "C" }, { el: "H" }, { el: "C" }, { el: "C" }, { el: "C" }];
    const bonds = [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
      { a1: 0, a2: 3, order: 1 },
      { a1: 0, a2: 4, order: 1 },
      { a1: 2, a2: 5, order: 1 },
      { a1: 3, a2: 6, order: 1 },
      { a1: 6, a2: 7, order: 1 },
    ];
    const at = (p: number[], s: number) => p.map((v) => v * s);
    const xyz = [0, 0, 0, ...tetrahedron.flatMap((p) => at(p, 0.85)), ...at(tetrahedron[1], 1.7), ...at(tetrahedron[2], 1.7), ...at(tetrahedron[2], 2.55)];
    expect(cipIn3d({ atoms, bonds, xyz }).atoms).toEqual({});
    // (the same but neutral, a quaternary C in its place: a centre)
    expect(Object.keys(cipIn3d({ atoms: atoms.map((a, i) => (i === 0 ? { el: "C" } : a)), bonds, xyz }).atoms)).toEqual(["0"]);
  });
});

describe("an allene's axis and an odd cumulene's cis or trans in 3D, read from its places", () => {
  // (1-chloro-3-fluoroallene along x: F 0, C1, C2, C3, Cl 4, the ends' H 5 and 6 - its near end's groups in the plane z = 0, its far end's in y = 0)
  const allene = (far: 1 | -1) => ({
    atoms: [{ el: "F" }, { el: "C" }, { el: "C" }, { el: "C" }, { el: "Cl" }, { el: "H" }, { el: "H" }],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 1, a2: 2, order: 2 },
      { a1: 2, a2: 3, order: 2 },
      { a1: 3, a2: 4, order: 1 },
      { a1: 1, a2: 5, order: 1 },
      { a1: 3, a2: 6, order: 1 },
    ],
    xyz: [-0.8, 1.2, 0, 0, 0, 0, 1.3, 0, 0, 2.6, 0, 0, 3.4, 0, 1.2 * far, -0.6, -0.9, 0, 3.2, 0, -0.9 * far],
  });
  // (1,4-difluorobutatriene in the plane z = 0, its far F on one side or the other)
  const butatriene = (far: 1 | -1) => ({
    atoms: [{ el: "F" }, { el: "C" }, { el: "C" }, { el: "C" }, { el: "C" }, { el: "F" }, { el: "H" }, { el: "H" }],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 1, a2: 2, order: 2 },
      { a1: 2, a2: 3, order: 2 },
      { a1: 3, a2: 4, order: 2 },
      { a1: 4, a2: 5, order: 1 },
      { a1: 1, a2: 6, order: 1 },
      { a1: 4, a2: 7, order: 1 },
    ],
    xyz: [-0.7, 1.1, 0, 0, 0, 0, 1.3, 0, 0, 2.6, 0, 0, 3.9, 0, 0, 4.6, 1.1 * far, 0, -0.6, -0.9, 0, 4.5, -0.9 * far, 0],
  });

  it("reads an allene's Ra or Sa from the turn between its ends' groups, on the first double bond of its run - the other turn, the other", () => {
    const one = cipIn3d(allene(1)).bonds;
    const other = cipIn3d(allene(-1)).bonds;
    expect(Object.keys(one)).toEqual(["1"]);
    expect(new Set([one["1"], other["1"]])).toEqual(new Set(["Ra", "Sa"]));
  });

  it("reads an odd cumulene's E or Z from its ends' groups on one side of it or the two, and no cumulated C=C's own", () => {
    expect(cipIn3d(butatriene(1)).bonds).toEqual({ "1": "Z" });
    expect(cipIn3d(butatriene(-1)).bonds).toEqual({ "1": "E" });
  });

  it("reads a P or an S whose double bond to O is taken as single (CIP 1966, convention b: a phosphine oxide's P, a sulfone's S) as a centre, and no other atom with a double bond among its four", () => {
    // (the centre at the middle of a tetrahedron: O (double), F, Cl, Br - or with F and Cl swapped)
    const centre = (el: string, order: string[]) => {
      const atoms = [{ el }, ...order.map((e) => ({ el: e }))];
      const bonds = order.map((_, k) => ({ a1: 0, a2: k + 1, order: k === 0 ? 2 : 1 }));
      return cipIn3d({ atoms, bonds, xyz: [0, 0, 0, ...tetrahedron.flatMap((p) => p.map((v) => v * 0.63))] }).atoms["0"];
    };
    for (const el of ["P", "S"]) {
      const [one, other] = [centre(el, ["O", "F", "Cl", "Br"]), centre(el, ["O", "Cl", "F", "Br"])];
      expect(new Set([one, other]), el).toEqual(new Set(["R", "S"]));
    }
    // (a carbon with a double bond among its four is none: a centre has four single bonds)
    expect(centre("C", ["O", "F", "Cl", "Br"])).toBeUndefined();
  });

  it("gives a double bond in a ring of eight atoms its E or Z, and one in a ring of six none - the same places otherwise", () => {
    // (C0=C1, each with an H and a ring neighbour: C7 on C0, C2 on C1 - on one side, cis, or on both - trans - then the rest of the ring, anywhere)
    const ring = (size: number, trans: boolean) => {
      const atoms = [...Array(size)].map(() => ({ el: "C" })).concat([{ el: "H" }, { el: "H" }]);
      const bonds = [...Array(size)].map((_, i) => ({ a1: i, a2: (i + 1) % size, order: i === 0 ? 2 : 1 }));
      bonds.push({ a1: 0, a2: size, order: 1 }, { a1: 1, a2: size + 1, order: 1 });
      const xyz = new Array(3 * (size + 2)).fill(0);
      const put = (i: number, p: number[]) => p.forEach((v, k) => (xyz[3 * i + k] = v));
      put(0, [0, 0, 0]);
      put(1, [1.34, 0, 0]);
      put(size - 1, [-0.5, 1.2, 0]);
      put(2, [1.84, trans ? -1.2 : 1.2, 0]);
      for (let i = 3; i < size - 1; i++) put(i, [i, 3 + i, 1]);
      put(size, [-0.5, -1.2, 0]);
      put(size + 1, [1.84, trans ? 1.2 : -1.2, 0]);
      return { atoms, bonds, xyz };
    };
    expect(cipIn3d(ring(8, false)).bonds).toEqual({ "0": "Z" });
    expect(cipIn3d(ring(8, true)).bonds).toEqual({ "0": "E" });
    expect(cipIn3d(ring(6, false)).bonds).toEqual({});
    expect(cipIn3d(ring(6, true)).bonds).toEqual({});
  });

  it("shows an allene's axis once, and gives neither of its double bonds an E or Z of its own", () => {
    // (1,3-dichloroallene along x: C0=C1=C2, Cl and H on C0 in the xy plane, Cl and H on C2 in the xz plane - an axis of chirality)
    const allene = (flip: boolean) => ({
      atoms: [{ el: "C" }, { el: "C" }, { el: "C" }, { el: "Cl" }, { el: "H" }, { el: "Cl" }, { el: "H" }],
      bonds: [
        { a1: 0, a2: 1, order: 2 },
        { a1: 1, a2: 2, order: 2 },
        { a1: 0, a2: 3, order: 1 },
        { a1: 0, a2: 4, order: 1 },
        { a1: 2, a2: 5, order: 1 },
        { a1: 2, a2: 6, order: 1 },
      ],
      xyz: [-1.31, 0, 0, 0, 0, 0, 1.31, 0, 0, -1.9, 1.5, 0, -1.9, -1, 0, 1.9, 0, flip ? -1.5 : 1.5, 1.9, 0, flip ? 1 : -1],
    });
    const [a, b] = [cipIn3d(allene(false)).bonds, cipIn3d(allene(true)).bonds];
    // (one entry each, on the run's first double bond; the other double bond has none)
    expect(Object.keys(a)).toEqual(["0"]);
    expect(Object.keys(b)).toEqual(["0"]);
    expect(new Set([a["0"], b["0"]])).toEqual(new Set(["Ra", "Sa"]));
  });

  it("reads a butatriene's cis or trans where its groups lie in one plane, and none where the two ends are turned square to each other", () => {
    // (1,4-dichlorobutatriene along x: Cl and H on C0 in the xy plane; on C3 in the xy plane - flat - or the xz plane - square)
    const butatriene = (cl3: number[], h3: number[]) => ({
      atoms: [{ el: "C" }, { el: "C" }, { el: "C" }, { el: "C" }, { el: "Cl" }, { el: "H" }, { el: "Cl" }, { el: "H" }],
      bonds: [
        { a1: 0, a2: 1, order: 2 },
        { a1: 1, a2: 2, order: 2 },
        { a1: 2, a2: 3, order: 2 },
        { a1: 0, a2: 4, order: 1 },
        { a1: 0, a2: 5, order: 1 },
        { a1: 3, a2: 6, order: 1 },
        { a1: 3, a2: 7, order: 1 },
      ],
      xyz: [0, 0, 0, 1.3, 0, 0, 2.6, 0, 0, 3.9, 0, 0, -0.6, 1.1, 0, -0.6, -1.1, 0, ...cl3, ...h3],
    });
    expect(Object.values(cipIn3d(butatriene([4.5, 1.1, 0], [4.5, -1.1, 0])).bonds)).toEqual(["Z"]);
    expect(Object.values(cipIn3d(butatriene([4.5, -1.1, 0], [4.5, 1.1, 0])).bonds)).toEqual(["E"]);
    expect(cipIn3d(butatriene([4.5, 0, 1.1], [4.5, 0, -1.1])).bonds).toEqual({});
  });
});
