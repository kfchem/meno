/**
 * The core's hydrogen count and valence (foundation part 12): the known answers by hand that stood beside `implicitHydrogens` in
 * lib/chem/molecule (moved with it), and the one count on a graph, `hydrogenCounts`, an aromatic bond by its Kekule order.
 */
import { describe, expect, it } from "vitest";
import { readSmiles } from "../smiles";
import { canTakeBond, hydrogenCounts, hydrogensOn, implicitHydrogens, mostBonds, valenceOrder, valencesAt, type CountedAtom, type CountedBond } from "./hydrogens";

describe("implicitHydrogens", () => {
  it("moves the valence with the charge the way the electrons go", () => {
    expect(implicitHydrogens("N", 0, 1)).toBe(4); // NH4+
    expect(implicitHydrogens("N", 4, 1)).toBe(0); // a quaternary ammonium
    expect(implicitHydrogens("N", 3, 1)).toBe(1); // a protonated amine
    expect(implicitHydrogens("O", 1, -1)).toBe(0); // an alkoxide, a carboxylate's O
    expect(implicitHydrogens("O", 1, 1)).toBe(2); // R-OH2+
    expect(implicitHydrogens("N", 1, -1)).toBe(1); // RNH-
    expect(implicitHydrogens("C", 3, 1)).toBe(0); // a carbocation
    expect(implicitHydrogens("C", 2, 1)).toBe(1);
    expect(implicitHydrogens("C", 3, -1)).toBe(0); // a carbanion
    expect(implicitHydrogens("B", 0, -1)).toBe(4); // BH4-
    expect(implicitHydrogens("Cl", 0, -1)).toBe(0); // chloride
  });

  it("gives an unpaired electron a bond's place, and a carbene's pair two", () => {
    expect(implicitHydrogens("C", 3, 0, "doublet")).toBe(0); // a tertiary radical
    expect(implicitHydrogens("C", 1, 0, "doublet")).toBe(2); // CH2•
    expect(implicitHydrogens("C", 2, 0, "singlet")).toBe(0);
    expect(implicitHydrogens("C", 0, 0, "triplet")).toBe(2); // CH2:
  });

  it("gives none to what it has no valence for", () => {
    expect(implicitHydrogens("Fe", 0, 2)).toBe(0);
    expect(implicitHydrogens("Na", 0, 1)).toBe(0);
    expect(implicitHydrogens("R", 1)).toBe(0);
  });
});

describe("canTakeBond", () => {
  it("is where the valence is not yet met, as charge and unpaired electron leave it", () => {
    expect(canTakeBond("C", 3)).toBe(true);
    expect(canTakeBond("C", 4)).toBe(false);
    expect(canTakeBond("O", 2)).toBe(false);
    expect(canTakeBond("O", 2, 1)).toBe(true);
    expect(canTakeBond("O", 1, -1)).toBe(false);
    expect(canTakeBond("N", 3)).toBe(false);
    expect(canTakeBond("H", 0)).toBe(true);
    expect(canTakeBond("H", 1)).toBe(false);
    expect(canTakeBond("Pd", 4)).toBe(true);
  });
});

describe("mostBonds", () => {
  it("is an element's valence, a heavier one's highest, as its charge and an unpaired electron leave it; none for a metal", () => {
    expect([mostBonds("C"), mostBonds("O"), mostBonds("N", 1), mostBonds("O", -1), mostBonds("B", -1)]).toEqual([4, 2, 4, 1, 4]);
    expect([mostBonds("S"), mostBonds("P"), mostBonds("I"), mostBonds("Si"), mostBonds("P", -1), mostBonds("Si", -1), mostBonds("Si", -2), mostBonds("Si", 1)]).toEqual([6, 5, 7, 4, 6, 5, 6, 4]);
    expect([mostBonds("C", 0, "doublet"), mostBonds("C", 0, "singlet"), mostBonds("C", 1)]).toEqual([3, 2, 3]);
    expect(mostBonds("Pd")).toBeNull();
  });
});

