import { describe, expect, it } from "vitest";
import { ringsAlike, smallestRings, type Edge } from "./rings";
import cages from "./testdata/cages.json";

/**
 * Horton's search over the whole graph at once, as it was done before each
 * ring system was searched on its own: what the rings must still come out as,
 * one for one and in the same order.
 */
function wholeGraphRings(n: number, edges: readonly Edge[]): number[][] {
  const adj: number[][] = Array.from({ length: n }, () => []);
  edges.forEach(([a, b]) => (adj[a].push(b), adj[b].push(a)));
  const seen = new Array<boolean>(n).fill(false);
  let pieces = 0;
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    pieces++;
    const todo = [s];
    seen[s] = true;
    while (todo.length) {
      for (const to of adj[todo.pop()!]) {
        if (seen[to]) continue;
        seen[to] = true;
        todo.push(to);
      }
    }
  }
  const want = edges.length - n + pieces;
  if (want <= 0) return [];
  const parent: Int32Array[] = [];
  const dist: Int32Array[] = [];
  for (let s = 0; s < n; s++) {
    const p = new Int32Array(n).fill(-1);
    const d = new Int32Array(n).fill(-1);
    d[s] = 0;
    const q = [s];
    for (let h = 0; h < q.length; h++) {
      for (const to of adj[q[h]]) {
        if (d[to] >= 0) continue;
        d[to] = d[q[h]] + 1;
        p[to] = q[h];
        q.push(to);
      }
    }
    parent.push(p);
    dist.push(d);
  }
  const path = (s: number, t: number) => {
    const out = [t];
    for (let u = t; u !== s; ) out.push((u = parent[s][u]));
    return out.reverse();
  };
  const candidates = new Map<string, number[]>();
  for (let v = 0; v < n; v++) {
    for (const [x, y] of edges) {
      if (dist[v][x] < 0 || dist[v][y] < 0 || Math.abs(dist[v][x] - dist[v][y]) > 1) continue;
      const px = path(v, x);
      const py = path(v, y);
      const inX = new Set(px);
      if (py.some((a, i) => i > 0 && inX.has(a))) continue;
      const ring = [...px, ...py.slice(1).reverse()];
      if (ring.length < 3) continue;
      const key = [...ring].sort((a, b) => a - b).join(",");
      if (!candidates.has(key)) candidates.set(key, ring);
    }
  }
  const edgeIndex = new Map<string, number>();
  edges.forEach(([a, b], e) => edgeIndex.set(a < b ? `${a},${b}` : `${b},${a}`, e));
  const words = Math.ceil(edges.length / 32);
  const basis: { pivot: number; v: Uint32Array }[] = [];
  const kept: number[][] = [];
  for (const ring of [...candidates.values()].sort((a, b) => a.length - b.length)) {
    const v = new Uint32Array(words);
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length];
      const e = edgeIndex.get(a < b ? `${a},${b}` : `${b},${a}`)!;
      v[e >>> 5] ^= 1 << (e & 31);
    });
    for (const { pivot, v: b } of basis) if (v[pivot >>> 5] & (1 << (pivot & 31))) for (let w = 0; w < words; w++) v[w] ^= b[w];
    let pivot = -1;
    for (let w = 0; w < words && pivot < 0; w++) if (v[w]) pivot = w * 32 + (31 - Math.clz32(v[w] & -v[w]));
    if (pivot < 0) continue;
    basis.push({ pivot, v });
    kept.push(ring);
    if (kept.length === want) break;
  }
  return kept;
}

/** A small seeded generator, so that a failure can be had again. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

/**
 * A page of molecules of every sort, shuffled together: chains, fused and
 * spiro rings, bridged systems, cages, rings strung on chains - their atoms
 * numbered in no particular order, as a file can give them.
 */
