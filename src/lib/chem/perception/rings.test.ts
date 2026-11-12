import { describe, expect, it } from "vitest";
import benchmark from "../../../../scripts/layout/molecules.json";
import held from "../../../../scripts/layout/heldout.json";
import organometallics from "../../../../scripts/layout/organometallics.json";
import { readSmiles } from "../smiles";
import type { ChemGraph } from "./graph";
import { factsOf } from "./facts";
import { distinctEdges, fused, ringSystemsOf, shared, sharesMoreThanABond, sharesThreeAtoms, smallestRings, spiro } from "./rings";

// Known answers, worked out by hand; every graph is built atom by atom, as a chemist draws it (bond length 1, nothing implicit).

const graph = (n: number, bonds: [number, number][], els: string[] = []): ChemGraph => ({ atoms: Array.from({ length: n }, (_, i) => ({ el: els[i] ?? "C" })), bonds: bonds.map(([a, b]) => ({ a, b, order: 1 })) });
const cycle = (atoms: number[]): [number, number][] => atoms.map((a, i) => [a, atoms[(i + 1) % atoms.length]]);

/** Hexagons of a lattice, joined where they share a vertex (by its place): the polycyclic aromatics, atom by atom. */
function hexes(cells: [number, number][]): ChemGraph {
  const at = new Map<string, number>();
  const bonds = new Map<string, [number, number]>();
  for (const [q, r] of cells) {
    const [cx, cy] = [Math.sqrt(3) * (q + r / 2), 1.5 * r];
    const ids = Array.from({ length: 6 }, (_, k) => {
      const a = (Math.PI / 180) * (30 + 60 * k);
      const key = `${(cx + Math.cos(a)).toFixed(3)},${(cy + Math.sin(a)).toFixed(3)}`;
      if (!at.has(key)) at.set(key, at.size);
      return at.get(key)!;
    });
    for (const [a, b] of cycle(ids)) bonds.set(a < b ? `${a},${b}` : `${b},${a}`, a < b ? [a, b] : [b, a]);
  }
  return graph(at.size, [...bonds.values()]);
}

const sizes = (g: ChemGraph) => g.bonds.map((_, i) => factsOf(g).sizeThrough(i));

