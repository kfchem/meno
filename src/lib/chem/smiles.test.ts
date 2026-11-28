import { describe, expect, it } from "vitest";
import { pairsMarked, readSmiles } from "./smiles";
import { aromaticRefusal, kekuleOrders } from "./kekulize";
import { smilesInput } from "../layout/smilesInput";
import { identityText } from "./identity";
import { cipInput } from "./cip/testdata/cipFrom";

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

  it("gives no axis to a sulfur between two double bonds, bent as C=S=C is: only a carbon or an N+ is an allene's middle", () => {
    expect(readSmiles("CC(O)=[C@]=C(C)Cl").axes).toHaveLength(1);
    expect(readSmiles("CC(O)=[N@+]=C(C)Cl").axes).toHaveLength(1);
    // (a mark on a sulfur of two neighbours is read as no axis: refused, or read as a centre - never an axis)
    let read: ReturnType<typeof readSmiles> | null = null;
    try {
      read = readSmiles("CC(O)=[S@]=C(C)Cl");
    } catch {
      read = null;
    }
    expect(read?.axes).toBeUndefined();
    // (and a run through a sulfur is no run: a butatriene's S in the middle gives no cis or trans)
    expect(readSmiles("C/C=C=S=C/C").cumulated).toBeUndefined();
  });

  it("refuses an @ it cannot read as an allene's: not on the middle of its run, or at an end with two hydrogens", () => {
    expect(() => readSmiles("CC=[C@]=C=C=CC")).toThrow(/not the middle atom/);
    expect(() => readSmiles("C=[C@]=CC")).toThrow(/two neighbours besides it/);
  });
});