function randomPage(seed: number): { n: number; edges: Edge[] } {
  const rnd = seeded(seed);
  const pick = (k: number) => Math.floor(rnd() * k);
  const edges: [number, number][] = [];
  let n = 0;
  const molecules = 2 + pick(6);
  for (let m = 0; m < molecules; m++) {
    const start = n;
    const size = 3 + pick(14);
    n += size;
    // a tree, then bonds across it: rings, fused, bridged, caged
    for (let i = 1; i < size; i++) edges.push([start + pick(i), start + i]);
    const extra = pick(5);
    for (let k = 0; k < extra; k++) {
      const a = start + pick(size);
      const b = start + pick(size);
      if (a !== b && !edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) edges.push([a, b]);
    }
  }
  // numbered in no particular order, bonds listed in no particular order
  const renumber = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = pick(i + 1);
    [renumber[i], renumber[j]] = [renumber[j], renumber[i]];
  }
  const out = edges.map(([a, b]) => (rnd() < 0.5 ? [renumber[a], renumber[b]] : [renumber[b], renumber[a]]) as [number, number]);
  for (let i = out.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return { n, edges: out };
}

describe("smallestRings", () => {
  it("finds naphthalene's two rings, not the ten-membered one round both", () => {
    // two hexagons sharing the bond 0-5
    const edges: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
      [5, 6], [6, 7], [7, 8], [8, 9], [9, 0],
    ];
    const rings = smallestRings(10, edges);
    expect(rings.map((r) => r.length).sort()).toEqual([6, 6]);
  });

  it("finds five of cubane's six faces, as many as it has independent rings", () => {
    const edges: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    const rings = smallestRings(8, edges);
    expect(rings).toHaveLength(5);
    expect(rings.every((r) => r.length === 4)).toBe(true);
  });

  it("has none for a chain", () => {
    expect(smallestRings(3, [[0, 1], [1, 2]])).toEqual([]);
  });

  it("gives cages and bridged systems the rings, in the order, a search of the whole graph gives", () => {
    const molecules = Object.entries(cages as Record<string, { atoms: unknown[]; bonds: { a: number; b: number }[] }>).map(
      ([name, m]) => ({ name, n: m.atoms.length, edges: m.bonds.map((b) => [b.a, b.b] as const) }),
    );
    // cubane, tetrahedrane (three four-membered rings on the same atoms
    // with different bonds), adamantane, and a spiro pair of rings
    molecules.push(
      { name: "cubane", n: 8, edges: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]] },
      { name: "tetrahedrane", n: 4, edges: [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]] },
      { name: "adamantane", n: 10, edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 6], [6, 7], [7, 3], [7, 8], [8, 9], [9, 5]] },
      { name: "spiro", n: 9, edges: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [4, 5], [5, 6], [6, 7], [7, 0], [6, 8]] },
    );
    for (const { name, n, edges } of molecules) {
      expect(smallestRings(n, edges), name).toEqual(wholeGraphRings(n, edges));
    }
    // and all of them on one page
    const page: Edge[] = [];
    let n = 0;
    for (const m of molecules) {
      for (const [a, b] of m.edges) page.push([a + n, b + n]);
      n += m.n;
    }
    expect(smallestRings(n, page)).toEqual(wholeGraphRings(n, page));
  });

  it("gives a page of many molecules the rings, in the order, a search of the whole page gives", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { n, edges } = randomPage(seed);
      expect(smallestRings(n, edges), `seed ${seed}`).toEqual(wholeGraphRings(n, edges));
    }
  });

  it("finds a thousand molecules' rings at the cost of a thousand small searches", () => {
    // 1000 copies of a steroid's four rings with a side chain: 28 000 atoms,
    // which a search over the whole page takes seconds and gigabytes to do
    const one: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], // A
      [4, 6], [6, 7], [7, 8], [8, 9], [9, 5], // B, fused at 4-5
      [8, 10], [10, 11], [11, 12], [12, 13], [13, 9], // C, fused at 8-9
      [12, 14], [14, 15], [15, 16], [16, 13], // D, fused at 12-13
      [16, 17], [17, 18], [18, 19], [19, 20], [20, 21], [21, 22], [22, 23], [23, 24], [24, 25], [25, 26], [26, 27],
    ];
    const edges: Edge[] = [];
    for (let k = 0; k < 1000; k++) for (const [a, b] of one) edges.push([a + 28 * k, b + 28 * k]);
    // (how much of the bonds' list it looks at, counted rather than timed: the
    // page some thousand times one molecule alone - 102 reads alone, 102 000
    // for the page, with room for another pass or two over the list. Each ring
    // system's bonds picked out of the whole list again, part by part, is 31
    // million; one search over the whole page reads every bond again for every
    // atom. A clock behind it, loose enough never to trip on a busy machine:
    // only what a search inside one ring system might come to costing)
    const alone = counted(one);
    smallestRings(28, alone.list);
    const seen = counted(edges);
    const started = performance.now();
    const rings = smallestRings(28 * 1000, seen.list);
    expect(performance.now() - started).toBeLessThan(20_000);
    expect(seen.reads()).toBeLessThan(3000 * alone.reads());
    expect(rings).toHaveLength(4000);
    // shortest first, then in the order of their atoms
    expect(rings.slice(0, 3).map((r) => r.length)).toEqual([5, 5, 5]);
    expect(rings[0].every((a) => a < 28)).toBe(true);
    expect(rings[1].every((a) => a >= 28 && a < 56)).toBe(true);
    expect(rings.slice(1000).every((r) => r.length === 6)).toBe(true);
  });
});

