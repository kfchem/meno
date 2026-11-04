import { describe, expect, it } from "vitest";
import { lonePairCentres, pyramidal, type PyramidAtom, type PyramidBond } from "./lonePairCentres";
import { readSmiles } from "./smiles";

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
  });

  it("keeps no atom without a lone pair, or with an H", () => {
    // (an iminium's N+, SO3's S, a phosphonium's P+ of four)
    expect(centres("C[N+](C)=CC")).toEqual([]);
    expect(centres("O=S(=O)=O")).toEqual([]);
    expect(centres("C[P+](C)(C)C")).toEqual([]);
    // (a secondary phosphine's P carries an H: three neighbours, not three and a lone pair)
    expect(centres("C[PH]CC")).toEqual([]);
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
    expect(pyramidal("P", 0, 2, 2, 1)).toBe(false);
  });
});
