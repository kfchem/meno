import { describe, expect, it } from "vitest";
import { abbreviationOf, abbreviationStructure } from "./abbreviations";

describe("a condensed formula read as a group (./chain)", () => {
  it("is the molecule an H before it makes, without the H: each atom at a valence it has", () => {
    const smiles = (l: string) => abbreviationOf(l)?.smiles;
    expect(smiles("OCH3")).toBe("*[O][CH3]");
    expect(smiles("CH2OH")).toBe("*[CH2][OH]");
    expect(smiles("CH2Ph")).toBe("*[CH2]c1ccccc1");
    // (an O after a carbon that could take no more as a chain: the carbonyl's)
    expect(smiles("COMe")).toBe("*[C](C)=[O]");
    expect(smiles("CO2CH3")).toBe("*[C](=[O])[O][CH3]");
    expect(smiles("OCOMe")).toBe("*[O][C](C)=[O]");
    // (sulfur at six: a sulfonyl)
    expect(smiles("SO2Me")).toBe("*[S](C)(=[O])=[O]");
    expect(smiles("CONHMe")).toBe("*[C](=[O])[NH]C");
    expect(smiles("COCl")).toBe("*[C](=[O])[Cl]");
    expect(smiles("OCHF2")).toBe("*[O][CH]([F])[F]");
    expect(smiles("CH(CH3)2")).toBe("*[CH]([CH3])[CH3]");
    expect(smiles("CH2CN")).toBe("*[CH2]C#N");
    // (nitroso: HNO)
    expect(smiles("NO")).toBe("*[N]=[O]");
  });

  it("reads none where no H before it makes a whole molecule, nor an element as anything else", () => {
    // (HCO, HCH2, HNH are no closed-shell molecules; a charge is none of this)
    for (const no of ["CO", "CH2", "NH", "CH2+", "OO"]) expect(abbreviationOf(no), no).toBeUndefined();
    // (the near misses of typing: elements and groups as they are, not formulas)
    for (const el of ["Co", "Hf", "Np", "Os", "No", "Cs", "Sn", "Nh", "Cn"]) expect(abbreviationOf(el), el).toBeUndefined();
    expect(abbreviationOf("Bn")?.label).toBe("Bn");
    expect(abbreviationOf("CN")?.label).toBe("CN");
  });

  it("leaves the named compositions their names: OAc is acetoxy, not a formula", () => {
    expect(abbreviationOf("OAc")?.name).not.toBe("OAc");
    expect(abbreviationOf("CO2Me")?.smiles).toBe("*C(=O)OC");
  });

  it("reads an O alone in parentheses as an =O, and a group alone in them as it is unbracketed: C(O)NiPr2, N(iPr)2", () => {
    const smiles = (l: string) => abbreviationOf(l)?.smiles;
    expect(smiles("C(O)NiPr2")).toBe(smiles("CONiPr2"));
    expect(smiles("C(O)N(iPr)2")).toBe(smiles("CONiPr2"));
    expect(smiles("C(O)OMe")).toBe("*[C](=[O])[O]C");
    expect(smiles("C(O)NMe2")).toBe(smiles("CONMe2"));
    expect(smiles("N(iPr)2")).toBe(smiles("NiPr2"));
  });
});

describe("an ion written as one (./abbreviations)", () => {
  /** Its atoms, each with its charge where it has one: P-1, F. */
  const atomsOf = (l: string) => abbreviationStructure(l)?.atoms.map((a) => `${a.el}${a.charge ? a.charge : ""}`).sort();
  it("reads an anion written alone, its charge last, as one is read in a salt: PF6-, BF4-, ClO4-", () => {
    expect(atomsOf("PF6-")).toEqual(["F", "F", "F", "F", "F", "F", "P-1"]);
    expect(atomsOf("BF4-")).toEqual(["B-1", "F", "F", "F", "F"]);
    // (an oxoanion as in a salt: its charge on an O)
    expect(atomsOf("ClO4-")).toEqual(["Cl", "O", "O", "O", "O-1"]);
    expect(abbreviationOf("PF6-")?.kind).toBe("reagent");
  });

  it("reads a group bound by an O with its charge there, and ions in parentheses counted: OTf-, (Cl-)2", () => {
    expect(atomsOf("OTf-")).toEqual(["C", "F", "F", "F", "O", "O", "O-1", "S"]);
    expect(atomsOf("(Cl-)2")).toEqual(["Cl-1", "Cl-1"]);
    // (an element's own ion alone is read as an element is, not as a reagent)
    expect(abbreviationOf("Cl-")).toBeUndefined();
  });
});
