/**
 * Compare bonding's stereo units on bare graphs, at the candidates' edges: two alike heavy groups, ring and cumulene double bonds, a
 * quaternary ammonium, hydrogens drawn before their atoms (found in review).
 */
import { describe, expect, it } from "vitest";
import { stereoUnits } from "./compareBonding";

type S = Parameters<typeof stereoUnits>[0];
/** A structure by its atoms' elements (an element and a charge for a charged atom) and its bonds. */
const graph = (atoms: (string | [string, number])[], bonds: [number, number, (1 | 2 | 3)?][]): S => ({
  atoms: atoms.map((a) => (typeof a === "string" ? { el: a } : { el: a[0], charge: a[1] })),
  bonds: bonds.map(([a1, a2, order]) => ({ a1, a2, order: order ?? 1 })),
});
const centres = (s: S) => stereoUnits(s).centres.map((c) => c.atom);
const doubles = (s: S) => stereoUnits(s).doubleBonds;

describe("Compare bonding's stereo units, by the candidates (found in review)", () => {
  it("a centre of four unlike groups is one: CHFClBr, its H the first atom", () => {
    // (atoms H0 C1 F2 Cl3 Br4: the C is atom 1 - the folded graph's place for it is 0)
    expect(centres(graph(["H", "C", "F", "Cl", "Br"], [[1, 0], [1, 2], [1, 3], [1, 4]]))).toEqual([1]);
  });

  it("an isopropyl's CH is none: two of its groups alike, though a candidate by shape", () => {
    // (C0 C1 C2 O3, the CH's H4: its two methyls alike)
    expect(centres(graph(["C", "C", "C", "O", "H"], [[1, 0], [1, 2], [1, 3], [1, 4]]))).toEqual([]);
  });

  it("a quaternary ammonium's N is one", () => {
    // (N0+ with a methyl, an ethyl, a propyl and a butyl: C1; C2 C3; C4 C5 C6; C7 C8 C9 C10)
    const chains: [number, number][] = [[0, 1], [0, 2], [2, 3], [0, 4], [4, 5], [5, 6], [0, 7], [7, 8], [8, 9], [9, 10]];
    expect(centres(graph([["N", 1], ...Array(10).fill("C")], chains))).toEqual([0]);
  });

  it("a protonated amine's N+ with an H is none, as the body says: its H exchanges", () => {
    // (N0+ with an H7 and a methyl, an ethyl, a propyl: C1; C2 C3; C4 C5 C6)
    const ammonium: [number, number][] = [[0, 1], [0, 2], [2, 3], [0, 4], [4, 5], [5, 6], [0, 7]];
    expect(centres(graph([["N", 1], "C", "C", "C", "C", "C", "C", "H"], ammonium))).toEqual([]);
  });

  it("a double bond with a group on each end is one: but-2-ene, its H's the first atoms", () => {
    // (H0 H1 C2 C3 C4 C5: C2=C3, C4 on C2 and C5 on C3, H0 on C2 and H1 on C3: the first neighbour of each end by number is its H)
    const but2ene = graph(["H", "H", "C", "C", "C", "C"], [[2, 3, 2], [2, 0], [3, 1], [2, 4], [3, 5]]);
    expect(doubles(but2ene)).toEqual([[0, 2, 3, 1]]);
  });

  it("a ring's double bond is none, nor is a cumulene's", () => {
    // (cyclohexene's C0=C1, an H on each)
    const ring = graph(["C", "C", "C", "C", "C", "C", "H", "H"], [[0, 1, 2], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [1, 7]]);
    expect(doubles(ring)).toEqual([]);
    // (an allene H3C-CH=C=CH-CH3: C0 C1=C2=C3 C4, an H on C1 and on C3)
    const allene = graph(["C", "C", "C", "C", "C", "H", "H"], [[0, 1], [1, 2, 2], [2, 3, 2], [3, 4], [1, 5], [3, 6]]);
    expect(doubles(allene)).toEqual([]);
  });
});
