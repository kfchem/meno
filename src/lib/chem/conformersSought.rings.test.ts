import { describe, expect, it } from "vitest";
import benchmark from "../../../scripts/layout/molecules.json";
import organometallics from "../../../scripts/layout/organometallics.json";
import { smallestRings } from "../layout/rings";
import { canFlip, bondsInRings, flatRingAtoms, turningBonds, type SoughtAtom, type SoughtBond } from "./conformersSought";
import { readSmiles } from "./smiles";

// What conformersSought did before it took its rings from the core (lib/chem/perception): its own bridge search for the bonds in a ring, and its own
// lines for the rings of a set and the bridged test - kept here, so that the move is shown to change nothing over the layout benchmark.

function oldRingBonds(n: number, bonds: readonly SoughtBond[]): Set<number> {
  const adj: [number, number][][] = Array.from({ length: n }, () => []);
  bonds.forEach((b, i) => {
    if (b.a === b.b || b.a >= n || b.b >= n) return;
    adj[b.a].push([b.b, i]);
    adj[b.b].push([b.a, i]);
  });
  const seen = new Array<number>(n).fill(-1);
  const low = new Array<number>(n).fill(0);
  const bridges = new Set<number>();
  let time = 0;
  for (let root = 0; root < n; root++) {
    if (seen[root] >= 0) continue;
    const stack: { v: number; via: number; k: number }[] = [{ v: root, via: -1, k: 0 }];
    seen[root] = low[root] = time++;
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top.k < adj[top.v].length) {
        const [w, i] = adj[top.v][top.k++];
        if (i === top.via) continue;
        if (seen[w] < 0) {
          seen[w] = low[w] = time++;
          stack.push({ v: w, via: i, k: 0 });
        } else low[top.v] = Math.min(low[top.v], seen[w]);
      } else {
        stack.pop();
        const up = stack[stack.length - 1];
        if (up) {
          low[up.v] = Math.min(low[up.v], low[top.v]);
          if (low[top.v] > seen[up.v]) bridges.add(top.via);
        }
      }
    }
  }
  return new Set(bonds.flatMap((_, i) => (bridges.has(i) ? [] : [i])));
}

function oldCanFlip(atoms: readonly SoughtAtom[], bonds: readonly SoughtBond[], held: readonly (readonly number[])[] = []): boolean {
  const rings = smallestRings(
    atoms.length,
    bonds.filter((b) => b.a !== b.b && atoms[b.a] && atoms[b.b]).map((b) => [b.a, b.b] as const),
  );
  const flat = flatRingAtoms(atoms, bonds, rings, held);
  const edges = rings.map((r) => new Set(r.map((x, k) => (x < r[(k + 1) % r.length] ? `${x},${r[(k + 1) % r.length]}` : `${r[(k + 1) % r.length]},${x}`))));
  return rings.some((ring, i) => {
    if (ring.length < 5 || ring.every((x) => flat.has(x))) return false;
    const bridged = rings.some((other, j) => j !== i && other.length <= ring.length && [...edges[i]].filter((e) => edges[j].has(e)).length > 1);
    return !bridged;
  });
}

const smiles = [...benchmark.molecules, ...organometallics.molecules].flatMap((m: { name: string; smiles?: string }) => (m.smiles ? [{ name: m.name, smiles: m.smiles }] : []));

describe("conformersSought's rings, from the core: nothing it answers changed", () => {
  it("has the benchmark's structures to compare", () => {
    expect(smiles.length).toBeGreaterThan(50);
  });

  it("finds the bonds in a ring and whether a ring can flip as it did, for every structure of the layout benchmark and the organometallics", () => {
    let compared = 0;
    const unlike: string[] = [];
    for (const { name, smiles: text } of smiles) {
      let read;
      try {
        read = readSmiles(text);
      } catch {
        continue;
      }
      const atoms: SoughtAtom[] = read.atoms.map((a) => ({ el: a.el, charge: a.charge ?? 0 }));
      const bonds: SoughtBond[] = read.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order }));
      compared++;
      const before = oldRingBonds(atoms.length, bonds);
      if ([...bondsInRings(atoms, bonds)].sort().join() !== [...before].sort().join()) unlike.push(`${name}: the bonds in a ring`);
      // (and the bonds that turn, decided by them, stay outside every ring)
      if (turningBonds(atoms, bonds).some((i) => before.has(i))) unlike.push(`${name}: a turning bond in a ring`);
      if (oldCanFlip(atoms, bonds) !== canFlip(atoms, bonds)) unlike.push(`${name}: canFlip`);
    }
    expect(compared).toBeGreaterThan(50);
    expect(unlike).toEqual([]);
  });
});