describe("rings, by hand", () => {
  const cyclohexane = graph(6, cycle([0, 1, 2, 3, 4, 5]));
  const decalin = graph(10, [...cycle([0, 1, 2, 3, 4, 5]), [5, 6], [6, 7], [7, 8], [8, 9], [9, 0]]);
  const spiro45 = graph(10, [...cycle([0, 1, 2, 3, 4]), ...cycle([0, 5, 6, 7, 8, 9])]);
  // norbornane: C1..C7 as 0..6 - the bridgeheads 0 and 3, the two-carbon bridges 1-2 and 4-5, the one-carbon bridge 6
  const norbornane = graph(7, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [6, 3]]);
  const bco = graph(8, [[0, 2], [2, 3], [3, 1], [0, 4], [4, 5], [5, 1], [0, 6], [6, 7], [7, 1]]);
  const cubane = graph(8, [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]);
  // adamantane: four bridgeheads 0-3, a CH2 between each pair
  const adamantane = graph(10, [[0, 4], [1, 4], [0, 5], [2, 5], [0, 6], [3, 6], [1, 7], [2, 7], [1, 8], [3, 8], [2, 9], [3, 9]]);

  it("cyclohexane: one ring of six; every bond and atom 6", () => {
    const f = factsOf(cyclohexane);
    expect(f.rings.map((r) => r.length)).toEqual([6]);
    expect(sizes(cyclohexane)).toEqual([6, 6, 6, 6, 6, 6]);
    expect(f.inRing).toEqual([true, true, true, true, true, true]);
    expect([0, 3, 5].map((a) => f.sizeAt(a))).toEqual([6, 6, 6]);
  });

  it("decalin: two rings, fused - two atoms and one bond shared; the fusion bond 6; one system, one fused set", () => {
    const f = factsOf(decalin);
    expect(f.rings.map((r) => r.length)).toEqual([6, 6]);
    expect(shared(f.rings[0], f.rings[1])).toEqual({ atoms: 2, bonds: 1 });
    expect([fused(f.rings[0], f.rings[1]), spiro(f.rings[0], f.rings[1]), sharesThreeAtoms(f.rings[0], f.rings[1]), sharesMoreThanABond(f.rings[0], f.rings[1])]).toEqual([true, false, false, false]);
    expect(f.sizeThrough(decalin.bonds.findIndex((b) => b.a === 0 && b.b === 5 || b.a === 5 && b.b === 0))).toBe(6);
    expect(f.ringSystems).toHaveLength(1);
    expect(f.fusedSets).toEqual([[0, 1]]);
  });

  it("spiro[4.5]decane: two rings sharing one atom and no bond; one ring system, two fused sets", () => {
    const f = factsOf(spiro45);
    expect(f.rings.map((r) => r.length)).toEqual([5, 6]);
    expect(shared(f.rings[0], f.rings[1])).toEqual({ atoms: 1, bonds: 0 });
    expect(spiro(f.rings[0], f.rings[1])).toBe(true);
    expect(f.ringSystems).toHaveLength(1);
    expect(f.ringSystems[0].atoms.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(f.fusedSets).toEqual([[0], [1]]);
    expect(f.sizeAt(0)).toBe(5);
  });

  it("norbornane: two rings in the set, the two five-rings (the six-ring is their sum), sharing C1, C7 and C4; every bond and atom 5", () => {
    const f = factsOf(norbornane);
    expect(f.rings.map((r) => r.length)).toEqual([5, 5]);
    expect(shared(f.rings[0], f.rings[1])).toEqual({ atoms: 3, bonds: 2 });
    expect([...f.rings[0]].filter((a) => f.rings[1].includes(a)).sort()).toEqual([0, 3, 6]);
    expect(sharesThreeAtoms(f.rings[0], f.rings[1])).toBe(true);
    expect(sharesMoreThanABond(f.rings[0], f.rings[1])).toBe(true);
    expect(sizes(norbornane)).toEqual([5, 5, 5, 5, 5, 5, 5, 5]);
    expect(Array.from({ length: 7 }, (_, a) => f.sizeAt(a))).toEqual([5, 5, 5, 5, 5, 5, 5]);
  });

  it("bicyclo[2.2.2]octane: three six-rings tie, two are in the set, and every bond still reads 6 (the tie)", () => {
    const f = factsOf(bco);
    expect(f.rings.map((r) => r.length)).toEqual([6, 6]);
    expect(sizes(bco)).toEqual([6, 6, 6, 6, 6, 6, 6, 6, 6]);
  });

  it("cubane: five rings in the set (the six faces, one the sum of the rest); every bond 4", () => {
    const f = factsOf(cubane);
    expect(f.rings.map((r) => r.length)).toEqual([4, 4, 4, 4, 4]);
    expect(sizes(cubane)).toEqual(Array(12).fill(4));
  });

  it("adamantane: three rings in the set; every bond 6", () => {
    const f = factsOf(adamantane);
    expect(f.rings.map((r) => r.length)).toEqual([6, 6, 6]);
    expect(sizes(adamantane)).toEqual(Array(12).fill(6));
  });

  it("naphthalene, anthracene and pyrene: their rings, one ring system and one fused set each, as counted by hand", () => {
    for (const [name, cells, atoms, rings] of [["naphthalene", [[0, 0], [1, 0]], 10, 2], ["anthracene", [[0, 0], [1, 0], [2, 0]], 14, 3], ["pyrene", [[0, 0], [1, 0], [0, 1], [1, 1]], 16, 4]] as const) {
      const g = hexes(cells as unknown as [number, number][]);
      const f = factsOf(g);
      expect([name, g.atoms.length, f.rings.length, f.ringSystems.length, f.fusedSets.length]).toEqual([name, atoms, rings, 1, 1]);
      expect(f.rings.every((r) => r.length === 6)).toBe(true);
    }
    // (pyrene: its two inner atoms are each in three rings)
    const pyrene = factsOf(hexes([[0, 0], [1, 0], [0, 1], [1, 1]]));
    expect(pyrene.ringsAt.filter((r) => r.length === 3)).toHaveLength(2);
  });

  it("ferrocene drawn atom by atom: with the metal, rings of three through it; without it, the two five-rings only", () => {
    const els = ["Fe", ...Array(10).fill("C")];
    const bonds: [number, number][] = [...cycle([1, 2, 3, 4, 5]), ...cycle([6, 7, 8, 9, 10]), ...Array.from({ length: 10 }, (_, i): [number, number] => [0, i + 1])];
    const g = graph(11, bonds, els);
    const f = factsOf(g);
    expect(f.rings.map((r) => r.length)).toEqual(Array(10).fill(3));
    expect(f.sizeAt(0)).toBe(3);
    const without = factsWithoutMetals(g);
    expect(without.rings.map((r) => r.length)).toEqual([5, 5]);
    expect(without.sizeAt(0)).toBe(0);
    // (indices are kept: the metal is atom 0 still, its bonds in no ring)
    expect(without.inRing.slice(10)).toEqual(Array(10).fill(false));
  });

  it("biphenyl: the bond between the rings is in no ring, its size 0", () => {
    const g = graph(12, [...cycle([0, 1, 2, 3, 4, 5]), ...cycle([6, 7, 8, 9, 10, 11]), [0, 6]]);
    const f = factsOf(g);
    expect(f.inRing[12]).toBe(false);
    expect(f.sizeThrough(12)).toBe(0);
    expect(f.rings.map((r) => r.length)).toEqual([6, 6]);
  });

  it("a macrocycle of 14 with a fused benzene: the shared bond 6, the others 14", () => {
    const macro = cycle(Array.from({ length: 14 }, (_, i) => i));
    const g = graph(18, [...macro, [1, 14], [14, 15], [15, 16], [16, 17], [17, 0]]);
    const f = factsOf(g);
    expect(f.rings.map((r) => r.length)).toEqual([6, 14]);
    const sharedBond = g.bonds.findIndex((b) => (b.a === 0 && b.b === 1) || (b.a === 1 && b.b === 0));
    expect(f.sizeThrough(sharedBond)).toBe(6);
    expect(g.bonds.map((_, i) => f.sizeThrough(i)).filter((s) => s === 14)).toHaveLength(13);
  });

  it("a bond to itself, one listed twice, and a bond to no atom count once or not at all", () => {
    const g = graph(3, [[0, 1], [1, 0], [1, 1], [1, 2], [2, 0], [2, 9]]);
    expect(distinctEdges(g).edges).toEqual([[0, 1], [1, 2], [0, 2]]);
    const f = factsOf(g);
    expect(f.rings.map((r) => r.length)).toEqual([3]);
    expect(f.inRing).toEqual([true, true, false, true, true, false]);
  });

  it("is the one definition: smallestRings of the graph's distinct bonds gives the same rings, in the same order", () => {
    const g = bco;
    expect(factsOf(g).rings).toEqual(smallestRings(g.atoms.length, distinctEdges(g).edges));
  });

  it("groups rings into systems and fused sets as it says, whatever the graph", () => {
    expect(ringSystemsOf(5, [[0, 1, 2], [2, 3, 4]]).map((s) => s.rings)).toEqual([[0, 1]]);
    expect(ringSystemsOf(6, [[0, 1, 2], [3, 4, 5]]).map((s) => s.rings)).toEqual([[0], [1]]);
  });
});

