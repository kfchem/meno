import { describe, expect, it } from "vitest";
import {
  GIVES_A_METAL_A_PAIR,
  HELD_FLAT_BY_AN_ACYL,
  lonePairCentres,
  protonatedAmineHeld,
  pyramidal,
  SHARED_WITH_A_DOUBLE_BOND,
  type PyramidAtom,
  type PyramidBond,
} from "./lonePairs";
import * as before from "../../lonePairCentres";
import { readSmiles } from "../../smiles";

/** A structure from its SMILES, as the rule reads it: bracket atoms' hydrogens as written, the rest by Meno's SMILES reader. */
function graph(smiles: string): { atoms: PyramidAtom[]; bonds: PyramidBond[] } {
  const read = readSmiles(smiles);
  return {
    atoms: read.atoms.map((a) => ({ el: a.el, charge: a.charge, hs: a.hs ?? 0 })),
    bonds: read.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })),
  };
}

/** The atoms of a structure that are centres by their lone pair, by element and index. */
function centres(smiles: string): string[] {
  const { atoms, bonds } = graph(smiles);
  const is = lonePairCentres(atoms, bonds);
  return atoms.flatMap((a, i) => (is(i) ? [`${a.el}${i}`] : []));
}

describe("lonePairCentres", () => {
  it("keeps a phosphine's P and an arsine's As, measured - and a stibine's Sb and a bismuthine's Bi, by the group's trend", () => {
    expect(centres("C[P](CC)c1ccccc1")).toEqual(["P1"]);
    expect(centres("C[As](CC)c1ccccc1")).toEqual(["As1"]);
    expect(centres("C[Sb](CC)c1ccccc1")).toEqual(["Sb1"]);
    expect(centres("C[Bi](CC)c1ccccc1")).toEqual(["Bi1"]);
  });

  it("keeps no phosphole's P nor arsole's As, whose planar form closes an aromatic ring with its lone pair - but a phospholane's and an arsolane's", () => {
    expect(centres("CP1C=CC=C1")).toEqual([]);
    expect(centres("C[As]1C=CC=C1")).toEqual([]);
    expect(centres("CP1CCCC1")).toEqual(["P1"]);
    expect(centres("C[As]1CCCC1")).toEqual(["As1"]);
    // (a 2,3-dihydrophosphole's: its ring's CH2 gives it no aromatic count)
    expect(centres("CP1C=CCC1")).toEqual(["P1"]);
  });

  it("keeps a sulfoxide's, a sulfonium's and a sulfinamide's S, measured - and a selenoxide's, a selenonium's Se and a telluroxide's, a telluronium's Te, by the group's trend", () => {
    expect(centres("C[S](=O)CC")).toEqual(["S1"]);
    expect(centres("C[S+](CC)CCC")).toEqual(["S1"]);
    expect(centres("C[S](=O)N(C)C")).toEqual(["S1"]);
    expect(centres("C[Se](=O)CC")).toEqual(["Se1"]);
    expect(centres("C[Se+](CC)CCC")).toEqual(["Se1"]);
    expect(centres("C[Te](=O)CC")).toEqual(["Te1"]);
    expect(centres("C[Te+](CC)CCC")).toEqual(["Te1"]);
  });

  it("keeps no O+, nor an amine's N: none of the rule's", () => {
    expect(centres("C[O+](CC)CCC")).toEqual([]);
    expect(centres("CN(CC)CCC")).toEqual([]);
  });

  it("keeps an aziridine's N with a halogen, an O or an N on it or next to it in the ring: an N-chloro, an N-methoxy, an N-amino aziridine's, an oxaziridine's, a diaziridine's", () => {
    expect(centres("CC1(C)CN1Cl")).toEqual(["N4"]);
    expect(centres("CC1(C)CN1F")).toEqual(["N4"]);
    expect(centres("CC1(C)CN1OC")).toEqual(["N4"]);
    expect(centres("CC1(C)CN1N(C)C")).toEqual(["N4"]);
    expect(centres("CC1ON1C")).toEqual(["N3"]);
    expect(centres("CN1C(C)N1C")).toEqual(["N1", "N4"]);
  });

  it("keeps no plain N-alkyl aziridine's N, its barrier lower - nor an N-aryl's or an N-acyl's, lower still", () => {
    expect(centres("CC1CN1C")).toEqual([]);
    expect(centres("CN1CC1")).toEqual([]);
    expect(centres("CC1CN1c1ccccc1")).toEqual([]);
    expect(centres("CC(=O)N1CC1C")).toEqual([]);
    // (an N-chloro aziridine's N bonded to a pi system too: not kept)
    expect(centres("ClN1C(=C)C1")).toEqual([]);
  });

  it("keeps an N-aryl oxaziridine's N, its barrier measured as high as an N-chloro aziridine's; not an N-aryl diaziridine's, none measured", () => {
    // (this answer was "no centre" while the net of the ring's O raising the barrier and the aryl lowering it was not known. It is
    //  now: a free energy of activation of 23.4 kcal/mol for 3-methyl-2,3-diphenyloxaziridine, its invertomers seen going over to
    //  each other at room temperature (docs/EDITOR-2D.md, *Centres by a lone pair*), with the N-chloro aziridine's the rule keeps,
    //  well above an N-alkyl aziridine's it does not. So the N-aryl oxaziridine's N is a centre. A diaziridine's N with an aryl on
    //  it has no measured barrier and stays none: the aryl's bonds, aromatic, read as a pi system's, of order one and a half)
    expect(centres("c1ccccc1N1OC1")).toEqual(["N6"]);
    expect(centres("c1ccccc1N1NC1")).toEqual([]);
  });

  it("knows the answers of the N-aryl oxaziridine ruling (the maintainer, 2026-11-18)", () => {
    // (3-methyl-2,3-diphenyloxaziridine, the measured one: its N kept, its ring C a carbon centre and no lone pair's)
    expect(centres("CC1(c2ccccc2)ON1c1ccccc1")).toEqual(["N9"]);
    // (the same drawn with its rings' Kekule bonds: the same, Meno's count of an aromatic ring reading either)
    expect(centres("CC1(C2=CC=CC=C2)ON1C1=CC=CC=C1")).toEqual(["N9"]);
    // (a 2-acyl, a 2-sulfonyl, a 2-alkoxycarbonyl oxaziridine's N: none, an acyl's or a sulfonyl's lowering it far below)
    expect(centres("CC(=O)N1OC1(C)C")).toEqual([]);
    expect(centres("CS(=O)(=O)N1OC1c1ccccc1")).toEqual([]);
    expect(centres("COC(=O)N1OC1(C)C")).toEqual([]);
    // (1-phenylaziridine's and 1-phenyl-2,2-dimethylaziridine's N: none, no O or N beside it to hold it)
    expect(centres("c1ccccc1N1CC1")).toEqual([]);
    expect(centres("CC1(C)CN1c1ccccc1")).toEqual([]);
    // (2-tert-butyloxaziridine's N: kept, as before - no pi system on it)
    expect(centres("CC(C)(C)N1OC1c1ccccc1")).toEqual(["N4"]);
    // (2-(naphthalen-1-yl)oxaziridine's N: a carbocyclic aryl, fused rings of C only - kept, as a phenyl's)
    expect(centres("C1ON1c1cccc2ccccc12")).toEqual(["N2"]);
    // (an N-heteroaryl one - 2-(pyridin-2-yl), 2-(thiophen-2-yl), 2-(pyrrol-1-yl): none, as before. The measured barrier is a
    //  carbocyclic aryl's, at the edge of what keeps at room temperature, and none is measured for a heteroaryl, which may well
    //  lower it further; so the rule keeps to what was measured (the maintainer, 2026-11-25))
    expect(centres("C1ON1c1ccccn1")).toEqual([]);
    expect(centres("C1ON1c1cccs1")).toEqual([]);
    expect(centres("C1ON1n1cccc1")).toEqual([]);
    // (a quinolin-5-yl: joined by a C of its benzene ring, but its ring system holds an N - a heteroaryl, none)
    expect(centres("C1ON1c1cccc2ncccc12")).toEqual([]);
    // (an N-vinyl one: a pi system but no aryl, which the ruling does not cover - none, as before)
    expect(centres("C=CN1OC1(C)C")).toEqual([]);
  });

  it("keeps a bridgehead N of a small bridged ring system, every bridge of three atoms or fewer: Tröger's base's two, a quinuclidine's, a manxine's", () => {
    // (Tröger's base, C17H18N2: its two N joined by a CH2 and by two bridges of three atoms each)
    expect(centres("CC1=CC2=C(C=C1)N3CC4=C(C=CC(=C4)C)N(C2)C3")).toEqual(["N7", "N16"]);
    expect(centres("CC1CC2CCN1CC2")).toEqual(["N6"]);
    // (1-azabicyclo[3.3.3]undecane)
    expect(centres("C1CC2CCCN(C1)CCC2")).toEqual(["N6"]);
  });

  it("keeps no bridgehead N of a larger cage, a bridge of four atoms or more: 1-azabicyclo[4.4.4]tetradecane, a homologue of Tröger's base", () => {
    expect(centres("N12CCCCC(CCCC1)CCCC2")).toEqual([]);
    // (C18H20N2: one bridge of four atoms - left free, as the rule leaves any it is not sure holds)
    expect(centres("Cc1ccc2c(c1)CN1Cc3cc(C)ccc3N(C2)C1")).toEqual([]);
  });

  it("keeps no amine's N, nor one at the fusion of two rings or in a four-membered ring", () => {
    expect(centres("CN(CC)CCC")).toEqual([]);
    expect(centres("C1CCN2CCCC2C1")).toEqual([]);
    expect(centres("CC1CCN1C")).toEqual([]);
    // (a tropane's N is a bridge of one atom, its methyl out of the rings: no bridgehead)
    expect(centres("CN1C2CCC1CC2")).toEqual([]);
    // (1-azabicyclo[3.1.0]hexane, its rings fused at the N's bond: three paths reach C1, through C0, C2 and C3 - but
    //  that through C3 goes through C2 as well, so the three are no three bridges; and the same written from its N, the
    //  two paths that share an atom then the first two it walks)
    expect(centres("C1CC2CN12")).toEqual([]);
    expect(centres("N12CC1CCC2")).toEqual([]);
  });

  it("keeps no amide's N, its lone pair shared with its carbonyl: N-ethyl-N-methylformamide's, N-methyl-N-phenylacetamide's", () => {
    expect(centres("O=CN(C)CC")).toEqual([]);
    expect(centres("CC(=O)N(C)c1ccccc1")).toEqual([]);
  });

  it("keeps no atom without a lone pair", () => {
    // (an iminium's N+, SO3's S, a phosphonium's P+ of four, a phosphonium's P+ of three and an H)
    expect(centres("C[N+](C)=CC")).toEqual([]);
    expect(centres("O=S(=O)=O")).toEqual([]);
    expect(centres("C[P+](C)(C)C")).toEqual([]);
    expect(centres("C[PH+](C)C")).toEqual([]);
  });

  it("keeps a P, As, Sb or Bi with an H as without one - and no N, S, Se or Te with an H, its ring or charge notwithstanding (the maintainer, 2026-11-06)", () => {
    // (the H carried, as a drawing and a SMILES have it: a secondary phosphine's P, an arsine's, a stibine's, a bismuthine's)
    expect(centres("C[PH]CC")).toEqual(["P1"]);
    expect(centres("C[AsH]c1ccccc1")).toEqual(["As1"]);
    expect(centres("C[SbH]CC")).toEqual(["Sb1"]);
    expect(centres("C[BiH]CC")).toEqual(["Bi1"]);
    // (but not a 1H-phosphole's: aromatic with its lone pair, as an N-alkyl phosphole's is)
    expect(centres("[PH]1C=CC=C1")).toEqual([]);
    // (an oxaziridine's and a diaziridine's N-H: their N-methyl's kept, the N-H not)
    expect(centres("CC1ON1C")).toEqual(["N3"]);
    expect(centres("CC1O[NH]1")).toEqual([]);
    expect(centres("CN1C(C)[NH]1")).toEqual(["N1"]);
    // (a sulfonium's, a selenonium's and a telluronium's with an H; a sulfoxide's with one)
    expect(centres("C[S+](CC)CCC")).toEqual(["S1"]);
    expect(centres("C[SH+]CC")).toEqual([]);
    expect(centres("C[SeH+]CC")).toEqual([]);
    expect(centres("C[TeH+]CC")).toEqual([]);
    expect(centres("C[SH]=O")).toEqual([]);
    // (the H an atom of its own, as every H is in 3D: the same)
    const own = (els: string[], pairs: [number, number][], charge = 0) =>
      lonePairCentres(
        els.map((el, i) => ({ el, ...(i === 0 && charge ? { charge } : {}), hs: 0 })),
        pairs.map(([a, b]) => ({ a, b, order: 1 })),
      )(0);
    expect(own(["P", "C", "C", "H"], [[0, 1], [0, 2], [0, 3]])).toBe(true);
    expect(own(["As", "C", "C", "H"], [[0, 1], [0, 2], [0, 3]])).toBe(true);
    expect(own(["N", "C", "O", "H"], [[0, 1], [0, 2], [1, 2], [0, 3]])).toBe(false);
    expect(own(["N", "C", "O", "C"], [[0, 1], [0, 2], [1, 2], [0, 3]])).toBe(true);
    expect(own(["S", "C", "C", "H"], [[0, 1], [0, 2], [0, 3]], 1)).toBe(false);
    expect(own(["Se", "C", "C", "H"], [[0, 1], [0, 2], [0, 3]], 1)).toBe(false);
  });

  it("reads through no metal: an N whose ring closes at a metal is held by none", () => {
    const atoms: PyramidAtom[] = [{ el: "N" }, { el: "C", hs: 2 }, { el: "Pd" }, { el: "C", hs: 3 }, { el: "C", hs: 3 }];
    const bonds: PyramidBond[] = [
      { a: 0, b: 1, order: 1 },
      { a: 1, b: 2, order: 1 },
      { a: 2, b: 0, order: 1 },
      { a: 0, b: 3, order: 1 },
      { a: 0, b: 4, order: 1 },
    ];
    // (four neighbours, the metal one of them: no centre by its lone pair, whose pair is the metal's bond)
    expect(lonePairCentres(atoms, bonds)(0)).toBe(false);
    // (an N-chloro aziridine's N, held - but not where its ring closes at a metal it is bonded to)
    expect(centres("ClN1CC1")).toEqual(["N1"]);
    expect(centres("ClN1C[Pd]1")).toEqual([]);
    // (a quinuclidine's N, held - but not where one of its bridges runs through a metal)
    expect(centres("N12CCC(CC1)CC2")).toEqual(["N0"]);
    expect(centres("N12CCC(CC1)[Pd]C2")).toEqual([]);
  });
});

