/**
 * The stereoisomers counted by Meno (lib/chem/isomers `isomersOf`): the chemistry check's table of known counts, every structure
 * drawn with no configuration given.
 */
import { describe, expect, it } from "vitest";
import { smilesInput } from "../layout/smilesInput";
import type { IdentityInput } from "./identity";
import { cipInput } from "./cip/testdata/cipFrom";
import { isomersOf } from "./isomers";

const count = (smiles: string) => {
  const r = isomersOf(smilesInput(smiles) as unknown as IdentityInput);
  if ("tooMany" in r) throw new Error(`too many: ${r.tooMany}`);
  return r.isomers.length;
};

describe("the stereoisomers counted by Meno, against the known counts", () => {
  it.each([
    ["butan-2-ol", "CC(O)CC", 2],
    ["but-2-ene", "CC=CC", 2],
    ["cyclooctene", "C1=CCCCCCC1", 2],
    ["tartaric acid", "OC(=O)C(O)C(O)C(=O)O", 3],
    ["2,4-dichloropentane", "CC(Cl)CC(Cl)C", 3],
    ["1,2-dimethylcyclohexane", "CC1CCCCC1C", 3],
    ["1,3-dimethylcyclohexane", "CC1CCCC(C)C1", 3],
    ["1,2-dimethylcyclopropane", "CC1CC1C", 3],
    ["hexa-2,4-diene", "CC=CC=CC", 3],
    ["1,4-di(butan-2-yl)benzene", "CCC(C)c1ccc(cc1)C(C)CC", 3],
    ["1,4-dimethylcyclohexane", "CC1CCC(C)CC1", 2],
    ["1,3-dimethylcyclobutane", "CC1CC(C)C1", 2],
    ["decalin", "C1CCC2CCCCC2C1", 2],
    ["4-methylcyclohexanol", "CC1CCC(O)CC1", 2],
    ["pentane-2,3,4-triol", "CC(O)C(O)C(O)C", 4],
    ["2,3,4-trihydroxypentanedioic acid", "OC(=O)C(O)C(O)C(O)C(=O)O", 4],
    ["1,2,3,4-tetramethylcyclobutane", "CC1C(C)C(C)C1C", 4],
    ["inositol", "OC1C(O)C(O)C(O)C(O)C1O", 9],
    ["(4-methylcyclohexylidene)acetic acid", "CC1CCC(=CC(=O)O)CC1", 2],
    ["1,2,3-trimethylcyclopropane", "CC1C(C)C1C", 2],
    ["1,3,5-trimethylcyclohexane", "CC1CC(C)CC(C)C1", 2],
    ["2,6-dimethylspiro[3.3]heptane", "CC1CC2(C1)CC(C)C2", 2],
    ["2-ethyl-6-methylspiro[3.3]heptane", "CCC1CC2(C1)CC(C)C2", 2],
  ])("%s: %s, %i", (_name, smiles, n) => {
    expect(count(smiles)).toBe(n);
  });

  it("keeps what is given: (R)-butan-2-ol is one; (R,R)-tartaric acid, its other centre open, one", () => {
    expect(count("C[C@@H](O)CC")).toBe(1);
    expect(count("OC(=O)[C@@H](O)[C@H](O)C(=O)O")).toBe(1);
    expect(count("OC(=O)[C@@H](O)C(O)C(=O)O")).toBe(2);
    // ((E)-hexa-2,4-diene with its other double bond open: two; an allene's and a butatriene's given, one each)
    expect(count("C/C=C/C=CC")).toBe(2);
    const given = (smiles: string) => {
      const r = isomersOf(cipInput(smiles));
      return "tooMany" in r ? -1 : r.isomers.length;
    };
    expect(given("CC=[C@]=CC")).toBe(1);
    expect(given("C/C=C=C=C/C")).toBe(1);
  });

  it("gives each stereoisomer a whole configuration: a centre's neighbours in order, its H not drawn last", () => {
    const r = isomersOf(smilesInput("CC(O)CC") as unknown as IdentityInput);
    if ("tooMany" in r) throw new Error("too many");
    expect(r.isomers.map((x) => x.input.atoms[1].tetra?.neighbours)).toEqual([
      [0, 2, 3, -1],
      [0, 2, 3, -1],
    ]);
    expect(new Set(r.isomers.map((x) => x.input.atoms[1].tetra?.volume))).toEqual(new Set([1, -1]));
  });

  it("counts a lone pair's centre, an allene's axis and a butatriene's cis or trans", () => {
    expect(count("C[S](=O)CC")).toBe(2);
    expect(count("CC=C=CC")).toBe(2);
    expect(count("CC=C=C=CC")).toBe(2);
    expect(count("CC(C)=C=CC")).toBe(1);
  });

  it(`says how many ways there were past the most it writes`, () => {
    expect(isomersOf(smilesInput("CC(O)CC(O)CC(O)C") as unknown as IdentityInput, 4)).toEqual({ tooMany: 8 });
  });
});