// A plain search the one definition is checked against: the shortest cycle through a bond is the shortest other way between its ends, and one through an atom
// the shortest through any bond at it.
function plainSizeThrough(n: number, edges: readonly (readonly [number, number])[], skip: number): number {
  const [s, t] = edges[skip];
  const adj: number[][] = Array.from({ length: n }, () => []);
  edges.forEach(([a, b], i) => {
    if (i === skip) return;
    adj[a].push(b);
    adj[b].push(a);
  });
  const d = new Array<number>(n).fill(-1);
  d[s] = 0;
  const q = [s];
  for (let h = 0; h < q.length; h++) for (const w of adj[q[h]]) if (d[w] < 0) { d[w] = d[q[h]] + 1; q.push(w); }
  return d[t] < 0 ? 0 : d[t] + 1;
}

/** A seeded generator (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("the argument the core rests on, checked: a smallest set holds, for every bond and atom, a ring as small as the smallest through it", () => {
  it("equals a plain breadth-first search, bond by bond and atom by atom, on seeded random graphs - cages, fused, spiro, bridged, with ties", () => {
    const random = seeded(20261113);
    for (let trial = 0; trial < 300; trial++) {
      const n = 5 + Math.floor(random() * 11);
      // (a spanning tree and then some extra bonds: from a tree with one or two cycles to a cage)
      const bonds = new Map<string, [number, number]>();
      const add = (a: number, b: number) => {
        if (a === b) return;
        bonds.set(a < b ? `${a},${b}` : `${b},${a}`, a < b ? [a, b] : [b, a]);
      };
      for (let i = 1; i < n; i++) add(i, Math.floor(random() * i));
      const extra = 1 + Math.floor(random() * (n + 2));
      for (let k = 0; k < extra; k++) add(Math.floor(random() * n), Math.floor(random() * n));
      const edges = [...bonds.values()];
      const g = graph(n, edges);
      const f = factsOf(g);
      edges.forEach((_, i) => expect([trial, i, f.sizeThrough(i)]).toEqual([trial, i, plainSizeThrough(n, edges, i)]));
      for (let a = 0; a < n; a++) {
        const mine = edges.flatMap((e, i) => (e[0] === a || e[1] === a ? [plainSizeThrough(n, edges, i)] : [])).filter((s) => s > 0);
        expect([trial, a, f.sizeAt(a)]).toEqual([trial, a, mine.length ? Math.min(...mine) : 0]);
      }
      // (as many rings as the graph has independent cycles: bonds - atoms + pieces)
      expect(f.rings.length).toBe(edges.length - n + f.pieces.length);
    }
  });
});

/** The facts of a graph with its metals taken out: the first atom an iron here. */
import { factsWithoutMetals as without } from "./facts";
function factsWithoutMetals(g: ChemGraph) {
  return without(g, (el) => el === "Fe");
}

describe("the two tests of bridged rings, over the layout fixtures (design question 5)", () => {
  it("agree on every pair of rings of every structure of the benchmark, the held-out set and the organometallics: three atoms in common, and more than a bond shared with a ring no larger", () => {
    const disagree: string[] = [];
    let structures = 0;
    for (const m of [...benchmark.molecules, ...held.molecules, ...organometallics.molecules] as { name: string; smiles?: string }[]) {
      if (!m.smiles) continue;
      let read;
      try {
        read = readSmiles(m.smiles);
      } catch {
        continue;
      }
      structures++;
      const f = factsOf({ atoms: read.atoms.map((a) => ({ el: a.el })), bonds: read.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })) });
      for (let i = 0; i < f.rings.length; i++) {
        for (let j = i + 1; j < f.rings.length; j++) {
          const [r, t] = [f.rings[i], f.rings[j]];
          if (sharesThreeAtoms(r, t) !== (sharesMoreThanABond(r, t) || sharesMoreThanABond(t, r))) disagree.push(`${m.name}: rings of ${r.length} and ${t.length} share ${JSON.stringify(shared(r, t))}`);
        }
      }
    }
    expect(structures).toBeGreaterThan(100);
    expect(disagree).toEqual([]);
  });
});