describe("valencesAt", () => {
  it("is an element's own valence and, below the second row, its highest, as its charge leaves them; none for a metal", () => {
    expect([valencesAt("N"), valencesAt("N", 1), valencesAt("P"), valencesAt("S"), valencesAt("I"), valencesAt("C", 1)]).toEqual([[3], [4], [3, 5], [2, 6], [1, 7], [3]]);
    expect(valencesAt("Fe", 2)).toEqual([]);
  });
});

describe("valenceOrder", () => {
  it("is a bond's order; none for a dative, coordination or hydrogen bond, but two at a carbon that lends its pair", () => {
    expect([valenceOrder({ order: 2 }), valenceOrder({ order: 1, dative: true }, "N"), valenceOrder({ order: 1, coordination: true }, "C"), valenceOrder({ order: 1, hydrogen: true })]).toEqual([2, 0, 2, 0]);
  });
});

/** A graph from atoms written "el", "el+", "el-", "el." (a doublet), "el:" (a triplet), "elH2" (its hydrogens given), and bonds [a, b, order, kind?]. */
function graph(atoms: string[], bonds: [number, number, number, ("dative" | "coordination" | "hydrogen")?][]): [CountedAtom[], CountedBond[]] {
  const as = atoms.map((t): CountedAtom => {
    const m = /^([A-Z][a-z]?)(?:H(\d))?([+-]?)([.:]?)$/.exec(t)!;
    return { el: m[1], ...(m[2] ? { hs: Number(m[2]) } : {}), ...(m[3] ? { charge: m[3] === "+" ? 1 : -1 } : {}), ...(m[4] ? { radical: m[4] === "." ? "doublet" : "triplet" } : {}) };
  });
  return [as, bonds.map(([a, b, order, kind]) => ({ a, b, order, ...(kind ? { [kind]: true } : {}) }))];
}
const ring = (n: number, order: number): [number, number, number][] => Array.from({ length: n }, (_, i) => [i, (i + 1) % n, order]);

describe("hydrogenCounts: the one count on a graph", () => {
  it("counts a bare symbol's hydrogens, and an ion's, as its valence and charge leave them", () => {
    expect(hydrogenCounts(...graph(["C", "N", "O", "F"], []))).toEqual([4, 3, 2, 1]);
    expect(hydrogenCounts(...graph(["N+", "O+", "C+", "C-", "B-", "O-"], []))).toEqual([4, 3, 3, 3, 4, 1]);
    // (an alkoxide's O: none; a methyl radical's three; a triplet carbene's two)
    expect(hydrogenCounts(...graph(["C", "O-"], [[0, 1, 1]]))[1]).toBe(0);
    expect(hydrogenCounts(...graph(["C.", "C:"], []))).toEqual([3, 2]);
  });

  it("takes the hydrogens given over those its valence leaves", () => {
    expect(hydrogenCounts(...graph(["NH2", "CH0"], [[0, 1, 1]]))).toEqual([2, 0]);
  });

  it("counts an aromatic bond by its Kekule order, never as one and a half: pyridine's N none, pyrrole's one", () => {
    const pyridine = graph(["N", "C", "C", "C", "C", "C"], ring(6, 4));
    expect(hydrogenCounts(...pyridine)).toEqual([0, 1, 1, 1, 1, 1]);
    const pyrrole = graph(["N", "C", "C", "C", "C"], ring(5, 4));
    expect(hydrogenCounts(...pyrrole)).toEqual([1, 1, 1, 1, 1]);
    expect(hydrogensOn(...pyrrole, 0)).toBe(1);
  });

  it("leaves a phosphate's P and a sulfone's S none", () => {
    // (P(=O)(O)(O)O and CS(=O)(=O)C: the P's bonds sum to five, the S's to six)
    expect(hydrogenCounts(...graph(["P", "O", "O", "O", "O"], [[0, 1, 2], [0, 2, 1], [0, 3, 1], [0, 4, 1]]))).toEqual([0, 0, 1, 1, 1]);
    expect(hydrogenCounts(...graph(["S", "O", "O", "C", "C"], [[0, 1, 2], [0, 2, 2], [0, 3, 1], [0, 4, 1]]))).toEqual([0, 0, 0, 3, 3]);
  });

  it("counts a dative N->B as nothing at either end, and a carbon lending its pair to a metal as two: none on CO's or an NHC's carbon", () => {
    expect(hydrogenCounts(...graph(["N", "B"], [[0, 1, 1, "dative"]]))).toEqual([3, 3]);
    expect(hydrogenCounts(...graph(["C", "O", "Ni"], [[0, 1, 3], [0, 2, 1, "coordination"]]))).toEqual([0, 0, 0]);
    // (an NHC: its carbon's two bonds to N and the pair it lends)
    expect(hydrogenCounts(...graph(["C", "N", "N", "Pd"], [[0, 1, 1], [0, 2, 1], [0, 3, 1, "dative"]]))[0]).toBe(0);
  });

  it("counts a hydrogen bond, and a bond type past four, as nothing", () => {
    expect(hydrogenCounts(...graph(["O", "N"], [[0, 1, 1, "hydrogen"]]))).toEqual([2, 3]);
    expect(hydrogenCounts(...graph(["O", "N"], [[0, 1, 9]]))).toEqual([2, 3]);
  });
});

