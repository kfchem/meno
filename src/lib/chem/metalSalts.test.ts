import { describe, expect, it } from "vitest";
import { abbreviationOf, abbreviationStructure, labelRefused } from "./abbreviations";
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

  it("reads mercury(I) as the Hg2 2+ ion, its two Hg bonded, each +1, and mercury(II) as Hg2+: Hg2(NO3)2, Hg2SO4, Hg(NO3)2", () => {
    const hgHg = (s: GroupStructure) => s.bonds.filter((b) => s.atoms[b.a1].el === "Hg" && s.atoms[b.a2].el === "Hg").map((b) => b.order);
    for (const label of ["Hg2(NO3)2", "Hg2SO4"]) {
      const s = of(label);
      expect([ions(s).slice(0, 2), hgHg(s), charge(s)], label).toEqual([["Hg+1", "Hg+1"], [1], 0]);
    }
    const two = of("Hg(NO3)2");
    expect([ions(two)[0], hgHg(two), charge(two)]).toEqual(["Hg+2", [], 0]);
    // (one Hg+ alone is no ion: HgNO3, mercury(I)'s empirical formula, does not say the pair - left unread, by every reader; two Hg2+
    //  are not bonded)
    expect([abbreviationOf("HgNO3") ?? null, abbreviationStructure("HgNO3")]).toEqual([null, null]);
    expect([ions(of("Hg2(SO4)2")).slice(0, 2), hgHg(of("Hg2(SO4)2"))]).toEqual([["Hg+2", "Hg+2"], []]);
    // (another metal's two +1 cations stay two ions: silver carbonate)
    expect(hgHg(of("Ag2CO3"))).toEqual([]);
    expect(of("Ag2CO3").bonds.some((b) => of("Ag2CO3").atoms[b.a1].el === "Ag")).toBe(false);
  });

  it("gives the metal a charge of one to four, a whole one: Ce(NO3)4 Ce4+; Ca2(NO3)3, whose calcium would be 1.5+, not read", () => {
    expect([ions(of("Ce(NO3)4"))[0], charge(of("Ce(NO3)4"))]).toEqual(["Ce+4", 0]);
    expect(abbreviationStructure("Ca2(NO3)3")).toBeNull();
  });

  it("reads a nitrate of each metal on its list (the formula as written, its metal's charge the one it makes)", () => {
    const listed = ["Be", "Mg", "Ca", "Sr", "Ba", "Zn", "Cd", "Hg", "Al", "Ga", "In", "Tl", "Sn", "Pb", "Bi", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Y", "Zr", "Nb", "Mo", "Ru", "Rh", "Pd", "Ag", "La", "Ce", "Nd", "Sm", "Eu", "Gd", "Yb", "Lu", "Hf", "W", "Os", "Ir", "Pt", "Au", "U"];
    for (const el of listed) expect([ions(of(`${el}(NO3)2`))[0], charge(of(`${el}(NO3)2`))], el).toEqual([`${el}+2`, 0]);
  });

  it("leaves a halide, a group bound by one bond and a complex's formula as they were read: CuCl2, AgOTf, Cu(OAc)2, MoO2Cl2", () => {
    expect(abbreviationOf("CuCl2")?.kind).toBe("complex");
    expect(abbreviationOf("AgOTf")?.kind).toBe("complex");
    expect(abbreviationOf("Cu(OAc)2")?.kind).toBe("complex");
    expect(abbreviationOf("MoO2Cl2")?.kind).toBe("complex");
  });
});

describe("a formula read as two O bonded that it does not write together", () => {
  it("is not read, and says why: MoO2NO3 and VO2NO3 - no compounds - would be three O-O-N=O", () => {
    for (const label of ["MoO2NO3", "VO2NO3"]) {
      expect([abbreviationOf(label) ?? null, abbreviationStructure(label)], label).toEqual([null, null]);
      expect(labelRefused(label), label).toBe("it would bond two O the label does not bond");
    }
  });

  it("leaves every formula read without an O-O as it was, and refuses nothing it finds no structure for", () => {
    for (const label of ["AgNO3", "Cu(NO3)2", "MoO2Cl2", "UO2Cl2", "Pd(OAc)2", "NaNO3", "KMnO4", "OsO4"]) {
      expect(abbreviationStructure(label), label).not.toBeNull();
      expect(labelRefused(label), label).toBeUndefined();
    }
    expect(labelRefused("CH2CH2")).toBeUndefined();
  });
});

describe("an oxo formula past its metal's highest oxidation state", () => {
  it("is not read as written, and says why: CrO5 and MoO5, five oxo each, past +6", () => {
    for (const [label, el] of [["CrO5", "Cr"], ["MoO5", "Mo"]] as const) {
      expect([abbreviationOf(label) ?? null, abbreviationStructure(label)], label).toEqual([null, null]);
      expect(labelRefused(label), label).toBe(`its 5 oxo would take ${el} to +10, past +6, its highest oxidation state`);
    }
  });

  it("counts the other groups by a single bond too: MoO3Cl2 (+8), WO2Cl3 (+7), TiO3 (+6) and VO3 (+6) not read as written", () => {
    expect(labelRefused("MoO3Cl2")).toBe("its 3 oxo and 2 other groups would take Mo to +8, past +6, its highest oxidation state");
    for (const label of ["WO2Cl3", "TiO3", "VO3"]) expect([abbreviationOf(label) ?? null, labelRefused(label) != null], label).toEqual([null, true]);
  });

  it("reads one at its highest state or below as before: CrO3, MoO3, WO3, OsO4, MoO2Cl2, ReO3Me, CrO2Cl2, VOCl3, NbOCl3, TiOCl2, MnO3Cl", () => {
    for (const label of ["CrO3", "MoO3", "WO3", "OsO4", "MoO2Cl2", "ReO3Me", "CrO2Cl2", "VOCl3", "NbOCl3", "TiOCl2", "MnO3Cl"]) {
      expect(abbreviationStructure(label), label).not.toBeNull();
      expect(labelRefused(label), label).toBeUndefined();
    }
  });
});
