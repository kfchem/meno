import { describe, expect, it } from "vitest";
import { canonicalWritten, settingCisTrans, symmetryOrbits, type SymmetryInput } from "./symmetry";
import { identityText, type IdentityInput } from "../identity";
import { fromSmiles } from "../../layout/testdata/fromSmiles";

// Backlog 179, the chemistry check's ruling and known answers: a double bond with an end whose two other groups are alike is no
// stereo unit - turned over, it is the same molecule - so a cis or trans given there is none to every reading of the symmetry
// (`settingCisTrans`), and to identity; one test, asked with that unit left out and every other configuration kept.

/** Each atom's other neighbours than `not`. */
const others = (g: SymmetryInput, e: number, not: number) => g.bonds.flatMap((x) => (x.a === e && x.b !== not ? [x.b] : x.b === e && x.a !== not ? [x.a] : []));
/** `g` with each double bond in no ring and with a group on each end given cis or trans, in turn as `cis` says, against each end's first group. */
const set = (g: SymmetryInput, ...cis: boolean[]): SymmetryInput => {
  let n = 0;
  return {
    ...g,
    bonds: g.bonds.map((b) =>
      b.order === 2 && others(g, b.a, b.b).length && others(g, b.b, b.a).length ? { ...b, stereo: { refs: [others(g, b.a, b.b)[0], others(g, b.b, b.a)[0]] as [number, number], cis: cis[n++] } } : b,
    ),
  };
};
/** How many cis or trans `g` carries, double bonds' and odd cumulenes'. */
const given = (g: SymmetryInput) => g.bonds.filter((b) => b.stereo).length + (g.cumulated?.length ?? 0);
const text = (g: SymmetryInput) => canonicalWritten(g).text;
/** Whether the SMILES are one structure, as identity has them. */
const one = (...gs: (string | IdentityInput)[]) => new Set(gs.map((g) => identityText(typeof g === "string" ? fromSmiles(g) : g))).size === 1;

describe("a cis or trans that sets nothing: an end of two alike groups", () => {
  it("2-methylbut-2-ene given cis or trans: none, written as given none", () => {
    const g = fromSmiles("CC=C(C)C");
    for (const cis of [true, false]) {
      expect(given(settingCisTrans(set(g, cis)))).toBe(0);
      expect(text(set(g, cis))).toBe(text(g));
    }
    expect(one(set(g, true) as IdentityInput, set(g, false) as IdentityInput, "CC=C(C)C")).toBe(true);
  });

  it("2,7-dimethylocta-2,6-diene with each C=C given either way: none; each pair of methyls one orbit, as given none", () => {
    const g = fromSmiles("CC(C)=CCCC=C(C)C");
    const plain = symmetryOrbits(g).orbit;
    // (the methyls 0 and 2 on one end, 8 and 9 on the other)
    expect(plain[0]).toBe(plain[2]);
    expect(plain[8]).toBe(plain[9]);
    for (const [p, q] of [
      [true, true],
      [true, false],
      [false, true],
      [false, false],
    ]) {
      const s = set(g, p, q);
      expect(given(settingCisTrans(s))).toBe(0);
      const found = symmetryOrbits(s);
      expect(found.complete).toBe(true);
      expect(found.orbit).toEqual(plain);
      expect(text(s)).toBe(text(g));
      expect(one(s as IdentityInput, g as IdentityInput)).toBe(true);
    }
  });

  it("isobutene, a prenyl group, cyclohexylideneacetic acid (its ring's two arms alike): none", () => {
    for (const smiles of ["C=C(C)C", "CC(C)=CCO", "OC(=O)C=C1CCCCC1"]) {
      const g = fromSmiles(smiles);
      for (const cis of [true, false]) {
        expect(given(settingCisTrans(set(g, cis))), smiles).toBe(0);
        expect(text(set(g, cis)), smiles).toBe(text(g));
      }
    }
  });

  it("an odd cumulene's likewise: 2-methylpenta-2,3,4-triene's run, its end of two methyls, given cis or trans - none", () => {
    // (C0 - C1(C2) = C3 = C4 = C5 - C6: the run's ends 1 and 5)
    const g = fromSmiles("CC(C)=C=C=CC");
    for (const cis of [true, false]) {
      const s: SymmetryInput = { ...g, cumulated: [{ atoms: [1, 5], refs: [0, 6], cis }] };
      expect(given(settingCisTrans(s))).toBe(0);
      expect(text(s)).toBe(text(g));
    }
  });

  it("SMILES C/C(/C)=C/C: read as CC(C)=CC, the same identity, and no cis or trans written", () => {
    const g = fromSmiles("C/C(/C)=C/C");
    expect(given(g)).toBe(1);
    expect(given(settingCisTrans(g))).toBe(0);
    expect(text(g)).toBe(text(fromSmiles("CC(C)=CC")));
    expect(text(g)).not.toMatch(/:[ct]( |\|)/);
    expect(one("C/C(/C)=C/C", "C/C(\\C)=C/C", "CC(C)=CC")).toBe(true);
  });
});

