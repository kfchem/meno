import { describe, expect, it } from "vitest";
import { NOT_READ, notReadSaid, ordinal, whyNotRead, type SmilesRead } from "./smilesWhy";

/**
 * What the plugin that fills the SMILES role answers `smiles_read` with, for the SMILES these tests ask about - as the
 * RDKit plugin answered (RDKit 2026.03.6): its facts, never its words. Any other reads as nothing to say.
 */
const FACTS: Record<string, SmilesRead> = {
  "C(C)(C)(C)(C)C": { reads: false, parsed: true, problems: [{ kind: "AtomValenceException", atom: 0, symbol: "C", charge: 0, bonds: 5 }] },
  "OO=O": { reads: false, parsed: true, problems: [{ kind: "AtomValenceException", atom: 1, symbol: "O", charge: 0, bonds: 3 }] },
  "c1cccc1": { reads: false, parsed: true, problems: [{ kind: "KekulizeException", atoms: [0, 1, 2, 3, 4] }] },
  Cc: { reads: false, parsed: true, problems: [{ kind: "AtomKekulizeException", atom: 1, symbol: "C", charge: 0, bonds: 1 }] },
  c1ccccc1o: { reads: false, parsed: true, problems: [{ kind: "AtomKekulizeException", atom: 6, symbol: "O", charge: 0, bonds: 2 }] },
  Co: { reads: false, parsed: true, problems: [{ kind: "AtomKekulizeException", atom: 1, symbol: "O", charge: 0, bonds: 1 }] },
  CsF: { reads: false, parsed: true, problems: [{ kind: "AtomKekulizeException", atom: 1, symbol: "S", charge: 0, bonds: 2 }] },
  Pb: { reads: false, parsed: true, problems: [{ kind: "AtomKekulizeException", atom: 1, symbol: "B", charge: 0, bonds: 1 }] },
  CCo: { reads: false, parsed: true, problems: [{ kind: "AtomKekulizeException", atom: 2, symbol: "O", charge: 0, bonds: 1 }] },
  "C[O-](C)C": { reads: false, parsed: true, problems: [{ kind: "AtomValenceException", atom: 1, symbol: "O", charge: -1, bonds: 3 }] },
};
/** The SMILES written for formulas that read (each halogen bonded to the one atom, or a salt as ions). */
const READ = new Set(["Cl[Sn](Cl)(Cl)Cl", "ClC(Cl)(Cl)Cl", "Cl[Al](Cl)Cl", "Cl[Fe](Cl)Cl", "FB(F)F", "[Mg+2].[Cl-].[Cl-]", "[Ca+2].[Cl-].[Cl-]", "[Ba+2].[Br-].[Br-]"]);
const read = async (smiles: string): Promise<SmilesRead> => FACTS[smiles] ?? { reads: READ.has(smiles), parsed: READ.has(smiles), problems: [] };
const said = (smiles: string) => notReadSaid(smiles, read);

describe("why a SMILES cannot be read, in Meno's words", () => {
  it("says which ring is left open", async () => {
    expect(await said("C1CCCC")).toBe("This SMILES could not be read: a ring is left open: 1 is opened and not closed.");
    expect(await said("C1CC2CC1")).toContain("2 is opened and not closed");
    expect(await said("C%12CCC")).toContain("%12 is opened and not closed");
    expect(await said("C%(123)CC")).toContain("a ring is left open: %(123) is opened and not closed");
  });

  it("says a parenthesis or bracket is not closed, or closes none", async () => {
    expect(await said("CC(C")).toContain("a ( is not closed");
    expect(await said("CC)C")).toContain("a ) closes no (");
    expect(await said("[Na+].[Cl-")).toContain("a [ is not closed");
    expect(await said("C]")).toContain("a ] closes no [");
  });

  it("says which atom has too many bonds, with its charge, from what the toolkit found", async () => {
    expect(await said("C(C)(C)(C)(C)C")).toContain("its 1st atom, C, has 5 bonds, more than it can take");
    expect(await said("OO=O")).toContain("its 2nd atom, O, has 3 bonds");
    expect(await said("C[O-](C)C")).toContain("its 2nd atom, O-, has 3 bonds");
  });

  it("says a formula is one, and what a SMILES for it is where that reads", async () => {
    for (const [formula, smiles] of [
      ["SnCl4", "Cl[Sn](Cl)(Cl)Cl"],
      ["CCl4", "ClC(Cl)(Cl)Cl"],
      ["AlCl3", "Cl[Al](Cl)Cl"],
      ["FeCl3", "Cl[Fe](Cl)Cl"],
      ["BF3", "FB(F)F"],
      ["MgCl2", "[Mg+2].[Cl-].[Cl-]"],
      ["CaCl2", "[Ca+2].[Cl-].[Cl-]"],
      ["BaBr2", "[Ba+2].[Br-].[Br-]"],
    ]) {
      expect(await said(formula)).toContain(`it reads like a formula; a SMILES for it is ${smiles}`);
    }
    // (no such compound, or none a halide of one atom: an example only)
    for (const formula of ["NaCl2", "KCl3", "MgCl3", "C6H6", "H2O", "Fe2O3", "CO2", "IF7"]) {
      expect(await said(formula)).toContain("it reads like a formula; a SMILES writes the atoms and how they are bonded");
    }
    // (an element twice, or no count past one: as a SMILES still)
    expect(await said("CC2")).toContain("a ring is left open: 2 is opened and not closed");
    expect(await said("NaCl")).toContain("Na is written in brackets: [Na]");
  });

  it("says what is no element, and what wants brackets", async () => {
    expect(await said("[Xx]")).toContain("Xx is not an element");
    expect(await said("hello")).toContain("h is not an element");
    expect(await said("Fe")).toContain("Fe is written in brackets: [Fe]");
    expect(await said("[1]")).toContain("[1] names no element");
  });

  it("says an aromatic ring cannot alternate", async () => {
    expect(await said("c1cccc1")).toContain("its aromatic ring of 5 atoms (1, 2, 3, 4 and 5) cannot have alternating double bonds");
  });

  it("says an aromatic atom is in no ring, or an element was written without its brackets", async () => {
    expect(await said("Cc")).toContain("its 2nd atom, c, is written aromatic, in lowercase, but is in no ring");
    expect(await said("c1ccccc1o")).toContain("its 7th atom, o, is written aromatic");
    for (const [smiles, pair] of [["Co", "Co"], ["CsF", "Cs"], ["Pb", "Pb"], ["CCo", "Co"]]) {
      expect(await said(smiles)).toContain(`${pair} is written in brackets: [${pair}]`);
    }
  });

  it("says hydrogens are left out, and that it is empty", async () => {
    expect(await said("CH3CH2OH")).toContain("H is left out of a SMILES");
    expect(await said("  ")).toBe("This SMILES could not be read: it is empty.");
  });

  it("says it as before where nothing it knows says why, or finding why fails", async () => {
    // (parses, and its check names nothing these words are for)
    expect(await said("CCCC")).toBe(NOT_READ);
    expect(await notReadSaid("C1CCCC", async () => Promise.reject(new Error("gone")))).toContain("a ring is left open");
    expect(await notReadSaid("C(C)(C)(C)(C)C", async () => Promise.reject(new Error("gone")))).toBe(NOT_READ);
    expect(await whyNotRead("CCCC", read)).toBeNull();
  });

  it("counts in English", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th", "112th"]);
  });
});