describe("pyramidal", () => {
  it("is a pyramid of three by its lone pair, but N", () => {
    expect(pyramidal("Te", 1, 3, 3, 0)).toBe(true);
    expect(pyramidal("Bi", 0, 3, 3, 0)).toBe(true);
    expect(pyramidal("S", 0, 3, 4, 0)).toBe(true);
    expect(pyramidal("O", 1, 3, 3, 0)).toBe(true);
    expect(pyramidal("N", 0, 3, 3, 0)).toBe(false);
    expect(pyramidal("S", 0, 3, 6, 0)).toBe(false);
    // (an H carried counted among its three: a secondary phosphine's P, a sulfonium's S+-H - a pyramid, kept or not)
    expect(pyramidal("P", 0, 2, 2, 1)).toBe(true);
    expect(pyramidal("S", 1, 2, 2, 1)).toBe(true);
    expect(pyramidal("P", 0, 3, 3, 1)).toBe(false);
    // (an S+ of a double bond, a single bond and an H: its H counted, no lone pair left)
    expect(pyramidal("S", 1, 2, 3, 1)).toBe(false);
  });
});

describe("protonatedAmineHeld", () => {
  const held = (smiles: string, at: number) => {
    const { atoms, bonds } = graph(smiles);
    return protonatedAmineHeld(atoms, bonds)(at);
  };

  it("keeps a protonated amine's N only where its amine's N is held: a quinuclidinium's, not a triethylammonium's", () => {
    // (quinuclidine, its N at a bridgehead of bicyclo[2.2.2]; protonated, as drawn [NH+])
    expect(held("C1C[NH+]2CCC1CC2", 2)).toBe(true);
    expect(held("CC[NH+](CC)CC", 2)).toBe(false);
    // (an H drawn as an atom, the same)
    expect(held("C1C[N+]2([H])CCC1CC2", 2)).toBe(true);
    expect(held("CC[N+]([H])(CC)CC", 2)).toBe(false);
  });

  it("asks nothing of any other atom: a quaternary N+, an iminium's, a neutral amine's", () => {
    expect(held("C[N+](C)(C)C", 1)).toBeNull();
    expect(held("C=[NH+]C", 1)).toBeNull();
    expect(held("CN(C)C", 1)).toBeNull();
  });
});

describe("the other lists of atoms with a lone pair, each its caller's own (part 14 B: gathered, none merged)", () => {
  it("holds each list as its caller had it", () => {
    expect([...HELD_FLAT_BY_AN_ACYL]).toEqual(["N", "O", "S"]);
    expect([...SHARED_WITH_A_DOUBLE_BOND]).toEqual(["N", "O"]);
    expect([...GIVES_A_METAL_A_PAIR]).toEqual(["N", "P", "As", "O", "S", "Se", "Te"]);
  });
});

describe("the rule's old home", () => {
  it("re-exports the core's rule unchanged: the same functions", () => {
    expect(before.lonePairCentres).toBe(lonePairCentres);
    expect(before.pyramidal).toBe(pyramidal);
    expect(before.protonatedAmineHeld).toBe(protonatedAmineHeld);
  });
});
