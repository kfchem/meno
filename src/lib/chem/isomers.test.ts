/**
 * The stereoisomers counted by Meno (lib/chem/isomers `isomersOf`): the chemistry check's table of known counts, every structure
 * drawn with no configuration given.
 */
import { describe, expect, it } from "vitest";
import { smilesInput } from "../layout/smilesInput";
import type { IdentityInput } from "./identity";
import { cipInput } from "./cip/testdata/cipFrom";
import { isomersOf, NOT_COUNTED_JOINED, NOT_COUNTED_TIED } from "./isomers";

const count = (smiles: string) => {
  const r = isomersOf(smilesInput(smiles) as unknown as IdentityInput);
  if ("tooMany" in r) throw new Error(`too many: ${r.tooMany}`);
  if ("notCounted" in r) throw new Error(r.notCounted);
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
      return "isomers" in r ? r.isomers.length : -1;
    };
    expect(given("CC=[C@]=CC")).toBe(1);
    expect(given("C/C=C=C=C/C")).toBe(1);
  });

  it("gives each stereoisomer a whole configuration: a centre's neighbours in order, its H not drawn last", () => {
    const r = isomersOf(smilesInput("CC(O)CC") as unknown as IdentityInput);
    if (!("isomers" in r)) throw new Error("not counted");
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

  it("counts a cage, its bridgeheads tied: one relative sense, out,out (the chemistry check's table)", () => {
    const counted: [string, string, number][] = [
      ["norbornane", "C1CC2CCC1C2", 1],
      ["norbornan-2-ol", "OC1CC2CCC1C2", 4],
      ["camphor", "CC1(C)C2CCC1(C)C(=O)C2", 2],
      ["1,4-dimethylnorbornane", "CC12CCC(C)(CC1)C2", 1],
      ["twistane", "C1CC2CC3CC1CC2C3", 2],
      ["adamantane", "C1C2CC3CC1CC(C2)C3", 1],
      ["adamantan-2-ol", "OC1C2CC3CC(C2)CC1C3", 1],
      ["cubane", "C12C3C4C1C5C2C3C45", 1],
      ["hexamine", "C1N2CN3CN1CN(C2)C3", 1],
      ["quinuclidin-3-ol", "OC1CN2CCC1CC2", 2],
      ["Troeger's base, its two N tied (a resolved pair)", "Cc1ccc2c(c1)CN3c4ccc(C)cc4CN2C3", 2],
      ["bicyclo[2.2.2]octan-2-ol", "OC1CC2CCC1CC2", 2],
      ["bicyclo[2.2.2]octane-2,5-dione, chiral by the tie alone", "O=C1CC2C(=O)CC1CC2", 2],
      ["bicyclo[2.2.2]octane-2,6-dione", "O=C1CC2CC(=O)C1CC2", 1],
      ["bicyclo[3.3.1]nonane-2,6-dione", "O=C1CCC2CC1CCC2=O", 2],
      ["tropan-3-ol: tropine and pseudotropine", "CN1C2CCC1CC(O)C2", 2],
      ["sparteine: (-)/(+)-sparteine and the alpha- and beta-isosparteines (the chemistry check's table)", "C1CCN2CC3CC(C2C1)CN4C3CCCC4", 6],
      ["bicyclo[4.4.1]undecane, untied: its bridge of four", "C12CCCCC(CCCC1)C2", 2],
    ];
    for (const [name, smiles, n] of counted) expect(count(smiles), name).toBe(n);
  });

  it("keeps a cage given its possible way, one; given in,out, no count, said (camphor's C4 turned against its C1)", () => {
    expect(count("CC1(C)[C@@H]2CC[C@@]1(C)C(=O)C2")).toBe(1);
    expect(isomersOf(smilesInput("CC1(C)[C@H]2CC[C@@]1(C)C(=O)C2") as unknown as IdentityInput)).toEqual({ notCounted: NOT_COUNTED_TIED });
  });

  it("counts a fused bicycle's cis and trans, a bond being no bridge; a small one, whose rings join only cis, its cis form alone (the chemistry check's ruling)", () => {
    // ([3.2.0], [3.3.0], 1-methyl[3.3.0], hexahydrofuro[2,3-b]furan, [4.1.0], [4.2.0], [4.3.0], decalin)
    const counted: [string, number][] = [
      ["C1CC2CCC2C1", 3],
      ["C1CC2CCCC2C1", 2],
      ["CC12CCCC1CCC2", 2],
      ["C1COC2OCCC12", 2],
      ["C1CCC2CC2C1", 3],
      ["C1CCC2CCC2C1", 3],
      ["C1CCC2CCCC2C1", 3],
      ["C1CCC2CCCCC2C1", 2],
      // ([1.1.0], [2.1.0], [2.2.0], [3.1.0]: cis alone, one; 1-methylbicyclo[2.1.0]pentane, its cis form chiral, and bicyclo[3.1.0]hexan-3-ol, two -
      //  the chemistry check's ruling)
      ["C1C2CC12", 1],
      ["C1CC2CC12", 1],
      ["C1CC2CCC12", 1],
      ["C1CC2CC2C1", 1],
      ["CC12CC1CC2", 2],
      ["OC1CC2CC2C1", 2],
    ];
    for (const [smiles, n] of counted) expect(count(smiles), smiles).toBe(n);
    // (its junctions given cis: one; given trans, which it cannot take: no count, said)
    expect(count("C1C[C@H]2C[C@H]2C1")).toBe(1);
    expect(isomersOf(smilesInput("C1C[C@@H]2C[C@H]2C1") as unknown as IdentityInput)).toEqual({ notCounted: NOT_COUNTED_TIED });
  });

  it("a quinuclidine's N and an aziridine's as before", () => {
    expect(count("OC1CN2CCC1CC2")).toBe(2);
    expect(count("CC1CN1C")).toBe(2);
  });

  it(`says how many ways there were past the most it writes`, () => {
    expect(isomersOf(smilesInput("CC(O)CC(O)CC(O)C") as unknown as IdentityInput, 4)).toEqual({ tooMany: 8 });
  });
});

describe("two sets of tied bridgeheads in one ring system", () => {
  it("are not counted, said: homoadamantane, sesquinorbornene - never one structure too few, nor a form no ring system takes", () => {
    for (const [name, smiles] of [
      ["homoadamantane", "C1CC2CC3CC1CC(C2)C3"],
      ["sesquinorbornene", "C1CC2CC1C1=C2C2CCC1C2"],
    ]) {
      const r = isomersOf(smilesInput(smiles) as unknown as IdentityInput);
      expect(r, name).toEqual({ notCounted: NOT_COUNTED_JOINED });
    }
  });

  it("leave one set, joined where its ties share a centre, counted as before: adamantane 1, camphor 2, norbornan-2-ol 4", () => {
    expect(count("C1C2CC3CC1CC(C2)C3")).toBe(1);
    expect(count("CC1(C)C2CCC1(C)C(=O)C2")).toBe(2);
    expect(count("OC1CC2CCC1C2")).toBe(4);
  });
});