describe("a cis or trans that sets something: kept", () => {
  it("(E)- and (Z)-3-methylpent-2-ene (a methyl and an ethyl on one end): kept, two texts, two identities", () => {
    const [e, z] = [fromSmiles("C/C=C(/C)CC"), fromSmiles("C/C=C(\\C)CC")];
    expect(given(settingCisTrans(e))).toBe(1);
    expect(text(e)).not.toBe(text(z));
    expect(one("C/C=C(/C)CC", "C/C=C(\\C)CC")).toBe(false);
  });

  it("an end with an (R)- and an (S)-sec-butyl, the other CH(CH3): kept - the two are not alike with their configurations kept - and its two forms two identities", () => {
    const [a, b] = ["C/C=C([C@@H](C)CC)/[C@H](C)CC", "C/C=C([C@@H](C)CC)\\[C@H](C)CC"];
    expect(given(settingCisTrans(fromSmiles(a)))).toBe(1);
    expect(text(fromSmiles(a))).not.toBe(text(fromSmiles(b)));
    expect(one(a, b)).toBe(false);
    // (two (R)-sec-butyls: alike, none)
    expect(given(settingCisTrans(fromSmiles("C/C=C([C@@H](C)CC)/[C@@H](C)CC")))).toBe(0);
  });

  it("(4-methylcyclohexylidene)acetic acid: its C=C kept where its C4 is set (the two together set its axis) and none where C4 is open; the two enantiomers two identities", () => {
    const [r, s, sTurned] = ["C[C@H]1CC/C(=C/C(=O)O)CC1", "C[C@@H]1CC/C(=C/C(=O)O)CC1", "C[C@@H]1CC/C(=C\\C(=O)O)CC1"];
    expect(given(settingCisTrans(fromSmiles(r)))).toBe(1);
    expect(given(settingCisTrans(fromSmiles("CC1CC/C(=C/C(=O)O)CC1")))).toBe(0);
    expect(text(fromSmiles(r))).not.toBe(text(fromSmiles(s)));
    expect(one(r, s)).toBe(false);
    // (turning both, the C=C and C4, is the same enantiomer)
    expect(one(r, sTurned)).toBe(true);
  });

  it("a C=C shared by two rings of ten (bicyclo[8.8.0]octadec-1(10)-ene): kept - the mirror through it swaps both ends' groups and turns it twice", () => {
    const g = fromSmiles("C1CCCCCCCC2=C1CCCCCCCC2");
    for (const cis of [true, false]) expect(given(settingCisTrans(set(g, cis)))).toBe(1);
    expect(text(set(g, true))).not.toBe(text(set(g, false)));
  });

  it("(2E)-6-methylhepta-2,5-diene with both given: the one with a methyl and a chain on each end kept, the one of two methyls none", () => {
    const g = fromSmiles("CC=CCC=C(C)C");
    const s = settingCisTrans(set(g, false, true));
    expect(s.bonds.flatMap((b) => (b.stereo ? [[b.a, b.b].sort((p, q) => p - q).join("=")] : []))).toEqual(["1=2"]);
  });

  it("an end of a (13C)methyl and a methyl: two groups apart, kept, the two forms two identities", () => {
    const g = fromSmiles("CC=C(C)C");
    const labelled = (h: SymmetryInput): IdentityInput => ({ ...h, atoms: h.atoms.map((a, i) => (i === 4 ? { ...a, isotope: 13 } : a)) });
    expect(one(labelled(set(g, true)), labelled(set(g, false)))).toBe(false);
    // (the same atoms without the label: one)
    expect(one(set(g, true) as IdentityInput, set(g, false) as IdentityInput)).toBe(true);
  });
});