describe("ringsAlike", () => {
  /** The rings alike in size to the smallest set, each as its sorted atoms. */
  const alike = (n: number, edges: readonly Edge[]) => {
    const neighbours: number[][] = Array.from({ length: n }, () => []);
    for (const [a, b] of edges) {
      neighbours[a].push(b);
      neighbours[b].push(a);
    }
    return ringsAlike(smallestRings(n, edges), neighbours)
      .map((r) => [...r].sort((p, q) => p - q).join(","))
      .sort();
  };
  /** The same graph with its atoms numbered another way, back in the first numbering. */
  const renumbered = (n: number, edges: readonly Edge[], seed: number) => {
    const rnd = seeded(seed);
    const to = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [to[i], to[j]] = [to[j], to[i]];
    }
    const back = new Array<number>(n);
    to.forEach((t, i) => (back[t] = i));
    return alike(n, edges.map(([a, b]) => [to[a], to[b]] as const)).map((k) =>
      k.split(",").map((a) => back[Number(a)]).sort((p, q) => p - q).join(","),
    ).sort();
  };

  it("gives all three of quinuclidine's six-membered cycles, whatever the order of its atoms", () => {
    // N 0 and C4 3, bridged by 1-2, 4-5 and 6-7
    const edges: Edge[] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [6, 7], [7, 3]];
    expect(smallestRings(8, edges)).toHaveLength(2);
    const rings = alike(8, edges);
    expect(rings).toEqual(["0,1,2,3,4,5", "0,1,2,3,6,7", "0,3,4,5,6,7"]);
    for (let seed = 1; seed <= 20; seed++) expect(renumbered(8, edges, seed), `seed ${seed}`).toEqual(rings);
  });

  it("gives adamantane its four chairs and cubane its six faces", () => {
    // bridgeheads 0-3, each two of them bridged by one of 4-9
    const adamantane: Edge[] = [[0, 4], [4, 1], [0, 5], [5, 2], [0, 6], [6, 3], [1, 7], [7, 2], [1, 8], [8, 3], [2, 9], [9, 3]];
    expect(smallestRings(10, adamantane)).toHaveLength(3);
    expect(alike(10, adamantane)).toHaveLength(4);
    const cubane: Edge[] = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    expect(alike(8, cubane)).toHaveLength(6);
  });

  it("leaves out a cycle that shorter rings add up to: norbornane's six-membered one, naphthalene's ten", () => {
    // norbornane: C1 0 and C4 3, bridged by 1-2, 4-5 and C7 6
    const norbornane: Edge[] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [6, 3]];
    expect(alike(7, norbornane)).toEqual(["0,1,2,3,6", "0,3,4,5,6"]);
    const naphthalene: Edge[] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [5, 6], [6, 7], [7, 8], [8, 9], [9, 0]];
    expect(alike(10, naphthalene)).toHaveLength(2);
  });
});

/** `xs` read through a count of the times one of them is read by its place - how much of a list a function looks at. */
function counted<T>(xs: T[]): { list: T[]; reads: () => number } {
  let n = 0;
  const list = new Proxy(xs, {
    get(target, key, receiver) {
      if (typeof key === "string" && /^\d+$/.test(key)) n++;
      return Reflect.get(target, key, receiver);
    },
  });
  return { list, reads: () => n };
}
