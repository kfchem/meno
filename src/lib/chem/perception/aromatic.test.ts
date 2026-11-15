import { describe, expect, it } from "vitest";
import { aromaticAtoms, MOST_PI, piElectrons, type PiState } from "./aromatic";

/** The atoms on an aromatic ring, in order, of rings given by hand and each atom's electrons by hand. */
const on = (rings: number[][], electrons: (number | null)[]) => [...aromaticAtoms(rings, (a) => electrons[a])].sort((p, q) => p - q);
/** A ring of `n` atoms, from atom `from`. */
const ring = (n: number, from = 0) => Array.from({ length: n }, (_, k) => from + k);

describe("Meno's rule for an aromatic ring: each ring, and each pair fused at a bond, of 4n + 2 electrons", () => {
  it("takes a ring of 2, 6, 10 electrons, not one of 4 or 8: Hückel's count, one electron an atom", () => {
    expect(on([ring(6)], Array(6).fill(1))).toEqual(ring(6));
    expect(on([ring(4)], Array(4).fill(1))).toEqual([]);
    expect(on([ring(8)], Array(8).fill(1))).toEqual([]);
    expect(on([ring(10)], Array(10).fill(1))).toEqual(ring(10));
    // (a cyclopropenyl cation: two electrons, n = 0)
    expect(on([ring(3)], [1, 1, 0])).toEqual(ring(3));
  });

  it("goes as far as MOST_PI, 22 (n = 5): an annulene of 22 is aromatic, one of 26 not", () => {
    expect(MOST_PI).toBe(22);
    expect(on([ring(22)], Array(22).fill(1))).toEqual(ring(22));
    expect(on([ring(26)], Array(26).fill(1))).toEqual([]);
  });

  it("takes no ring with an atom whose electrons are not known, whatever the rest add up to", () => {
    expect(on([ring(6)], [1, 1, 1, 1, 1, null])).toEqual([]);
  });

  it("counts a pair fused at a bond whole: azulene's five- and seven-ring (5 + 7 electrons, 10 together), though neither alone is", () => {
    // (atoms 0-4 the five-ring, 3-9 the seven-ring, sharing the bond 3-4)
    const azulene = [
      [0, 1, 2, 3, 4],
      [3, 4, 5, 6, 7, 8, 9],
    ];
    expect(on(azulene, Array(10).fill(1))).toEqual(ring(10));
  });

  it("take two rings as a pair only where they share a bond: two sharing one atom alone (spiro) stay apart", () => {
    // (two five-rings sharing atom 4 alone, each counting 4 - atom 4 two, two others one each, the rest none - their
    //  atoms together 4 + 4 - 2 = 6: counted as one, they would be taken for aromatic)
    const electrons = [1, 1, 0, 0, 2, 1, 1, 0, 0];
    const spiro = [
      [0, 1, 2, 3, 4],
      [4, 5, 6, 7, 8],
    ];
    expect([...aromaticAtoms(spiro, (a) => electrons[a])]).toEqual([]);
    // (the same two sharing the bond 3-4 instead: a pair, 4 + 4 - 2 - 0 = 6, aromatic)
    const fused = [
      [0, 1, 2, 3, 4],
      [3, 4, 5, 6, 7],
    ];
    expect([...aromaticAtoms(fused, (a) => [1, 1, 0, 0, 2, 1, 1, 0][a])].sort((p, q) => p - q)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

});

describe("an atom's pi electrons", () => {
  const atom = (s: Partial<PiState>): PiState => ({ el: "C", charge: 0, inSystem: false, outTo: null, triple: false, degree: 3, ...s });

  it("are one with a double bond in its ring system, none with a C=O, C=N, C=S, C=Se or C=Te out of it", () => {
    expect(piElectrons(atom({ inSystem: true }))).toBe(1);
    for (const el of ["O", "N", "S", "Se", "Te"]) expect(piElectrons(atom({ outTo: el })), el).toBe(0);
  });

  it("are not known with a C=C, C=P or C=As out of it, or a triple bond - nor for any atom but C with a double bond out of it", () => {
    for (const el of ["C", "P", "As"]) expect(piElectrons(atom({ outTo: el })), el).toBeNull();
    // (an N=O, an S=O, a P=S out of the ring: a ring N-oxide or S-oxide drawn so)
    for (const [el, to] of [["N", "O"], ["S", "O"], ["P", "S"], ["N", "N"]]) expect(piElectrons(atom({ el, outTo: to })), `${el}=${to}`).toBeNull();
    expect(piElectrons(atom({ triple: true, inSystem: true }))).toBeNull();
  });

  it("are a lone pair's two, a carbanion's two, a carbocation's none, a boron's none and a B-'s one of three bonds", () => {
    for (const el of ["N", "P", "As", "O", "S", "Se", "Te"]) expect(piElectrons(atom({ el })), el).toBe(2);
    expect(piElectrons(atom({ charge: -1 }))).toBe(2);
    expect(piElectrons(atom({ charge: 1 }))).toBe(0);
    expect(piElectrons(atom({ el: "B" }))).toBe(0);
    expect(piElectrons(atom({ el: "B", charge: -1 }))).toBe(1);
    expect(piElectrons(atom({ el: "B", charge: -1, degree: 4 }))).toBeNull();
    // (a CH2's, an N+ with no double bond: not known)
    expect(piElectrons(atom({}))).toBeNull();
    expect(piElectrons(atom({ el: "N", charge: 1 }))).toBeNull();
  });
});
