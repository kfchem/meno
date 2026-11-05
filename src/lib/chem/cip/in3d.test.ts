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
