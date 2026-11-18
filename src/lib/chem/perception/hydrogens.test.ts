/**
 * The core's hydrogen count and valence (foundation part 12): the known answers by hand that stood beside `implicitHydrogens` in
 * lib/chem/molecule (moved with it), and the one count on a graph, `hydrogenCounts`, an aromatic bond by its Kekule order.
 */
import { describe, expect, it } from "vitest";
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
