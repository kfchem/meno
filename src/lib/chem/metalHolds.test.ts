import { describe, expect, it } from "vitest";
import { readSmiles } from "./smiles";
import { vdwRadius } from "./elements";
import { transitionMetal } from "./perception/elements";
import {
  covalentLength,
  dElectrons,
  FLOORS,
  floorPairs,
  keptFrames,
  keptMade,
  ligandAnions,
  etaSystems,
  madeChecks,
  metalGeometries,
  metalHolds,
  metalHoldsOf,
  runInto,
  tornFrom,
  underFloor,
  type HoldsAtom,
  type HoldsBond,
} from "./metalHolds";

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
    // (twelve still at 60)
    const twelve = graph(`[U](F)(F)(F)(F)(F)(F)(F)(F)(F)(F)(F)F`);
    expect(new Set(floorPairs(twelve.atoms, twelve.bonds).map((p) => p.angle))).toEqual(new Set([60]));
    expect(floorPairs(twelve.atoms, twelve.bonds)).toHaveLength(66);
    const thirteen = graph(`[U](F)(F)(F)(F)(F)(F)(F)(F)(F)(F)(F)(F)F`);
    expect(floorPairs(thirteen.atoms, thirteen.bonds)).toEqual([]);
    // (an alkene bound side on - Zeise's anion - none: its carbon and the cis Cl come near 71 degrees)
    const zeise = graph("Cl[Pt-](Cl)(Cl)1CC1");
    expect(floorPairs(zeise.atoms, zeise.bonds)).toEqual([]);
    // (a ring bound through a star at its centre, two Cl beside it - a half-sandwich: none, its ring's atoms spread round)
    const half: HoldsAtom[] = [{ el: "Fe", charge: 0 }, { el: "Cl", charge: 0 }, { el: "Cl", charge: 0 }, ...[1, 2, 3, 4, 5].map(() => ({ el: "C", charge: 0 })), { el: "*", charge: 0 }];
    const halfBonds: HoldsBond[] = [
      { a: 0, b: 1, order: 1 },
      { a: 0, b: 2, order: 1 },
      ...[3, 4, 5, 6, 7].map((c, k) => ({ a: c, b: 3 + ((k + 1) % 5), order: k % 2 ? 1 : 2 })),
      { a: 0, b: 8, order: 1, dative: true, endpoints: [3, 4, 5, 6, 7] },
    ];
    expect(floorPairs(half, halfBonds)).toEqual([]);
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
    // (d8: PdCl2(PMe3)2 and [PtCl4]2- held square planar)
    const pd2 = graph("Cl[Pd](Cl)(P(C)(C)C)P(C)(C)C");
    expect(metalGeometries(pd2.atoms, pd2.bonds)).toEqual([{ metal: 1, as: "square planar", d: 8 }]);
    const pt = graph("Cl[Pt-2](Cl)(Cl)Cl");
    expect(metalGeometries(pt.atoms, pt.bonds)).toEqual([{ metal: 1, as: "square planar", d: 8 }]);
    // (cisplatin with its ammines drawn as dative bonds: neutral donors, d8)
    const dative: HoldsAtom[] = [{ el: "Pt", charge: 0 }, { el: "Cl", charge: 0 }, { el: "Cl", charge: 0 }, { el: "N", charge: 0 }, { el: "N", charge: 0 }];
    const dativeBonds: HoldsBond[] = [
      { a: 0, b: 1, order: 1 },
      { a: 0, b: 2, order: 1 },
      { a: 3, b: 0, order: 1, dative: true },
      { a: 4, b: 0, order: 1, dative: true },
    ];
    expect(dElectrons(dative, dativeBonds, 0)).toBe(8);
    expect(metalGeometries(dative, dativeBonds)).toEqual([{ metal: 0, as: "square planar", d: 8 }]);
  });

  it("takes the d and f blocks for metals, none beside them: Sc to Zn, Y to Cd, La to Hg, Ac to Cn", () => {
    for (const el of ["Sc", "Zn", "Y", "Cd", "La", "Eu", "Lu", "Hf", "Hg", "Ac", "U", "Cn"]) expect(transitionMetal.has(el), el).toBe(true);
    for (const el of ["Ca", "Ga", "Sr", "In", "Ba", "Tl", "Ra", "Nh"]) expect(transitionMetal.has(el), el).toBe(false);
  });

  it("gives the plugin the rules' numbers as they are: bond slack, eta bounds, square-planar angles, a bridge's slack", () => {
    const holds = metalHolds(graph("Cl[Pd](Cl)(P(C)(C)C)P(C)(C)C").atoms, graph("Cl[Pd](Cl)(P(C)(C)C)P(C)(C)C").bonds)!;
    expect(holds).toMatchObject({ slack: 0.05, etaClear: 2.6, etaApart: 2.9, etaNear: 2.5, bridgeSlack: 10, planar: { trans: [172, 180], cis: [85, 95] } });
    expect(holds.floorRule).toEqual([
      [6, 75],
      [12, 60],
    ]);
  });

  it("names the lighter metal of its group that stands in for each metal the force field may have no type for", () => {
    const standIn = (el: string) => {
      const g = graph(`Cl[${el}]Cl`);
      return metalHolds(g.atoms, g.bonds)!.standIn;
    };
    const table = { Ru: "Fe", Os: "Fe", Rh: "Co", Ir: "Co", W: "Mo", Zr: "Ti", Hf: "Ti", Y: "Sc" };
    for (const [el, as] of Object.entries(table)) expect(standIn(el), el).toEqual([{ el, as }]);
    expect(standIn("Pd")).toEqual([]);
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
    // (each ring carbon held at Fe-C's covalent length and 0.15: 2.06, ferrocene's measured about 2.05)
    const lengths = metalHolds(atoms, bonds)!.eta[0].lengths;
    expect(lengths).toHaveLength(5);
    for (const l of lengths) expect(l).toBeCloseTo(2.06, 6);
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
    // (four degrees under each floor kept, six set aside: at 75 and at 60)
    for (const floor of [75, 60]) {
      const fl = [{ metal: 0, j: 1, k: 2, angle: floor }];
      expect(underFloor(at(floor - 4), fl), `${floor}`).toBeNull();
      expect(underFloor(at(floor - 6), fl), `${floor}`).toMatchObject({ angle: floor });
    }
    const made = { atoms: [{ el: "Pd" }, { el: "Cl" }, { el: "Cl" }], frames: [at(90), at(60)], energies: [-1, -0.9], how: [{ label: "Kept", text: "2 of 2 embedded (10 sought)" }] };
    const checks = { floors, contacts: [], held: [] };
    const kept = keptMade(made, checks);
    expect(kept.frames).toEqual([at(90)]);
    expect(kept.energies).toEqual([-1]);
    expect(kept.how).toEqual([...made.how, { label: "Set aside", text: "1 of 2: two ligands at Pd closer than the 75° floor held (narrowest 60°)" }]);
    expect(keptFrames(made.frames, checks)).toEqual([0]);
    expect(keptFrames(made.frames, null)).toEqual([0, 1]);
    expect(() => keptMade({ ...made, frames: [at(60)], energies: [-1] }, checks)).toThrow("every structure made of it came out with two ligands at Pd closer than the 75° they were held apart");
    // (none set aside: as it came)
    expect(keptMade({ ...made, frames: [at(90)] }, checks).how).toEqual(made.how);
    // (the search's own rows left as it wrote them, Meno's after them)
    const own = [
      { label: "Dropped", text: "1: two ligands at Pd closer than the 75° floor held (narrowest 62°)" },
      { label: "Kept", text: "2 of 3 embedded (10 sought)" },
      { label: "Made by", text: "the program" },
    ];
    expect(keptMade({ ...made, how: own }, checks).how).toEqual([...own, { label: "Set aside", text: "1 of 2: two ligands at Pd closer than the 75° floor held (narrowest 60°)" }]);
  });

  it("sets aside a conformer with two atoms nearer than 0.65 of their contact, keeping one at 0.66", () => {
    // (butane's end carbons, bonded to no one same atom: its one pair)
    const g = graph("CCCC");
    const checks = madeChecks(g.atoms, g.bonds, null);
    expect(checks.contacts.map(({ i, j }) => [i, j])).toEqual([[0, 3]]);
    const contact = 2 * vdwRadius("C");
    const frame = (share: number) => [0, 0, 0, 0, 1.5, 0, share * contact, 1.5, 0, share * contact, 0, 0];
    expect(runInto(frame(0.66), checks.contacts)).toBeNull();
    expect(runInto(frame(0.64), checks.contacts)).toMatchObject({ i: 0, j: 3 });
  });

  it("sets aside a conformer with a bond to a metal more than 0.15 of its length off, keeping one at 0.14", () => {
    // (Pd at the origin, its Cl at its length; its P at 1.14, then 1.16, of its own)
    const g = graph("Cl[Pd]P");
    const checks = madeChecks(g.atoms, g.bonds, metalHolds(g.atoms, g.bonds));
    const [pdCl, pdP] = [covalentLength("Pd", "Cl", 1)!, covalentLength("Pd", "P", 1)!];
    const frame = (share: number) => [pdCl, 0, 0, 0, 0, 0, 0, share * pdP, 0];
    for (const share of [0.86, 1, 1.14]) expect(tornFrom(frame(share), checks.held), `${share}`).toBeNull();
    for (const share of [0.84, 1.16]) expect(tornFrom(frame(share), checks.held), `${share}`).toMatchObject({ metal: 1, atom: 2 });
  });
});
