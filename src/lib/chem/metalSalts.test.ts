import { describe, expect, it } from "vitest";
import { abbreviationOf, abbreviationStructure } from "./abbreviations";
import { structureFormula, type GroupStructure } from "./ligands";

// A metal's salt of an oxoanion, typed as a label, read as its ions: the metal's cation and the anion of the charge its formula makes.

const of = (label: string) => abbreviationStructure(label)!;
/** Each atom as an element and its charge: "Ag+1", "N+1", "O-1", "O". */
const ions = (s: GroupStructure) => s.atoms.map((a) => `${a.el}${a.charge ? (a.charge > 0 ? `+${a.charge}` : a.charge) : ""}`);
const charge = (s: GroupStructure) => s.atoms.reduce((q, a) => q + (a.charge ?? 0), 0);

describe("a metal's salt of an oxoanion", () => {
  it("reads silver nitrate as Ag+ and nitrate - N+ with one N=O and two O- - never silver with three NO", () => {
    const s = of("AgNO3");
    expect([structureFormula(s), ions(s), charge(s)]).toEqual(["AgNO3", ["Ag+1", "N+1", "O", "O-1", "O-1"], 0]);
    // (no bond to the silver: the ions apart, as a salt is drawn)
    expect(s.bonds.every((b) => s.atoms[b.a1].el !== "Ag" && s.atoms[b.a2].el !== "Ag")).toBe(true);
    expect(s.bonds.filter((b) => b.order === 2)).toHaveLength(1);
    expect(abbreviationOf("AgNO3")?.kind).toBe("reagent");
  });

  it("balances the metal's charge on the anions': Cu(NO3)2 Cu2+, Fe(NO3)3 Fe3+, Fe2(SO4)3 Fe3+, Ca3(PO4)2 Ca2+", () => {
    const cases: [string, string, string][] = [
      ["Cu(NO3)2", "CuN2O6", "Cu+2"],
      ["Ba(NO3)2", "BaN2O6", "Ba+2"],
      ["Fe(NO3)3", "FeN3O9", "Fe+3"],
      ["Mg(ClO4)2", "Cl2MgO8", "Mg+2"],
      ["LiClO4", "ClLiO4", "Li+1"],
      ["CuSO4", "CuO4S", "Cu+2"],
      ["Fe2(SO4)3", "Fe2O12S3", "Fe+3"],
      ["Ag2CO3", "CAg2O3", "Ag+1"],
      ["CaCO3", "CCaO3", "Ca+2"],
      ["Ca3(PO4)2", "Ca3O8P2", "Ca+2"],
      ["NaNO3", "NNaO3", "Na+1"],
      ["KNO3", "KNO3", "K+1"],
    ];
    for (const [label, formula, metal] of cases) {
      const s = of(label);
      expect([structureFormula(s), ions(s)[0], charge(s)], label).toEqual([formula, metal, 0]);
    }
  });

  it("leaves a halide, a group bound by one bond and a complex's formula as they were read: CuCl2, AgOTf, Cu(OAc)2, MoO2Cl2", () => {
    expect(abbreviationOf("CuCl2")?.kind).toBe("complex");
    expect(abbreviationOf("AgOTf")?.kind).toBe("complex");
    expect(abbreviationOf("Cu(OAc)2")?.kind).toBe("complex");
    expect(abbreviationOf("MoO2Cl2")?.kind).toBe("complex");
  });
});