describe("a metal's square-planar or octahedral mark, read as which neighbours are across (OpenSMILES)", () => {
  /** The pairs across at the one marked metal, each by its two elements, sorted. */
  const across = (smiles: string) => {
    const s = readSmiles(smiles, { metalMarks: true });
    expect(s.arrangements).toHaveLength(1);
    return s.arrangements![0].pairs.map(([p, q]) => [s.atoms[p].el, s.atoms[q].el].sort().join("-")).sort();
  };

  it("reads the spec's own equivalent writings of one octahedral centre as one set of pairs: C-S, Br-F, Cl-I", () => {
    for (const smiles of [
      "S[Co@OH5](F)(I)(Cl)(C)Br",
      "Br[Co@OH9](C)(S)(Cl)(F)I",
      "Br[Co@OH12](Cl)(I)(F)(S)C",
      "Cl[Co@OH15](C)(Br)(F)(I)S",
      "Cl[Co@OH19](C)(I)(F)(S)Br",
      "I[Co@OH27](Cl)(Br)(F)(S)C",
    ])
      expect([smiles, across(smiles)]).toEqual([smiles, ["Br-F", "C-S", "Cl-I"]]);
  });

  it("OH1 and OH2: the first across the last, the second across the fourth, the third across the fifth - the hand not kept", () => {
    expect(across("C[Co@OH1](F)(Cl)(Br)(I)S")).toEqual(["Br-F", "C-S", "Cl-I"]);
    expect(across("C[Co@OH2](F)(Cl)(Br)(I)S")).toEqual(["Br-F", "C-S", "Cl-I"]);
    // (a bare @ or @@ on six neighbours is OH1 or OH2 - the spec's own first two writings)
    expect(across("C[Co@](F)(Cl)(Br)(I)S")).toEqual(["Br-F", "C-S", "Cl-I"]);
    expect(across("F[Co@@](S)(I)(C)(Cl)Br")).toEqual(["Br-F", "C-S", "Cl-I"]);
  });

  it("a bare @ at a metal of four neighbours is never read as square planar: refused, as a tetrahedral mark at a metal", () => {
    expect(() => readSmiles("[NH3][Pt@](Cl)([NH3])Cl", { metalMarks: true })).toThrow();
    expect(() => readSmiles("[NH3][Pt@@](Cl)([NH3])Cl", { metalMarks: true })).toThrow();
  });

  it("every one of the thirty: an axis from the first and a shape for the other four, three pairs of the six", () => {
    const six = [0, 1, 2, 3, 4, 5];
    for (let n = 1; n <= 30; n++) {
      const pairs = pairsMarked(`OH${n}`, six)!;
      expect([n, pairs.flat().sort()]).toEqual([n, six]);
      expect(pairs[0][0]).toBe(0);
    }
    // (each axis five ways, each with every shape: 30 marks, 15 pairings, each pairing twice - one hand and the other)
    const key = (n: number) => JSON.stringify(pairsMarked(`OH${n}`, six)!.map((p) => [...p].sort()).sort());
    const counts = new Map<string, number>();
    for (let n = 1; n <= 30; n++) counts.set(key(n), (counts.get(key(n)) ?? 0) + 1);
    expect([counts.size, [...new Set(counts.values())]]).toEqual([15, [2]]);
  });

  it("each of the thirty by value, against a transcription of the specification's table made apart from the code's (found in review)", () => {
    // ([M@OHn](a)(b)(c)(d)(e)f: the three pairs across, as the chemistry check read them from OpenSMILES 1.0, *Octahedral Centers*)
    const TABLE = `
      OH1: a-f b-d c-e   OH11: a-e b-c d-f   OH21: a-c b-d e-f
      OH2: a-f b-d c-e   OH12: a-d b-c e-f   OH22: a-c b-d e-f
      OH3: a-e b-d c-f   OH13: a-d b-c e-f   OH23: a-c b-f d-e
      OH4: a-f b-e c-d   OH14: a-f b-e c-d   OH24: a-c b-e d-f
      OH5: a-e b-f c-d   OH15: a-e b-f c-d   OH25: a-b c-e d-f
      OH6: a-d b-e c-f   OH16: a-e b-d c-f   OH26: a-b c-f d-e
      OH7: a-d b-f c-e   OH17: a-d b-f c-e   OH27: a-b c-d e-f
      OH8: a-f b-c d-e   OH18: a-d b-e c-f   OH28: a-b c-d e-f
      OH9: a-e b-c d-f   OH19: a-c b-e d-f   OH29: a-b c-f d-e
      OH10: a-f b-c d-e  OH20: a-c b-f d-e   OH30: a-b c-e d-f`;
    const rows = [...TABLE.matchAll(/OH(\d+): ([a-f]-[a-f]) ([a-f]-[a-f]) ([a-f]-[a-f])/g)];
    expect(rows).toHaveLength(30);
    const six = [0, 1, 2, 3, 4, 5];
    const letter = (i: number) => "abcdef"[i];
    for (const [, n, ...pairs] of rows) {
      const read = pairsMarked(`OH${n}`, six)!.map((p) => p.map(letter).sort().join("-")).sort();
      expect([n, read]).toEqual([n, [...pairs].sort()]);
    }
  });

  it("square planar by value, against the same transcription: SP1 a-c b-d, SP2 a-b c-d, SP3 a-d b-c", () => {
    const four = [0, 1, 2, 3];
    const letter = (i: number) => "abcd"[i];
    const read = (n: number) => pairsMarked(`SP${n}`, four)!.map((p) => p.map(letter).sort().join("-")).sort();
    expect([read(1), read(2), read(3)]).toEqual([["a-c", "b-d"], ["a-b", "c-d"], ["a-d", "b-c"]]);
  });

  it("reads the ring closures in the order of their digits: trans- and cis-[Co(en)2Cl2]+, fac- and mer-Co(gly)3", () => {
    expect(across("[Co@OH1+]123456.Cl1.[NH2]2CC[NH2]3.[NH2]4CC[NH2]5.Cl6")).toEqual(["Cl-Cl", "N-N", "N-N"]);
    expect(across("[Co@OH1+]123456.Cl1.Cl2.[NH2]3CC[NH2]4.[NH2]5CC[NH2]6")).toEqual(["Cl-N", "Cl-N", "N-N"]);
    expect(across("[Co@OH1]123456.[NH2]1CC(=O)O2.O3C(=O)C[NH2]4.[NH2]5CC(=O)O6")).toEqual(["N-O", "N-O", "N-O"]);
    expect(across("[Co@OH1]123456.[NH2]1CC(=O)O2.O3C(=O)C[NH2]6.O4C(=O)C[NH2]5")).toEqual(["N-N", "N-O", "O-O"]);
  });

  it("square planar: SP1 the U, SP2 the 4, SP3 the Z", () => {
    // (Cl, Cl, N, N in that order: the U puts the first across the third - cis; the 4 the first across the second - trans)
    expect(across("Cl[Pt@SP1](Cl)(N)N")).toEqual(["Cl-N", "Cl-N"]);
    expect(across("Cl[Pt@SP2](Cl)(N)N")).toEqual(["Cl-Cl", "N-N"]);
    expect(across("Cl[Pt@SP3](Cl)(N)N")).toEqual(["Cl-N", "Cl-N"]);
    expect(across("Cl[Pt@SP3](N)(N)Cl")).toEqual(["Cl-Cl", "N-N"]);
  });

  it("is refused where it cannot be read - not a metal, an H among the neighbours, the wrong count - and without metalMarks, as before", () => {
    expect(() => readSmiles("F[S@OH1](F)(F)(F)(F)F", { metalMarks: true })).toThrow(/only a metal's/);
    expect(() => readSmiles("Cl[Pt@SP1H](Cl)N", { metalMarks: true })).toThrow(/own H/);
    expect(() => readSmiles("Cl[Pt@SP1](Cl)(N)(N)N", { metalMarks: true })).toThrow(/four neighbours are needed/);
    expect(() => readSmiles("Cl[Pt@SP1](Cl)(N)N")).toThrow(/only @ and @@ are read/);
    expect(pairsMarked("TB1", [0, 1, 2, 3, 4])).toBeNull();
    // (a mark OpenSMILES has none of)
    for (const smiles of ["Cl[Pt@SP4](Cl)(N)N", "Cl[Pt@SP0](Cl)(N)N", "C[Co@OH31](F)(Cl)(Br)(I)S", "C[Co@OH0](F)(Cl)(Br)(I)S"])
      expect(() => readSmiles(smiles, { metalMarks: true }), smiles).toThrow(/is not a mark OpenSMILES has/);
  });

  it("refuses a mark that puts a five- or six-membered chelate's two ends across; a larger ring's may be", () => {
    // (ethylenediamine's two N across: its ring of five with the metal cannot span it)
    expect(() => readSmiles("[Co@OH1+]123456.[NH2]1CC[NH2]6.Cl2.Cl3.[NH3]4.[NH3]5", { metalMarks: true })).toThrow(/two ends of one chelate across/);
    // (the same ligand cis, as the mark has it with the N's second and third: read)
    expect(across("[Co@OH1+]123456.Cl1.[NH2]2CC[NH2]3.[NH3]4.[NH3]5.Cl6")).toEqual(["Cl-Cl", "N-N", "N-N"]);
    // (two N joined only by a chain of eight atoms - a ring of ten with the metal, as a porphyrin's opposite N - may be across)
    expect(across("[Co@OH1+]123456.[NH2]1CCCCCCCC[NH2]6.Cl2.Cl3.[NH3]4.[NH3]5")).toEqual(["Cl-N", "Cl-N", "N-N"]);
  });
});

describe("a ring carbon whose charge and H are stated (a bracket's [cH+], [cH-])", () => {
  // (a carbocation of two ring bonds and its H has its three bonds, and an empty p orbital: no double bond; a carbanion's
  //  likewise, its lone pair in the ring. Where the rest of the ring cannot then alternate, it is refused, never given a
  //  fourth bond at the cation)
  const ofSmiles = (text: string) => {
    const s = readSmiles(text);
    return { atoms: s.atoms, bonds: s.bonds, at: s.atoms.findIndex((a) => a.charge) };
  };
  const ordersAt = (text: string) => {
    const { atoms, bonds, at } = ofSmiles(text);
    const orders = kekuleOrders(atoms, bonds);
    return bonds.flatMap((b, k) => (b.a1 === at || b.a2 === at ? [orders[k]] : []));
  };
  it("gives a tropylium's, a cyclopentadienyl cation's and a cyclopentadienide's charged carbon only single bonds", () => {
    expect(ordersAt("c1cccc[cH+]c1")).toEqual([1, 1]);
    expect(ordersAt("[cH+]1cccc1")).toEqual([1, 1]);
    expect(ordersAt("c1ccc[cH-]1")).toEqual([1, 1]);
    expect(aromaticRefusal(ofSmiles("c1cccc[cH+]c1").atoms, ofSmiles("c1cccc[cH+]c1").bonds)).toBeNull();
  });
  it("never gives a ring carbocation a fourth bond: rings of six and eight with one [cH+] are refused", () => {
    for (const text of ["c1cc[cH+]cc1", "c1cccc[cH+]cc1"]) {
      expect(ordersAt(text)).toEqual([1, 1]);
      const { atoms, bonds } = ofSmiles(text);
      expect(aromaticRefusal(atoms, bonds)).toEqual(atoms.map((_, i) => i));
    }
    // (typed, it says where to look: the atom written with an H and a charge - its H may be one too many; the phenyl cation
    //  is c1cc[c+]cc1, read with its double bond)
    expect(() => smilesInput("c1cc[cH+]cc1")).toThrow(
      "This SMILES could not be read: its aromatic ring of 6 atoms (1, 2, 3, 4, 5 and 6) cannot have alternating double bonds as written: atom 4 is written with an H and a charge, which leave no room for a double bond",
    );
    expect(() => smilesInput("c1cc[c+]cc1")).not.toThrow();
    // (a refusal of the same kind with no such atom keeps its words)
    expect(() => smilesInput("c1cccc1")).toThrow(/cannot have alternating double bonds: is a charge or an H missing\?$/);
  });
  it("gives a substituted tropylium's charged carbon no double bond, and a phenyl cation's its one", () => {
    expect(ordersAt("c1cccc[c+](C)c1").filter((o) => o === 2)).toEqual([]);
    expect(ordersAt("[c+]1ccccc1").filter((o) => o === 2)).toEqual([2]);
  });
});

describe("a three-membered ring's N written with a hand", () => {
  // (Meno keeps an aziridine's N as a centre only with a halogen, an O or an N beside it (perception/stereo/lonePairs): a plain
  //  N-alkyl one is a conformer's to find, and its hand is refused with the reason, never dropped unsaid)
  it("refuses a plain N-methyl aziridine's hand, saying why", () => {
    expect(() => readSmiles("C[C@H]1C[N@]1C")).toThrow(/a N of three neighbours keeps no configuration of its own/);
  });
  it("reads an N-chloro aziridine's N, its two hands two isomers", () => {
    const [p, q] = [readSmiles("C[C@H]1[N@](Cl)C1"), readSmiles("C[C@H]1[N@@](Cl)C1")];
    expect(p.atoms[2].tetra && q.atoms[2].tetra).toBeTruthy();
    expect(p.atoms[2].tetra!.volume).toBe(-q.atoms[2].tetra!.volume);
    expect(identityText(cipInput("C[C@H]1[N@](Cl)C1"))).not.toBe(identityText(cipInput("C[C@H]1[N@@](Cl)C1")));
  });
});
