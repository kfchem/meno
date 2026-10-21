import { describe, expect, it } from "vitest";
import { readSmiles } from "./smiles";

describe("a double bond's cis or trans, read from SMILES", () => {
  // (OpenSMILES: a neighbour written before its end with "/" lies below it,
  // one written after it above, "\" the other way; the same side, cis)
  const of = (smiles: string) => {
    const b = readSmiles(smiles).bonds.find((x) => x.order === 2)!;
    return b.cisTrans && { refs: b.cisTrans.refs, cis: b.cisTrans.cis, ends: [b.a1, b.a2] };
  };

  it("reads trans and cis from the marks either side", () => {
    expect(of("F/C=C/F")).toEqual({ refs: [0, 3], cis: false, ends: [1, 2] });
    expect(of("F/C=C\\F")).toEqual({ refs: [0, 3], cis: true, ends: [1, 2] });
    expect(of("F\\C=C/F")?.cis).toBe(true);
  });

  it("reads a mark in a branch, and on a ring bond at either digit", () => {
    // C(\F)=C/F is F/C=C/F written another way
    expect(of("C(\\F)=C/F")?.cis).toBe(false);
    // the ring bond's mark at its opening digit, from the atom it is on
    expect(of("F/C=C/1.F1")?.cis).toBe(false);
    expect(of("C/1=C/F.F1")?.cis).toBe(true);
  });

  it("has none without a mark on each end", () => {
    expect(of("FC=CF")).toBeUndefined();
    expect(of("F/C=CF")).toBeUndefined();
  });

  // (each configuration below checked against RDKit's reading of the same SMILES: the sign of the volume of
  // the centre's first three neighbours, measured on an RDKit 3D embedding that keeps the input's stereo)
  it("reads a sulfoxide's, a sulfinamide's, a sulfonium's and a phosphine's centre, its lone pair in an H's place", () => {
    const tetra = (smiles: string) => readSmiles(smiles).atoms.flatMap((a, i) => (a.tetra ? [[i, a.tetra.neighbours, a.tetra.volume]] : []));
    // (R)-methyl p-tolyl sulfoxide
    expect(tetra("Cc1ccc([S@@](C)=O)cc1")).toEqual([[5, [4, 6, 7], -1]]);
    // Ellman's sulfinamide, each enantiomer (RDKit's CIP labels: S for @@, R for @)
    expect(tetra("CC(C)(C)[S@@](N)=O")).toEqual([[4, [1, 5, 6], -1]]);
    expect(tetra("CC(C)(C)[S@](N)=O")).toEqual([[4, [1, 5, 6], 1]]);
    // a sulfonium; a phosphine (PAMP); a ring's sulfoxide
    expect(tetra("C[S@+](CC)c1ccccc1")).toEqual([[1, [0, 2, 4], 1]]);
    expect(tetra("C[P@](c1ccccc1)c1ccccc1OC")).toEqual([[1, [0, 2, 8], 1]]);
    expect(tetra("C1CC[S@](=O)C1C")).toEqual([[3, [2, 4, 5], 1]]);
    // a P-stereogenic phosphine oxide and a quaternary ammonium: four neighbours, as before
    expect(tetra("C[P@](=O)(c1ccccc1)c1ccccc1OC")).toEqual([[1, [0, 2, 3, 9], 1]]);
    expect(tetra("C[N@+](CC)(CCC)c1ccccc1")).toEqual([[1, [0, 2, 4, 7], 1]]);
  });

  it("refuses, saying why, a configuration it cannot read - never reading past it", () => {
    // (a lone pair's centre written first: the H's rule and RDKit's reading disagree)
    expect(() => readSmiles("[S@](C)(=O)c1ccc(C)cc1")).toThrow(/lone pair written first/);
    // (an amine's nitrogen; a mark other than @ and @@; a carbon of three)
    expect(() => readSmiles("C[N@]1CC1C")).toThrow(/N centre of three neighbours and a lone pair is not read here/);
    expect(() => readSmiles("C[Te@](=O)CC")).toThrow(/Te centre of three neighbours and a lone pair is not read here/);
    expect(() => readSmiles("F[C@@@](Cl)(Br)I")).toThrow(/only @ and @@ are read/);
    expect(() => readSmiles("C[C@](=C)C")).toThrow(/not four/);
  });

  it("refuses a phosphine's, an arsine's or a sulfonium's centre that closes a ring at itself, and reads a sulfoxide's or a sulfilimine's", () => {
    // (RDKit reads such a P, As or S+ ring the other way from the H's rule: measured on its 3D embeddings - so not
    // read here; a ring closed at a centre with a double bond on it - a sulfoxide's, a selenoxide's, a
    // sulfilimine's - agrees, and is read)
    for (const x of ["P@", "P@@", "As@", "As@@", "S@+", "S@@+"]) {
      for (const smiles of [`C[${x}]1CCCC1C`, `CC1CCC[${x}]1C`, `c1ccccc1[${x}]1CCC1C`]) {
        expect(() => readSmiles(smiles)).toThrow(/closes a ring at itself/);
      }
    }
    for (const x of ["S@", "S@@", "Se@", "Se@@"]) {
      for (const smiles of [`C[${x}]1(=O)CCCC1C`, `CC1CCC[${x}]1=O`, `c1ccccc1[${x}]1(=O)CCC1C`]) {
        expect(readSmiles(smiles).atoms.filter((a) => a.tetra)).toHaveLength(1);
      }
    }
    // (sulfilimines, both enantiomers: each the same configuration RDKit gives it, the sign of the volume on its 3D embedding)
    expect(readSmiles("CC1CCCC[S@]1=NC").atoms[6].tetra).toEqual({ neighbours: [5, 1, 7], volume: 1 });
    for (const dbl of ["=NC", "=NS(=O)(=O)C", "=Nc2ccccc2"]) {
      for (const x of ["S@", "S@@"]) expect(readSmiles(`CC1CCCC[${x}]1${dbl}`).atoms.filter((a) => a.tetra)).toHaveLength(1);
    }
    expect(readSmiles("CC1CCCC[S@]1=NC").atoms[6].tetra!.volume).toBe(-readSmiles("CC1CCCC[S@@]1=NC").atoms[6].tetra!.volume);
  });
});

