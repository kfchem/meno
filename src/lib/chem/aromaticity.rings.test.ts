import { describe, expect, it } from "vitest";
import benchmark from "../../../scripts/layout/molecules.json";
import organometallics from "../../../scripts/layout/organometallics.json";
import { smallestRings } from "../layout/rings";
import { ringSystems } from "./aromaticity";
import { readSmiles } from "./smiles";

// aromaticity's ring systems, from the core's fused sets: shown to group atoms as its own union-find did, over the layout benchmark.

const pairKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
function oldRingSystems(n: number, rings: readonly (readonly number[])[]) {
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

/** Which atoms share a system, as a partition: each atom's group by its first member - the numbering of the groups is no one's. */
const partition = (system: Int32Array) => {
  const first = new Map<number, number>();
  return [...system].map((s, a) => (s < 0 ? -1 : (first.has(s) ? first.get(s)! : (first.set(s, a), a))));
};

describe("aromaticity's ring systems, from the core's fused sets: no atom grouped otherwise", () => {
  it("groups the atoms of every structure of the layout benchmark and the organometallics as it did, and finds the same ring bonds", () => {
    let compared = 0;
    for (const m of [...benchmark.molecules, ...organometallics.molecules] as { name: string; smiles?: string }[]) {
      if (!m.smiles) continue;
      let read;
      try {
        read = readSmiles(m.smiles);
      } catch {
        continue;
      }
      const n = read.atoms.length;
      const rings = smallestRings(n, read.bonds.filter((b) => b.a1 !== b.a2).map((b) => [b.a1, b.a2] as const));
      const [was, now] = [oldRingSystems(n, rings), ringSystems(n, rings)];
      compared++;
      expect([m.name, partition(now.system)]).toEqual([m.name, partition(was.system)]);
      expect([...now.ringBonds].sort()).toEqual([...was.ringBonds].sort());
    }
    expect(compared).toBeGreaterThan(50);
  });
});
