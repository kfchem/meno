import { describe, expect, it } from "vitest";
import { smallestRings } from "../layout/rings";
import { aromaticAtoms, aromaticIn, piElectrons, type PiState } from "./aromaticity";
import { kekuleOrders } from "./kekulize";
import { readSmiles } from "./smiles";

/** A structure from its SMILES, Kekulé: the atoms that lie on an aromatic ring, and those of its rings that do not. */
function read(smiles: string): { aromatic: number[]; not: number[] } {
  const s = readSmiles(smiles);
  const orders = kekuleOrders(s.atoms, s.bonds);
  const bonds = s.bonds.map((b, i) => ({ a: b.a1, b: b.a2, order: orders[i] }));
  const rings = smallestRings(s.atoms.length, bonds.map((b) => [b.a, b.b] as const));
  const on = aromaticIn(s.atoms, bonds, rings);
  const ringAtoms = [...new Set(rings.flat())].sort((p, q) => p - q);
  return { aromatic: ringAtoms.filter((i) => on.has(i)), not: ringAtoms.filter((i) => !on.has(i)) };
}

describe("aromatic rings, by each ring and each pair of rings fused at a bond", () => {
  it("are every ring of pyrene (16 in all), coronene (24) and perylene (20): each six-ring a benzene's 6, though the whole is 4n", () => {
    for (const smiles of ["c1cc2ccc3cccc4ccc(c1)c2c34", "c1cc2ccc3ccc4ccc5ccc6ccc1c1c2c3c4c5c61", "c1cc2cccc3c4cccc5cccc(c(c1)c23)c54"]) {
      expect(read(smiles).not, smiles).toEqual([]);
    }
  });

  it("leave a fluoranthene's and an acenaphthylene's five-ring not aromatic (5, alone or with a six-ring), their six-rings aromatic", () => {
    // (fluoranthene: every atom of its five-ring also lies on a six-ring, so every atom is aromatic all the same)
    expect(read("c1ccc2c(c1)-c1cccc3cccc-2c13").not).toEqual([]);
    // (acenaphthylene: its C1=C2 lies on the five-ring alone)
    expect(read("C1=Cc2cccc3cccc1c23").not).toEqual([0, 1]);
  });

  it("leave biphenylene's four-ring not aromatic (4), its six-rings aromatic", () => {
    const { aromatic, not } = read("c1ccc2c(c1)-c1ccccc1-2");
    expect(not).toEqual([]);
    expect(aromatic).toHaveLength(12);
  });

  it("take azulene's five- and seven-ring together: 10, though each alone is not", () => {
    expect(read("c1ccc2cccc2cc1").not).toEqual([]);
    // (pentalene's 8 and heptalene's 12, together, are not)
    expect(read("C1=CC2=CC=CC2=C1").aromatic).toEqual([]);
    expect(read("C1=CC=C2C=CC=CC=C2C=C1").aromatic).toEqual([]);
  });

  it("count a tropone's C=O and a 2-pyridone's none, a pyrrole's N-H and a furan's O two, a tropylium's C+ none", () => {
    for (const smiles of ["O=c1cccccc1", "O=c1cccc[nH]1", "c1cc[nH]c1", "c1ccoc1", "[cH+]1cccccc1", "[cH-]1cccc1"]) expect(read(smiles).not, smiles).toEqual([]);
  });

  it("take no ring with an atom not known: a CH2, a fulvene's C=CH2, cyclooctatetraene's 8", () => {
    expect(read("C1C=CC=C1").aromatic).toEqual([]);
    expect(read("C=C1C=CC=C1").aromatic).toEqual([]);
    expect(read("C1=CC=CC=CC=C1").aromatic).toEqual([]);
  });

  it("take an annulene of 4n + 2 as aromatic up to n = 5: [18] and [22], not [26] or [30]", () => {
    const annulene = (n: number) => `C1${"=CC".repeat((n - 2) / 2)}=C1`;
    expect(read(annulene(18)).not).toEqual([]);
    expect(read(annulene(22)).not).toEqual([]);
    expect(read(annulene(26)).aromatic).toEqual([]);
    expect(read(annulene(30)).aromatic).toEqual([]);
  });

  it("leave porphine's rings as before: its inner ring and its pyrroles with an N-H aromatic (18 and 6), the other two pyrroles' outer carbons not", () => {
    const { not } = read("c1cc2cc3ccc(cc4ccc(cc5ccc(cc1n2)n5)n4)n3");
    expect(not).toHaveLength(4);
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

  it("take indolizine whole: its six-ring through the N's lone pair with its five-ring, 10", () => {
    expect(read("c1ccn2cccc2c1").not).toEqual([]);
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
