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

  it("reads an N its ring holds, a selenoxide's Se and a stibine's Sb, by the one rule on lone pairs (./lonePairCentres)", () => {
    const tetra = (smiles: string) => readSmiles(smiles).atoms.flatMap((a, i) => (a.tetra ? [[i, a.tetra.neighbours, a.tetra.volume]] : []));
    // (an N-chloro aziridine's N, an oxaziridine's; a selenoxide's Se - each as RDKit's 3D embeddings have it, five
    //  seeds each)
    expect(tetra("C1[N@@](Cl)C1(C)C")).toEqual([[1, [0, 2, 3], -1]]);
    expect(tetra("CC1[N@](C)O1")).toEqual([[2, [1, 3, 4], 1]]);
    expect(tetra("C[Se@](=O)c1ccccc1")).toEqual([[1, [0, 2, 3], 1]]);
    // (a stibine's Sb, by the same rule for its lone pair: RDKit holds no configuration of an Sb to check it against)
    expect(tetra("C[Sb@](CC)c1ccccc1")).toEqual([[1, [0, 2, 4], 1]]);
  });

  it("refuses, saying why, a configuration it cannot read - never reading past it", () => {
    // (a lone pair's centre written first: the H's rule and RDKit's reading disagree)
    expect(() => readSmiles("[S@](C)(=O)c1ccc(C)cc1")).toThrow(/lone pair written first/);
    // (an amine's nitrogen, a plain N-methyl aziridine's, an N-aryl aziridine's: no configuration of their own; a mark
    // other than @ and @@; a carbon of three)
    expect(() => readSmiles("C[N@](CC)CCC")).toThrow(/N of three neighbours keeps no configuration of its own/);
    expect(() => readSmiles("C1[N@](C)C1C")).toThrow(/N of three neighbours keeps no configuration of its own/);
    expect(() => readSmiles("C1[N@](c2ccccc2)C1C")).toThrow(/N of three neighbours keeps no configuration of its own/);
    expect(() => readSmiles("C[O@+](CC)CCC")).toThrow(/O of three neighbours keeps no configuration of its own/);
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


describe("an allene's axis and an odd cumulene's cis or trans, read from SMILES", () => {
  it("reads an @ or @@ on an allene's middle atom as its axis, the run collapsed into one centre (OpenSMILES, Tetrahedral Allene-like Systems)", () => {
    // (the specification's own example: N and Br on one end, O and the methyl on the other)
    expect(readSmiles("NC(Br)=[C@]=C(O)C").axes).toEqual([{ atoms: [1, 4], refs: [0, 5], sense: 1 }]);
    expect(readSmiles("NC(Br)=[C@@]=C(O)C").axes).toEqual([{ atoms: [1, 4], refs: [0, 5], sense: -1 }]);
    // (the same allene written from its other end: its four neighbours, collapsed, an even turn of the first's - the same
    // @ - and its torsion, from the methyl to the Br, the first's turned twice over; the other @, its mirror image)
    expect(readSmiles("CC(O)=[C@]=C(Br)N").axes).toEqual([{ atoms: [1, 4], refs: [0, 5], sense: 1 }]);
    expect(readSmiles("CC(O)=[C@@]=C(Br)N").axes).toEqual([{ atoms: [1, 4], refs: [0, 5], sense: -1 }]);
    // (each end's H where a bracket atom's would be; an even run of four double bonds marked at its middle atom)
    expect(readSmiles("CC=[C@]=CC").axes).toEqual([{ atoms: [1, 3], refs: [0, 4], sense: -1 }]);
    expect(readSmiles("CC=C=[C@@]=C=CC").axes).toEqual([{ atoms: [1, 5], refs: [0, 6], sense: 1 }]);
  });

  it("reads an odd cumulene's cis or trans from the directional bonds at its ends (OpenSMILES, Cis/Trans configuration of double bonds)", () => {
    expect(readSmiles("F/C=C=C=C/F").cumulated).toEqual([{ atoms: [1, 4], refs: [0, 5], cis: false }]);
    expect(readSmiles("F/C=C=C=C\\F").cumulated).toEqual([{ atoms: [1, 4], refs: [0, 5], cis: true }]);
    expect(readSmiles("C(/F)=C=C=C/F").cumulated).toEqual([{ atoms: [0, 4], refs: [1, 5], cis: true }]);
    // (none on an allene's ends: they are not in one plane)
    expect(readSmiles("F/C=C=C/F").cumulated).toBeUndefined();
    expect(readSmiles("F/C=C=C=C/F").bonds.every((b) => !b.cisTrans)).toBe(true);
  });

  it("refuses an @ it cannot read as an allene's: not on the middle of its run, or at an end with two hydrogens", () => {
    expect(() => readSmiles("CC=[C@]=C=C=CC")).toThrow(/not the middle atom/);
    expect(() => readSmiles("C=[C@]=CC")).toThrow(/two neighbours besides it/);
  });
});
