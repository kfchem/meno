import { describe, expect, it } from "vitest";
import { smallestRings } from "../layout/rings";
import { aromaticIn } from "./aromaticity";
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

  it("take indolizine whole: its six-ring through the N's lone pair with its five-ring, 10", () => {
    expect(read("c1ccn2cccc2c1").not).toEqual([]);
  });

  it("take two rings together only where they share one bond: a [2.2]paracyclophane-1,9-diene's twelve-ring runs across each benzene along three", () => {
    // (benzene and the twelve-ring through the bridges share three bonds: their atoms together, 14, are no ring, so no count of one -
    //  the bridges' four carbons are not aromatic, the two benzene rings are)
    const { aromatic, not } = read("C1=CC2=CC=C1C=CC1=CC=C(C=C2)C=C1");
    expect(aromatic).toHaveLength(12);
    expect(not).toHaveLength(4);
    const s = readSmiles("C1=CC2=CC=C1C=CC1=CC=C(C=C2)C=C1");
    const bridge = new Set(not);
    // (each atom left out is a bridge's: bonded to no more than one benzene carbon)
    expect(not.every((i) => s.bonds.filter((b) => (b.a1 === i || b.a2 === i) && !bridge.has(b.a1 === i ? b.a2 : b.a1)).length === 1)).toBe(true);
  });

  it("take two rings that share two bonds as no pair either: a six-ring between two seven-rings, all sp2, one seven-ring along two of its bonds", () => {
    // (the six-ring 6-7-8-9-12-13 shares one bond with the seven-ring through 0, 1, 10 and 11, and two - 12-13 and 13-6 - with the one
    //  through 2, 3, 4 and 5. That six-ring and seven-ring would count ten, 4n + 2, but together they are no ring: no count of one.
    //  Only the six-ring is aromatic)
    const smiles = "C1=CC2=CC=CC3=CC=C(C=C1)C2=C3";
    const s = readSmiles(smiles);
    const rings = smallestRings(s.atoms.length, s.bonds.map((b) => [b.a1, b.a2] as const));
    const shared = (p: readonly number[], q: readonly number[]) => s.bonds.filter((b) => [b.a1, b.a2].every((a) => p.includes(a) && q.includes(a))).length;
    expect(rings.flatMap((p, i) => rings.slice(i + 1).map((q) => shared(p, q))).sort()).toEqual([1, 1, 2]);
    expect(read(smiles)).toEqual({ aromatic: [6, 7, 8, 9, 12, 13], not: [0, 1, 2, 3, 4, 5, 10, 11] });
  });
});

describe("a ring with no pi bond and no empty p orbital, its atoms' lone pairs alone (backlog 182)", () => {
  it("is not aromatic, whatever its lone pairs count: As4, P4, a triaziridine, P3H3, P5H5", () => {
    for (const smiles of ["[As]12[As]3[As]1[As]23", "P12P3P1P23", "N1NN1", "P1PP1", "P1PPPP1"]) {
      expect(read(smiles).aromatic, smiles).toEqual([]);
    }
  });

  it("leaves the rings a pi bond or an empty p orbital makes as they were: pyrrole, furan, thiophene, the cyclopropenyl cation, borazine, benzene, the pentaphospholide anion", () => {
    for (const smiles of ["c1cc[nH]c1", "c1ccoc1", "c1ccsc1", "C1=C[CH+]1", "B1NBNBN1", "c1ccccc1", "[P-]1P=PP=P1"]) {
      expect(read(smiles).not, smiles).toEqual([]);
    }
  });
});