describe("the lowest valence at or above an atom's bonds (the chemistry check's ruling)", () => {
  /** Each atom's hydrogens of a SMILES, by the one count, its plain atoms' hydrogens left to it. */
  const counted = (smiles: string) => {
    const s = readSmiles(smiles);
    return hydrogenCounts(
      s.atoms.map((a) => ({ el: a.el, ...(a.charge ? { charge: a.charge } : {}), ...(a.hs != null ? { hs: a.hs } : {}) })),
      s.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })),
    );
  };
  const onFirst = (smiles: string, el: string) => counted(smiles)[readSmiles(smiles).atoms.findIndex((a) => a.el === el)];

  it("a P(V) of four bonds carries one H: dimethyl phosphite C2H7O3P, diphenylphosphine oxide; an S(IV) of three, one", () => {
    expect(onFirst("P(=O)(OC)OC", "P")).toBe(1);
    expect(counted("P(=O)(OC)OC").reduce((s, h) => s + h, 0)).toBe(7);
    expect(onFirst("O=P(c1ccccc1)c1ccccc1", "P")).toBe(1);
    expect(onFirst("CS=O", "S")).toBe(1);
    expect(implicitHydrogens("P", 4, 0, undefined, 0)).toBe(1);
    expect(implicitHydrogens("S", 3, 0, undefined, 0)).toBe(1);
    expect(implicitHydrogens("S", 5, 0, undefined, 0)).toBe(1);
    // (a caller that does not say which bonds go to metals: its element's own valence alone, as before - found in review)
    expect(implicitHydrogens("P", 4)).toBe(0);
    expect(implicitHydrogens("S", 3)).toBe(0);
  });

  it("none where none belongs: DMSO, triphenylphosphine oxide, a methyltriphenylphosphonium, a sulfone, PPh3, a phosphate, PF6-", () => {
    expect(onFirst("CS(C)=O", "S")).toBe(0);
    expect(onFirst("O=P(c1ccccc1)(c1ccccc1)c1ccccc1", "P")).toBe(0);
    expect(onFirst("C[P+](c1ccccc1)(c1ccccc1)c1ccccc1", "P")).toBe(0);
    expect(onFirst("CS(=O)(=O)C", "S")).toBe(0);
    expect(onFirst("P(c1ccccc1)(c1ccccc1)c1ccccc1", "P")).toBe(0);
    expect(onFirst("OP(=O)(O)O", "P")).toBe(0);
    expect(onFirst("F[P-](F)(F)(F)(F)F", "P")).toBe(0);
    expect(implicitHydrogens("P", 6, 0, undefined, 0)).toBe(0);
    expect(implicitHydrogens("S", 7, 0, undefined, 0)).toBe(0);
  });

  it("the lower valence first where it is enough: PH3, H2S, a phosphine's PH2, a thiol", () => {
    expect(implicitHydrogens("P", 0)).toBe(3);
    expect(implicitHydrogens("S", 0)).toBe(2);
    expect(onFirst("CP", "P")).toBe(2);
    expect(onFirst("CS", "S")).toBe(1);
  });
});

