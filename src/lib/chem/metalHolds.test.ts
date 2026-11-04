import { describe, expect, it } from "vitest";
import { readSmiles } from "./smiles";
import { dElectrons, FLOORS, floorPairs, keptMade, ligandAnions, etaSystems, metalGeometries, metalHolds, metalHoldsOf, underFloor, type HoldsAtom, type HoldsBond } from "./metalHolds";

/** A structure from SMILES as the holds read it. */
function graph(smiles: string): { atoms: HoldsAtom[]; bonds: HoldsBond[] } {
  const s = readSmiles(smiles);
  return { atoms: s.atoms.map((a) => ({ el: a.el, charge: a.charge ?? 0 })), bonds: s.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })) };
}

describe("what Meno holds a metal complex to", () => {
  it("sets its floor below the narrowest angle of the ideal polyhedra of six points: a trigonal prism with equal edges", () => {
    // (its corners on a sphere: neighbours 2 asin(sqrt(3/7)) apart)
    const corners = [-1, 1].flatMap((z) => [0, 1, 2].map((k) => [Math.cos((2 * Math.PI * k) / 3), Math.sin((2 * Math.PI * k) / 3), (z * Math.sqrt(3)) / 2]));
    const [p, q] = corners;
    const angle = (Math.acos((p[0] * q[0] + p[1] * q[1] + p[2] * q[2]) / (p[0] ** 2 + p[1] ** 2 + p[2] ** 2)) * 180) / Math.PI;
    expect(angle).toBeCloseTo((2 * Math.asin(Math.sqrt(3 / 7)) * 180) / Math.PI, 6);
    expect(angle).toBeCloseTo(81.79, 2);
    expect(FLOORS[0][1]).toBeLessThan(angle);
  });

  it("holds two ligands' donors a floor's angle apart - never within one ligand, nor a hydride - by how many atoms are bonded", () => {
    // (three en on one metal: of its fifteen pairs, the three within an en are not held, the twelve across are)
    const co = graph("N1CCN[Co+3]123(NCCN2)NCCN3");
    const pairs = floorPairs(co.atoms, co.bonds);
    expect(pairs).toHaveLength(12);
    expect(new Set(pairs.map((p) => p.angle))).toEqual(new Set([75]));
    // (a cis dihydride: its hydrides are not held at all, its other ligands are)
    const os = graph("[H][Os]([H])(Cl)(Cl)(P(C)(C)C)P(C)(C)C");
    const held = floorPairs(os.atoms, os.bonds);
    expect(held).toHaveLength(6);
    expect(held.some((p) => os.atoms[p.j].el === "H" || os.atoms[p.k].el === "H")).toBe(false);
    // (seven and eight at 60 degrees; none past twelve)
    for (const [smiles, n] of [["F[Zr-3](F)(F)(F)(F)(F)F", 7], ["Cl[Os](Cl)(Cl)(Cl)(Br)(Br)(Br)Br", 8]] as const) {
      const g = graph(smiles);
      const ps = floorPairs(g.atoms, g.bonds);
      expect(ps).toHaveLength((n * (n - 1)) / 2);
      expect(new Set(ps.map((p) => p.angle))).toEqual(new Set([60]));
    }
    const thirteen = graph(`[U](F)(F)(F)(F)(F)(F)(F)(F)(F)(F)(F)(F)F`);
    expect(floorPairs(thirteen.atoms, thirteen.bonds)).toEqual([]);
    // (an alkene bound side on - Zeise's anion - none: its carbon and the cis Cl come near 71 degrees)
    const zeise = graph("Cl[Pt-](Cl)(Cl)1CC1");
    expect(floorPairs(zeise.atoms, zeise.bonds)).toEqual([]);
  });

  it("counts a metal's d electrons by its donors, a dative one neutral - d8 square planar, d10 tetrahedral", () => {
    const d = (smiles: string) => {
      const g = graph(smiles);
      return dElectrons(g.atoms, g.bonds, g.atoms.findIndex((a) => ["Pd", "Pt", "Ni", "Au", "Zn"].includes(a.el)));
    };
    expect(d("Cl[Pd](Cl)(P(C)(C)C)P(C)(C)C")).toBe(8);
    expect(d("P(C)(C)(C)[Pd](P(C)(C)C)(P(C)(C)C)P(C)(C)C")).toBe(10);
    expect(d("[O+]#[C-][Ni]([C-]#[O+])([C-]#[O+])[C-]#[O+]")).toBe(10);
    expect(d("Cl[Au-](Cl)(Cl)Cl")).toBe(8);
    // (an ammine drawn as N alone reads as an amide, as its valence gives it hydrogens: no count to be sure of)
    const cis = graph("N[Pt](N)(Cl)Cl");
    expect(metalGeometries(cis.atoms, cis.bonds)).toEqual([]);
    const pd0 = graph("P(C)(C)(C)[Pd](P(C)(C)C)(P(C)(C)C)P(C)(C)C");
    expect(metalGeometries(pd0.atoms, pd0.bonds)).toEqual([{ metal: 4, as: "tetrahedral", d: 10 }]);
  });

  it("takes a ring drawn neutral over its metal as the cyclopentadienide it is bound as", () => {
    // (Fe 0, a ring of five carbons 1-5 drawn with two double bonds, its star 6)
    const atoms: HoldsAtom[] = [{ el: "Fe", charge: 0 }, ...[1, 2, 3, 4, 5].map(() => ({ el: "C", charge: 0 })), { el: "*", charge: 0 }];
    const bonds: HoldsBond[] = [
      { a: 1, b: 2, order: 2 },
      { a: 2, b: 3, order: 1 },
      { a: 3, b: 4, order: 2 },
      { a: 4, b: 5, order: 1 },
      { a: 5, b: 1, order: 1 },
      { a: 0, b: 6, order: 1, dative: true, endpoints: [1, 2, 3, 4, 5] },
    ];
    expect(etaSystems(atoms, bonds)).toEqual([{ metal: 0, star: 6, atoms: [1, 2, 3, 4, 5] }]);
    expect(ligandAnions(atoms, bonds, etaSystems(atoms, bonds))).toEqual([{ atom: 5, hydrogens: 1, metal: 0 }]);
    // (no floor at a metal with a ring on it)
    expect(metalHolds(atoms, bonds)!.floors).toEqual([]);
  });

  it("holds a metal's hydrogens its file gives it past its bonds as hydrides, and counts them bonded", () => {
    const block = ["", "  test", "", "  0  0  0  0  0  0  0  0  0  0999 V3000", "M  V30 BEGIN CTAB", "M  V30 COUNTS 3 2 0 0 0", "M  V30 BEGIN ATOM",
      "M  V30 1 Os 0 0 0 0 VAL=4", "M  V30 2 Cl 1 0 0 0", "M  V30 3 Cl -1 0 0 0", "M  V30 END ATOM", "M  V30 BEGIN BOND", "M  V30 1 1 1 2", "M  V30 2 1 1 3",
      "M  V30 END BOND", "M  V30 END CTAB", "M  END"].join("\n");
    const holds = metalHoldsOf(block)!;
    expect(holds.hydrides).toEqual([{ metal: 0, count: 2, length: 1.61 }]);
    expect(holds.floors).toEqual([{ metal: 0, j: 1, k: 2, angle: 75 }]);
    // (and names the lighter metal of its group that stands in for it)
    expect(holds.standIn).toEqual([{ el: "Os", as: "Fe" }]);
  });

  it("sets aside a conformer whose ligands came out more than five degrees under their floor, saying so; refuses where none is left", () => {
    // (Cl-M-Cl at 90 degrees, then at 60: under the 75 degree floor by 15)
    const at = (deg: number) => [0, 0, 0, 2, 0, 0, 2 * Math.cos((deg * Math.PI) / 180), 2 * Math.sin((deg * Math.PI) / 180), 0];
    const floors = [{ metal: 0, j: 1, k: 2, angle: 75 }];
    expect(underFloor(at(72), floors)).toBeNull();
    expect(underFloor(at(60), floors)).toMatchObject({ metal: 0, angle: 75 });
    const made = { atoms: [{ el: "Pd" }, { el: "Cl" }, { el: "Cl" }], frames: [at(90), at(60)], energies: [-1, -0.9], how: [{ label: "Kept", text: "2 of 2 embedded (10 sought)" }] };
    const checks = { floors, contacts: [], held: [] };
    const kept = keptMade(made, checks);
    expect(kept.frames).toEqual([at(90)]);
    expect(kept.energies).toEqual([-1]);
    expect(kept.how).toEqual([
      { label: "Dropped", text: "1: two ligands at Pd closer than the 75° floor held (narrowest 60°)" },
      { label: "Kept", text: "1 of 2 embedded (10 sought)" },
    ]);
    expect(() => keptMade({ ...made, frames: [at(60)], energies: [-1] }, checks)).toThrow("every structure made of it came out with two ligands at Pd closer than the 75° they were held apart");
    // (none set aside: as it came)
    expect(keptMade({ ...made, frames: [at(90)] }, checks).how).toEqual(made.how);
    // (where the search set one aside itself and says so: added to, not said twice, of those it embedded)
    const own = [
      { label: "Dropped", text: "1: two ligands at Pd closer than the 75° floor held (narrowest 62°)" },
      { label: "Kept", text: "2 of 3 embedded (10 sought)" },
      { label: "Made by", text: "the program" },
    ];
    expect(keptMade({ ...made, how: own }, checks).how).toEqual([
      { label: "Dropped", text: "2: two ligands at Pd closer than the 75° floor held (narrowest 62°); two ligands at Pd closer than the 75° floor held (narrowest 60°)" },
      { label: "Kept", text: "1 of 3 embedded (10 sought)" },
      { label: "Made by", text: "the program" },
    ]);
  });
});
