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
    expect(() => readSmiles("C[N@]1CC1C")).toThrow(/not four/);
    expect(() => readSmiles("F[C@@@](Cl)(Br)I")).toThrow(/only @ and @@ are read/);
    expect(() => readSmiles("C[C@](=C)C")).toThrow(/not four/);
  });
});

