/**
 * Which rings are aromatic in a structure as drawn: each atom's pi electrons
 * by how it stands in its ring system, counted by Meno's rule
 * (lib/chem/perception/aromatic, where the rule is stated and its sources
 * cited) - the rule lib/chem/kekulize and lib/chem/conformersSought take.
 */
import { aromaticAtoms, piElectrons } from "./perception/aromatic";

export { aromaticAtoms, MOST_PI, piElectrons, type PiState } from "./perception/aromatic";

/**
 * Each atom's ring system, by index (-1 for an atom in no ring): the rings
 * of `rings` joined where they share a bond - a naphthalene's two, an
 * azulene's - and the bonds that are ring bonds of it, by their atoms.
 */
export function ringSystems(n: number, rings: readonly (readonly number[])[]): { system: Int32Array; ringBonds: Set<string> } {
  const system = new Int32Array(n).fill(-1);
  const ringBonds = new Set<string>();
  const edges = rings.map((r) => r.map((x, k) => pairKey(x, r[(k + 1) % r.length])));
  for (const e of edges) e.forEach((k) => ringBonds.add(k));
  const parent = rings.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = new Map<string, number>();
  edges.forEach((es, i) =>
    es.forEach((k) => {
      const j = owner.get(k);
      if (j == null) owner.set(k, i);
      else parent[find(i)] = find(j);
    }),
  );
  rings.forEach((r, i) => r.forEach((a) => (system[a] = find(i))));
  return { system, ringBonds };
}

/**
 * The atoms of a structure drawn with its bonds' orders (aromatic, 4, where
 * drawn so) that lie on an aromatic ring (`aromaticAtoms`), by index, its
 * rings `rings` (the smallest set): each atom's electrons by how it stands
 * in its ring system (`piElectrons`).
 */
export function aromaticIn(
  atoms: readonly { el: string; charge?: number }[],
  bonds: readonly { a: number; b: number; order: number }[],
  rings: readonly (readonly number[])[],
): Set<number> {
  const around: [number, number][][] = atoms.map(() => []);
  for (const b of bonds) {
    if (b.a === b.b || !around[b.a] || !around[b.b]) continue;
    around[b.a].push([b.b, b.order]);
    around[b.b].push([b.a, b.order]);
  }
  const { system, ringBonds } = ringSystems(atoms.length, rings);
  // (a double or aromatic bond within its ring system, or the element across one out of it)
  const within = (x: number, j: number) => system[x] >= 0 && system[j] === system[x] && ringBonds.has(pairKey(x, j));
  return aromaticAtoms(rings, (x) => {
    const multiple = around[x].filter(([, o]) => o === 2 || o === 4);
    const out = multiple.find(([j]) => !within(x, j));
    return piElectrons({
      el: atoms[x].el,
      charge: atoms[x].charge ?? 0,
      inSystem: multiple.some(([j]) => within(x, j)),
      outTo: out ? atoms[out[0]].el : null,
      triple: around[x].some(([, o]) => o === 3),
      degree: around[x].length,
    });
  });
}

/** Two atoms as one key, the lower first. */
export const pairKey = (x: number, y: number) => (x < y ? `${x},${y}` : `${y},${x}`);
