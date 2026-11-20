// A place the ranking labels but whose configuration sets nothing by identity is said alike: a phosphinic, an arsinic and a stibinic acid's centre; a phosphine oxide of three unlike groups, a sulfoxide, a phosphinate ester and a thio acid keep their labels.
import { describe, expect, it } from "vitest";
import { cipInput } from "./testdata/cipFrom";
import { cipLabels } from "./index";

const centre = (smiles: string, at: number) => cipLabels(cipInput(smiles)).centres.get(at);

describe("a label only on a unit, at the CIP's own level (found in review)", () => {
  it("a phosphinic, an arsinic and a stibinic acid drawn with a wedge say alike: the two oxygens are one by identity, so the configuration sets nothing", () => {
    for (const smiles of ["C[P@](=O)(O)c1ccccc1", "C[P@@](=O)(O)c1ccccc1", "C[As@](=O)(O)c1ccccc1", "C[Sb@](=O)(O)c1ccccc1"]) expect(centre(smiles, 1), smiles).toEqual({ why: "alike" });
  });

  it("a phosphinate ester's P and a thio acid R1R2P(=S)OH's keep their R or S: their ends differ (an ester's OR, a thio acid's S and O), the hands two", () => {
    for (const smiles of ["C[P@](=O)(OC)c1ccccc1", "C[P@@](=O)(OC)c1ccccc1", "C[P@](=S)(O)c1ccccc1", "C[P@@](=S)(O)c1ccccc1"]) expect(centre(smiles, 1), smiles).toHaveProperty("label");
    expect(centre("C[P@](=O)(OC)c1ccccc1", 1)).not.toEqual(centre("C[P@@](=O)(OC)c1ccccc1", 1));
    expect(centre("C[P@](=S)(O)c1ccccc1", 1)).not.toEqual(centre("C[P@@](=S)(O)c1ccccc1", 1));
  });

  it("a phosphine oxide of three unlike groups and a sulfoxide keep their R or S: their configurations set something", () => {
    for (const smiles of ["C[P@](=O)(CC)c1ccccc1", "C[P@@](=O)(CC)c1ccccc1", "C[S@](=O)c1ccccc1", "C[S@@](=O)CC"]) expect(centre(smiles, 1), smiles).toHaveProperty("label");
    expect(centre("C[P@](=O)(CC)c1ccccc1", 1)).not.toEqual(centre("C[P@@](=O)(CC)c1ccccc1", 1));
  });
});
