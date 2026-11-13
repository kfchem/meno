import { describe, expect, it } from "vitest";
import { aromaticAtoms, aromaticForm, huckelBonds, huckelForm, MOST_PI, piElectrons, type PiState } from "./aromatic";
import type { ChemGraph } from "./graph";
import { kekuleOrders } from "../kekulize";
import { readSmiles } from "../smiles";

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

/** A structure from its SMILES, its aromatic bonds given Kekulé orders first, as every reader gives them. */
function kekule(smiles: string): ChemGraph {
  const r = readSmiles(smiles);
  const orders = kekuleOrders(r.atoms, r.bonds);
  return { atoms: r.atoms.map((a) => ({ el: a.el, charge: a.charge, hs: a.hs })), bonds: r.bonds.map((b, i) => ({ a: b.a1, b: b.a2, order: orders[i] })) };
}
/** How many bonds each form makes aromatic, of how many: [bonds, `aromaticForm`'s, `huckelBonds`']. */
function counts(smiles: string): [number, number, number] {
  const g = kekule(smiles);
  return [g.bonds.length, aromaticForm(g).bonds.filter((b) => b.order === 4).length, huckelBonds(g.atoms.length, g.bonds).size];
}

describe("the two aromatic forms: identity's (every alternating cycle) and geometry's (4n + 2 only)", () => {
  it("make the same bonds aromatic where every alternating cycle is of 4n + 2: benzene, pyridine, naphthalene, pyrene, [18]annulene", () => {
    expect(counts("c1ccccc1")).toEqual([6, 6, 6]);
    expect(counts("c1ccncc1")).toEqual([6, 6, 6]);
    expect(counts("c1ccc2ccccc2c1")).toEqual([11, 11, 11]);
    expect(counts("c1cc2ccc3cccc4ccc(c1)c2c34")).toEqual([19, 19, 19]);
    expect(counts(`C1${"=CC".repeat(8)}=C1`)).toEqual([18, 18, 18]);
  });

  it("part over a 4n cycle: cyclobutadiene's and cyclooctatetraene's ring aromatic for identity, single and double for geometry", () => {
    expect(counts("C1=CC=C1")).toEqual([4, 4, 0]);
    expect(counts("C1=CC=CC=CC=C1")).toEqual([8, 8, 0]);
    const cot = kekule("C1=CC=CC=CC=C1");
    expect(huckelForm(cot)).toBe(cot);
    expect(new Set(aromaticForm(cot).bonds.map((b) => b.order))).toEqual(new Set([4]));
  });

  it("take a perimeter as a ring: azulene's ten both ways, pentalene's and heptalene's (4n) for identity only, the bond across the middle single in all", () => {
    expect(counts("c1ccc2cccc2cc1")).toEqual([11, 10, 10]);
    expect(counts("C1=CC2=CC=CC2=C1")).toEqual([9, 8, 0]);
    expect(counts("C1=CC=C2C=CC=CC=C2C=C1")).toEqual([13, 12, 0]);
  });

  it("give identity biphenylene's two bonds between its rings as well (a Kekulé structure has them double), geometry its two benzenes alone", () => {
    expect(counts("c1ccc2c(c1)-c1ccccc1-2")).toEqual([14, 14, 12]);
  });

  it("leave what every Kekulé structure has: acenaphthylene's five-ring C=C, indole's and pyrrole's five-ring, a quinone, an open chain", () => {
    expect(counts("C1=Cc2cccc3cccc1c23")).toEqual([14, 11, 11]);
    expect(counts("c1ccc2[nH]ccc2c1")).toEqual([10, 6, 6]);
    expect(counts("c1cc[nH]c1")).toEqual([5, 0, 0]);
    expect(counts("O=C1C=CC(=O)C=C1")).toEqual([8, 0, 0]);
    expect(counts("C=CC=C")).toEqual([3, 0, 0]);
    expect(counts("C=CC=CC=C")).toEqual([5, 0, 0]);
  });

  it("come to one form from either of benzene's Kekulé structures, and give a structure with nothing to join back as it was", () => {
    const one: ChemGraph = { atoms: Array.from({ length: 6 }, () => ({ el: "C" })), bonds: [0, 1, 2, 3, 4, 5].map((k) => ({ a: k, b: (k + 1) % 6, order: k % 2 ? 1 : 2 })) };
    const other: ChemGraph = { ...one, bonds: one.bonds.map((b) => ({ ...b, order: 3 - b.order })) };
    for (const form of [aromaticForm, huckelForm]) expect(form(one)).toEqual(form(other));
    const butadiene = kekule("C=CC=C");
    expect(aromaticForm(butadiene)).toBe(butadiene);
    expect(huckelForm(butadiene)).toBe(butadiene);
  });

  it("keep what else the graph carries, and drop a side said on a bond made aromatic", () => {
    const g = { ...kekule("C1=CC=CC=CC=C1"), extra: "kept" };
    g.bonds = g.bonds.map((b) => (b.order === 2 ? { ...b, stereo: { refs: [b.a, b.b] as [number, number], cis: true } } : b));
    const form = aromaticForm(g);
    expect(form.extra).toBe("kept");
    expect(form.bonds.filter((b) => b.stereo)).toEqual([]);
  });
});
