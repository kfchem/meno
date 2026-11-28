import { describe, expect, it } from "vitest";
import { aromaticRingSides, ringSides } from "./aromaticSides";
import { ELEMENTS } from "./elements";
import { piElectrons } from "./perception/aromatic";

type B = { a1: number; a2: number; order: number };
const bond = (a1: number, a2: number, order = 1): B => ({ a1, a2, order });
/** The ring a bond's second line goes into, as a sorted list of atoms. */
const into = (m: Map<number, number[]>, e: number) => [...(m.get(e) ?? [])].sort((a, b) => a - b);

describe("aromaticRingSides", () => {
  it("puts benzene's double bonds inside it", () => {
    const bonds = [bond(0, 1, 2), bond(1, 2), bond(2, 3, 2), bond(3, 4), bond(4, 5, 2), bond(5, 0)];
    const m = aromaticRingSides(6, bonds, Array(6).fill("C"));
    expect(into(m, 0)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(m.size).toBe(3);
  });

  it("shows as many aromatic rings as it can: phenanthrene's two outer rings", () => {
    // rings A (0-5), B (4,6,7,8,9,5) and C (6,10,11,12,13,7), every one of
    // them alternating: A/B share 4=5, B/C share 6=7
    const bonds = [
      bond(0, 1, 2), bond(1, 2), bond(2, 3, 2), bond(3, 4), bond(4, 5, 2), bond(5, 0), // A
      bond(4, 6), bond(6, 7, 2), bond(7, 8), bond(8, 9, 2), bond(9, 5), // B's own
      bond(6, 10), bond(10, 11, 2), bond(11, 12), bond(12, 13, 2), bond(13, 7), // C's own
    ];
    const m = aromaticRingSides(14, bonds, Array(14).fill("C"));
    expect(into(m, 4)).toEqual([0, 1, 2, 3, 4, 5]); // 4=5 into A
    expect(into(m, 7)).toEqual([6, 7, 10, 11, 12, 13]); // 6=7 into C
    expect(into(m, 9)).toEqual([4, 5, 6, 7, 8, 9]); // 8=9 is B's alone
  });

  it("between rings shown as often, takes the larger: indole's shared bond into the benzene", () => {
    // benzene 0-5 sharing 0=5 with the pyrrole 0,5,6,7,8 - N at 8, and 6=7
    const bonds = [
      bond(0, 1), bond(1, 2, 2), bond(2, 3), bond(3, 4, 2), bond(4, 5), bond(5, 0, 2), // benzene
      bond(5, 6), bond(6, 7, 2), bond(7, 8), bond(8, 0), // pyrrole
    ];
    const els = ["C", "C", "C", "C", "C", "C", "C", "C", "N"];
    const m = aromaticRingSides(9, bonds, els);
    expect(into(m, 5)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("keeps a shared double bond in the ring that is aromatic, beside one that is not", () => {
    // naphthalene with one ring made non-aromatic: 1,2-dihydro
    const bonds = [
      bond(0, 1, 2), bond(1, 2), bond(2, 3, 2), bond(3, 4), bond(4, 5, 2), bond(5, 0), // aromatic
      bond(4, 6), bond(6, 7, 2), bond(7, 8), bond(8, 9), bond(9, 5), // 8-9 single: not
    ];
    const m = aromaticRingSides(10, bonds, Array(10).fill("C"));
    expect(into(m, 4)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(m.has(7)).toBe(false); // 6=7 is in no aromatic ring
  });

  it("does not count a ring with a double bond out of it, or a cyclopentadiene", () => {
    // p-benzoquinone: two C=C in the ring, two C=O out of it
    const quinone = [
      bond(0, 1), bond(1, 2, 2), bond(2, 3), bond(3, 4), bond(4, 5, 2), bond(5, 0),
      bond(0, 6, 2), bond(3, 7, 2),
    ];
    expect(aromaticRingSides(8, quinone, [..."CCCCCCOO"]).size).toBe(0);
    const cp = [bond(0, 1, 2), bond(1, 2), bond(2, 3, 2), bond(3, 4), bond(4, 0)];
    expect(aromaticRingSides(5, cp, Array(5).fill("C")).size).toBe(0);
  });

  it("shows a five-ring as aromatic exactly where Meno's aromatic rule gives its fifth atom a lone pair: an arsole, a tellurophene too", () => {
    // the ring 0-4, 0=1 and 2=3, the atom left over at 4
    const ring = [bond(0, 1, 2), bond(1, 2), bond(2, 3, 2), bond(3, 4), bond(4, 0)];
    const pair = (el: string) =>
      piElectrons({ el, charge: 0, inSystem: false, outTo: null, triple: false, degree: 2 }) === 2;
    const shown = ELEMENTS.map((e) => e.symbol).filter(
      (el) => aromaticRingSides(5, ring, ["C", "C", "C", "C", el]).size === 2,
    );
    expect(shown).toEqual(ELEMENTS.map((e) => e.symbol).filter(pair));
    expect([...shown].sort()).toEqual(["As", "N", "O", "P", "S", "Se", "Te"]);
  });

  it("puts a double bond shared by a tellurophene and a cyclopentadiene into the tellurophene, however the atoms are numbered", () => {
    // two five-rings fused at 3=4: 0,1,2,3,4 (1=2) and 3,4,5,6,7 (5=6); one
    // atom left over in each, at 0 and at 7 - the Te at one, a CH2 at the other
    const bonds = [
      bond(0, 1), bond(1, 2, 2), bond(2, 3), bond(3, 4, 2), bond(4, 0),
      bond(4, 5), bond(5, 6, 2), bond(6, 7), bond(7, 3),
    ];
    const teAt0 = ringSides(8, bonds, ["Te", "C", "C", "C", "C", "C", "C", "C"]);
    expect(into(teAt0, 3)).toEqual([0, 1, 2, 3, 4]);
    const teAt7 = ringSides(8, bonds, ["C", "C", "C", "C", "C", "C", "C", "Te"]);
    expect(into(teAt7, 3)).toEqual([3, 4, 5, 6, 7]);
  });
});

describe("ringSides", () => {
  it("puts any ring's double bond inside its smallest ring", () => {
    // cyclohexene 0-5 with its double bond 0=1, fused to a cyclopentane on
    // 1-2: the double bond is in the six-membered ring only
    const bonds = [
      bond(0, 1, 2), bond(1, 2), bond(2, 3), bond(3, 4), bond(4, 5), bond(5, 0),
      bond(2, 6), bond(6, 7), bond(7, 1),
    ];
    const m = ringSides(8, bonds, Array(8).fill("C"));
    expect(into(m, 0)).toEqual([0, 1, 2, 3, 4, 5]);
    // a double bond shared by a four- and a six-membered ring: the four
    const shared = [
      bond(0, 1), bond(1, 2), bond(2, 3), bond(3, 4), bond(4, 5), bond(5, 0, 2),
      bond(5, 6), bond(6, 7), bond(7, 0),
    ];
    expect(into(ringSides(8, shared, Array(8).fill("C")), 5)).toEqual([0, 5, 6, 7]);
  });

  it("leaves a double bond out of a ring alone", () => {
    const bonds = [bond(0, 1), bond(1, 2), bond(2, 0), bond(0, 3, 2)];
    expect(ringSides(4, bonds, [..."CCCO"]).has(3)).toBe(false);
  });

  it("counts a five-ring's left-over atom by Meno's aromatic rule, its charge too: an N with a + charge gives no lone pair, a C- gives one", () => {
    // (a five-ring - its left-over atom 0, C1=C2, C3=C4 - fused at C3=C4 to a four-ring C3, C4, C6, C5: as aromatic, the shared
    //  double bond goes into the five-ring; not aromatic, into the smaller ring, the four)
    const bonds = [bond(0, 1), bond(1, 2, 2), bond(2, 3), bond(3, 4, 2), bond(4, 0), bond(3, 5), bond(5, 6), bond(6, 4)];
    const five = [0, 1, 2, 3, 4];
    const four = [3, 4, 5, 6];
    const at = (el: string, charge: number) => into(ringSides(7, bonds, [el, "C", "C", "C", "C", "C", "C"], [charge, 0, 0, 0, 0, 0, 0]), 3);
    expect(at("N", 0)).toEqual(five);
    expect(at("N", 1)).toEqual(four);
    expect(at("O", 1)).toEqual(four);
    expect(at("C", -1)).toEqual(five);
    expect(at("C", 0)).toEqual(four);
  });
});
