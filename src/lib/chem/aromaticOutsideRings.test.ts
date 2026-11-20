/**
 * Bonds marked aromatic outside any ring, read by the typed routes (perception/kekule `outsideRingRefusal`; such a bond takes
 * its Kekulé form by the same matching as one in a ring): a carboxyl written C(:O):O is acetic acid, never ethane-1,1-diol; where no form
 * closes them, refused in words, never filled with an H.
 */
import { describe, expect, it } from "vitest";
import { smilesInput } from "../layout/smilesInput";
import { identity } from "./identity";
import { structureProblem } from "./abbreviations";

/** A typed SMILES's formula, as its atoms and their hydrogens read: "C2H4O2", its charge after. */
function formulaOf(smiles: string): string {
  const s = smilesInput(smiles);
  const count = new Map<string, number>();
  let charge = 0;
  for (const a of s.atoms) {
    count.set(a.el, (count.get(a.el) ?? 0) + 1);
    count.set("H", (count.get("H") ?? 0) + (a.hs ?? 0));
    charge += a.charge ?? 0;
  }
  const order = ["C", "H", ...[...count.keys()].filter((e) => e !== "C" && e !== "H").sort()];
  return order.filter((e) => count.get(e)).map((e) => `${e}${count.get(e) === 1 ? "" : count.get(e)}`).join("") + (charge ? (charge > 0 ? "+" : "-") : "");
}

describe("a structure typed with bonds marked aromatic outside a ring", () => {
  it("reads a carboxyl written C(:O):O as acetic acid: C2H4O2, one OH, the identity of CC(=O)O", () => {
    expect(formulaOf("CC(:O):O")).toBe("C2H4O2");
    expect(formulaOf("CC(=O)O")).toBe("C2H4O2");
    expect(smilesInput("CC(:O):O").atoms.filter((a) => a.el === "O").map((a) => a.hs ?? 0).sort()).toEqual([0, 1]);
    const id = (s: string) => identity(smilesInput(s) as unknown as Parameters<typeof identity>[0]).text;
    expect(id("CC(:O):O")).toBe(id("CC(=O)O"));
  });

  it("reads an acetate, its charge on an O, with no H on either O; a nitro with its charges as nitromethane", () => {
    expect(formulaOf("CC(:O):[O-]")).toBe("C2H3O2-");
    expect(formulaOf("C[N+](:O):[O-]")).toBe("CH3NO2");
  });

  it("refuses a nitro written with no charges, in words, on the drawing's route and as a label's structure", () => {
    expect(() => smilesInput("CN(:O):O")).toThrow("This SMILES could not be read: its bonds marked aromatic outside a ring (atoms 2, 3 and 4) have no form with single and double bonds: is a charge missing?");
    expect(structureProblem("*N(:O):O")).toBe("The SMILES cannot be read: its bonds marked aromatic outside a ring (atoms 2, 3 and 4) have no form with single and double bonds: is a charge missing?");
    expect(structureProblem("*C(:O):O")).toBeNull();
  });

  it("refuses CO2 written O:C:O and a sulfone written CS(:O)(:O)C: a centre needing two double bonds, never read as formic acid or a diol", () => {
    expect(() => smilesInput("O:C:O")).toThrow("have no form with single and double bonds");
    expect(() => smilesInput("CS(:O)(:O)C")).toThrow("have no form with single and double bonds");
  });

  it("reads phosphoric acid written OP(:O)(:O)O as phosphoric acid, H3PO4: its P of five, one P=O, no H on P (the chemistry check's ruling)", () => {
    expect(formulaOf("OP(:O)(:O)O")).toBe("H3O4P");
    expect(smilesInput("OP(:O)(:O)O").atoms[1].hs ?? 0).toBe(0);
  });

  it("leaves rings as they were: benzoic acid written all aromatic reads as benzoic acid", () => {
    expect(formulaOf("c1ccccc1C(:O):O")).toBe("C7H6O2");
    expect(formulaOf("c1ccccc1")).toBe("C6H6");
    expect(formulaOf("c1cc[nH]c1")).toBe("C4H5N");
  });

  it("refuses a ring atom bonded to an atom outside its ring by a bond marked aromatic: a phenol written c1ccccc1:O (found in review)", () => {
    expect(() => smilesInput("c1ccccc1:O")).toThrow(/marked aromatic outside a ring/);
  });
});