describe("a P, S or Se's valence step chosen by its bonds to non-metals (the chemistry check's ruling)", () => {
  it("a phosphine on a metal stays P(III), no H: Pd(PPh3)4's P; a P(V) of four bonds to non-metals carries one", () => {
    const ph = "P(c1ccccc1)(c1ccccc1)c1ccccc1";
    const s = readSmiles(`[Pd](${ph})(${ph})(${ph})${ph}`);
    const hs = hydrogenCounts(
      s.atoms.map((a) => ({ el: a.el, ...(a.charge ? { charge: a.charge } : {}), ...(a.hs != null && a.el !== "P" ? { hs: a.hs } : {}) })),
      s.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })),
    );
    expect(s.atoms.flatMap((a, i) => (a.el === "P" ? [hs[i]] : []))).toEqual([0, 0, 0, 0]);
    expect(implicitHydrogens("P", 4, 0, undefined, 1)).toBe(0);
    expect(implicitHydrogens("S", 3, 0, undefined, 1)).toBe(0);
    expect(implicitHydrogens("P", 4, 0, undefined, 0)).toBe(1);
  });
});

describe("Ge, As, Sb and Te carry the hydrogens their bonding number leaves; Sn, Pb, Al, Ga, In, Tl and Bi none unless written (part 12, E1)", () => {
  it("the bare symbol: AsH3, SbH3, GeH4, H2Te", () => {
    expect(implicitHydrogens("As", 0)).toBe(3);
    expect(implicitHydrogens("Sb", 0)).toBe(3);
    expect(implicitHydrogens("Ge", 0)).toBe(4);
    expect(implicitHydrogens("Te", 0)).toBe(2);
    expect(implicitHydrogens("Ge", 3)).toBe(1);
  });

  it("none where the bonds take the valence: trimethylarsine, SbPh3, dimethyl telluride, TeCl4, an arsenate, AsF6- and SbF6-", () => {
    expect(implicitHydrogens("As", 3)).toBe(0);
    expect(implicitHydrogens("Sb", 3)).toBe(0);
    expect(implicitHydrogens("Te", 2)).toBe(0);
    expect(implicitHydrogens("Te", 4, 0, undefined, 0)).toBe(0);
    expect(implicitHydrogens("As", 5, 0, undefined, 0)).toBe(0);
    expect(mostBonds("As", -1)).toBe(6);
    expect(mostBonds("Sb", -1)).toBe(6);
    expect(mostBonds("Te", 0)).toBe(6);
  });

  it("their ions: AsPh4+ none, a tellurolate RTe- none, a telluronium R3Te+ none, an arsenide R2As- none", () => {
    expect(implicitHydrogens("As", 4, 1)).toBe(0);
    expect(implicitHydrogens("Te", 1, -1)).toBe(0);
    expect(implicitHydrogens("Te", 3, 1)).toBe(0);
    expect(implicitHydrogens("As", 2, -1)).toBe(0);
  });

  it("Sn, Pb, Al, Ga, In, Tl, Bi, Po and At none, whatever their bonds or charge: Bu3Sn, SnCl2, PbCl2, AlCl3, Bi3+, Al3+, Tl+", () => {
    for (const el of ["Sn", "Pb", "Al", "Ga", "In", "Tl", "Bi", "Po", "At"]) for (const bonds of [0, 2, 3]) expect(implicitHydrogens(el, bonds), el).toBe(0);
    expect(implicitHydrogens("Bi", 0, 3)).toBe(0);
    expect(implicitHydrogens("Tl", 0, 1)).toBe(0);
    expect(mostBonds("Sn")).toBeNull();
  });

  it("a hydrogen written on one is kept and counted: Bu3SnH, an Al-H", () => {
    expect(hydrogenCounts([{ el: "Sn", hs: 1 }, { el: "C" }, { el: "C" }, { el: "C" }], [1, 2, 3].map((b) => ({ a: 0, b, order: 1 })))[0]).toBe(1);
    expect(hydrogenCounts([{ el: "Al", hs: 1 }, { el: "C" }, { el: "C" }], [1, 2].map((b) => ({ a: 0, b, order: 1 })))[0]).toBe(1);
  });
});
