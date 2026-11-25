/**
 * A label led by a main-group metal of groups 1, 2 and 13, with the halides written on it - MgBr, BrMg, AlCl2 - on a carbon: read as
 * that metal, bonded to the carbon, with its halides, as a transition metal's formula on a bond is (PdCl). The chemistry check's ruling
 * on a metal and the ligand tokens written with it: the tokens that are elements are real ligands on the metal, in its formula.
 */
import { describe, expect, it } from "vitest";
import { abbreviationOf } from "../../../../lib/chem/abbreviations";
import { placedAbbreviation } from "../../../../lib/chem/abbreviationPlace";
import { emptyWorkspaceDocument, expandAbbreviation } from "../document";
import type { Model } from "../store/types";
import { partFormula } from "./cleanUp";
import { identityOfDrawn } from "./identityOf";
import { drawnFromSmiles } from "./testdata/identityCases";

/** `smiles` drawn, its atom at `at` written as the label `label` instead. */
function labelled(smiles: string, at: number, label: string): Model {
  const m = drawnFromSmiles(smiles);
  return { ...m, atoms: m.atoms.map((a, i) => (i === at ? { ...a, el: label } : a)) };
}
const id = (m: Model) => identityOfDrawn(m).text;
const expanded = (m: Model, at: number) => expandAbbreviation({ ...emptyWorkspaceDocument(), model: m, nextId: 100 }, m.atoms[at].id).model;

describe("a main-group metal's label on a carbon, read as the metal with its halides", () => {
  // (each label expanded where it is - Expand label - and the result read as a structure drawn out)
  it("PhMgBr drawn Ph-MgBr: Mg bonded to the ring's C and to Br - C6H5BrMg - and BrMg, the label left of its bond, the same molecule", () => {
    // (by hand: phenylmagnesium bromide, C6H5-Mg-Br; the ring's five CH give H5, Mg two bonds and no H, Br one: C6H5BrMg)
    const drawn = drawnFromSmiles("c1ccccc1[Mg]Br");
    const right = labelled("c1ccccc1C", 6, "MgBr");
    const left = labelled("c1ccccc1C", 6, "BrMg");
    expect(id(expanded(right, 6))).toBe(id(drawn));
    expect(id(expanded(left, 6))).toBe(id(expanded(right, 6)));
    expect(partFormula(expanded(right, 6))).toBe("C6H5BrMg");
    expect(partFormula(expanded(left, 6))).toBe("C6H5BrMg");
  });

  it("R-AlCl2 (ethylaluminium dichloride): Al bonded to the C and to two Cl - C2H5AlCl2", () => {
    // (by hand: CH3-CH2-AlCl2, the CH2 two H, the CH3 three: H5; Al three bonds and no H)
    const m = labelled("CCC", 2, "AlCl2");
    expect(id(expanded(m, 2))).toBe(id(drawnFromSmiles("CC[Al](Cl)Cl")));
    expect(partFormula(expanded(m, 2))).toBe("C2H5AlCl2");
  });

  it("the label alone, laid out bonded: the metal first, at the bond, its halides on it", () => {
    for (const [label, atoms] of [
      ["MgBr", ["Mg", "Br"]],
      ["BrMg", ["Mg", "Br"]],
      ["AlCl2", ["Al", "Cl", "Cl"]],
    ] as const) {
      const s = placedAbbreviation(label, { x: 1.5, y: 0 }, 1.5)!;
      expect(s.atoms.map((a) => a.el), label).toEqual(atoms);
      expect(s.bonds.every((b) => b.a1 === 0 || b.a2 === 0), label).toBe(true);
    }
  });
});

describe("what reads as it did", () => {
  it("MgBr2 unbonded, MeMgBr and n-BuLi stay the formulas they were; ZnCl and PdCl the metal's formula, as before", () => {
    expect(abbreviationOf("MgBr2")?.kind).toBe("reagent");
    expect(abbreviationOf("MeMgBr")?.kind).toBe("reagent");
    expect(abbreviationOf("n-BuLi")?.kind).toBe("reagent");
    expect(abbreviationOf("ZnCl")?.kind).toBe("complex");
    expect(abbreviationOf("PdCl")?.kind).toBe("complex");
  });

  it("Li alone is the element, no label; L, Ln, X and a metal written with them - LnPd, L2Mg, MgX - read as nothing yet", () => {
    for (const label of ["Li", "L", "Ln", "X", "LnPd", "L2Mg", "MgX"]) expect(abbreviationOf(label), label).toBeUndefined();
  });
});
