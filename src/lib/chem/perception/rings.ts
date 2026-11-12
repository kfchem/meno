/**
 * The rings of a molecule's graph: the smallest set of smallest rings, as
 * many as the graph has independent cycles, each as small as it can be.
 *
 * Candidates are Horton's - for every atom and every bond, the shortest path
 * from the atom to each end of the bond, closed by the bond - taken shortest
 * first, and kept when they are independent of those already kept (over
 * GF(2), a ring being the set of its bonds). Every cage and bridged system
 * gets its faces this way, which the shortest cycle through each bond alone
 * does not always give.
 *
 * Each ring lies within one part of the graph that no single bond cuts in
 * two - a ring system, with the chains and other systems hanging off it left
 * out - and the shortest paths between its atoms stay inside it, so each
 * such part is worked out on its own: a drawing of a thousand molecules
 * costs a thousand small searches, not one the size of the whole page. The
 * rings come out exactly as a search over the whole graph would give them,
 * and in the same order.
 */

import type { ChemGraph } from "./graph";

export type Edge = readonly [number, number];

/** A ring kept, with the atom and bond (global indices) it was first found from. */
type Found = { ring: number[]; v: number; e: number };

/** Rings as atom indices in order round the ring. */
export function smallestRings(atomCount: number, edges: readonly Edge[]): number[][] {
  const found: Found[] = [];
  for (const part of ringParts(atomCount, edges)) {
    const local = new Map<number, number>();
    part.atoms.forEach((a, i) => local.set(a, i));
    const kept = ringsOfPart(
      part.atoms.length,
      part.edges.map((e) => [local.get(edges[e][0])!, local.get(edges[e][1])!] as const),
    );
    for (const k of kept) {
      found.push({ ring: k.ring.map((a) => part.atoms[a]), v: part.atoms[k.v], e: part.edges[k.e] });
    }
  }
  // shortest first; between rings as long, in the order the whole graph's
  // search would have come to them - by atom, then by bond
  found.sort((a, b) => a.ring.length - b.ring.length || a.v - b.v || a.e - b.e);
  return found.map((f) => f.ring);
}

/**
 * The parts of the graph that can hold a ring: its atoms and bonds joined by
 * bonds no one of which would cut it in two (bonds that are not bridges),
 * each part's atoms and bonds in their order in the whole graph.
 */
export function ringParts(n: number, edges: readonly Edge[]): { atoms: number[]; edges: number[] }[] {
  const adj: { to: number; edge: number }[][] = Array.from({ length: n }, () => []);
  edges.forEach(([a, b], e) => {
    adj[a].push({ to: b, edge: e });
    if (a !== b) adj[b].push({ to: a, edge: e });
  });
  // the bridges: depth first (Tarjan), without recursion - a long chain
  // would overflow the stack
  const order = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const bridge = new Uint8Array(edges.length);
  let t = 0;
  const stack: { at: number; via: number; next: number }[] = [];
  for (let s = 0; s < n; s++) {
    if (order[s] >= 0) continue;
    order[s] = low[s] = t++;
    stack.push({ at: s, via: -1, next: 0 });
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top.next < adj[top.at].length) {
        const { to, edge } = adj[top.at][top.next++];
        if (edge === top.via) continue;
        if (order[to] < 0) {
          order[to] = low[to] = t++;
          stack.push({ at: to, via: edge, next: 0 });
        } else low[top.at] = Math.min(low[top.at], order[to]);
      } else {
        stack.pop();
        if (stack.length) {
          const up = stack[stack.length - 1].at;
          low[up] = Math.min(low[up], low[top.at]);
          if (low[top.at] > order[up]) bridge[top.via] = 1;
        }
      }
    }
  }
  // the pieces left when the bridges are taken out, those with a bond
  const partOf = new Int32Array(n).fill(-1);
  const parts: { atoms: number[]; edges: number[] }[] = [];
  for (let s = 0; s < n; s++) {
    if (partOf[s] >= 0 || !adj[s].some(({ edge }) => !bridge[edge])) continue;
    const p = parts.length;
    parts.push({ atoms: [], edges: [] });
    partOf[s] = p;
    const todo = [s];
    while (todo.length) {
      for (const { to, edge } of adj[todo.pop()!]) {
        if (!bridge[edge] && partOf[to] < 0) {
          partOf[to] = p;
          todo.push(to);
        }
      }
    }
  }
  for (let a = 0; a < n; a++) if (partOf[a] >= 0) parts[partOf[a]].atoms.push(a);
  edges.forEach(([a], e) => {
    if (!bridge[e]) parts[partOf[a]].edges.push(e);
  });
  return parts;
}

/** The rings of one connected part, by its own indices, each with what it was first found from. */
function ringsOfPart(n: number, edges: readonly Edge[]): Found[] {
  const adj: { to: number; edge: number }[][] = Array.from({ length: n }, () => []);
  edges.forEach(([a, b], e) => {
    adj[a].push({ to: b, edge: e });
    adj[b].push({ to: a, edge: e });
  });

  // how many independent cycles: bonds - atoms + 1 (it is in one piece)
  const want = edges.length - n + 1;
  if (want <= 0) return [];

  // shortest paths from every atom (breadth first), as parents
  const parent: Int32Array[] = [];
  const dist: Int32Array[] = [];
  for (let s = 0; s < n; s++) {
    const p = new Int32Array(n).fill(-1);
    const d = new Int32Array(n).fill(-1);
    d[s] = 0;
    const q = [s];
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      for (const { to } of adj[u]) {
        if (d[to] < 0) {
          d[to] = d[u] + 1;
          p[to] = u;
          q.push(to);
        }
      }
    }
    parent.push(p);
    dist.push(d);
  }
  const path = (s: number, t: number): number[] => {
    const out = [t];
    let u = t;
    while (u !== s) {
      u = parent[s][u];
      out.push(u);
    }
    return out.reverse(); // s ... t
  };

  // Horton's candidates: atom v, bond (x, y), paths v..x and v..y meeting only at v
  const candidates = new Map<string, Found>();
  for (let v = 0; v < n; v++) {
    edges.forEach(([x, y], e) => {
      if (dist[v][x] < 0 || dist[v][y] < 0) return;
      if (Math.abs(dist[v][x] - dist[v][y]) > 1) return;
      const px = path(v, x);
      const py = path(v, y);
      const inX = new Set(px);
      if (py.some((a, i) => i > 0 && inX.has(a))) return; // they meet again
      const ring = [...px, ...py.slice(1).reverse()]; // v .. x, y .. back
      if (ring.length < 3) return;
      const key = [...ring].sort((a, b) => a - b).join(",");
      if (!candidates.has(key)) candidates.set(key, { ring, v, e });
    });
  }

  // shortest first, kept while independent of those kept (GF(2) elimination)
  const edgeIndex = new Map<string, number>();
  edges.forEach(([a, b], e) => edgeIndex.set(a < b ? `${a},${b}` : `${b},${a}`, e));
  const words = Math.ceil(edges.length / 32);
  const vectorOf = (ring: number[]) => {
    const v = new Uint32Array(words);
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length];
      const e = edgeIndex.get(a < b ? `${a},${b}` : `${b},${a}`)!;
      v[e >>> 5] ^= 1 << (e & 31);
    });
    return v;
  };
  const basis: { pivot: number; v: Uint32Array }[] = [];
  const kept: Found[] = [];
  const sorted = [...candidates.values()].sort((a, b) => a.ring.length - b.ring.length);
  for (const c of sorted) {
    const v = vectorOf(c.ring);
    for (const { pivot, v: b } of basis) {
      if (v[pivot >>> 5] & (1 << (pivot & 31))) {
        for (let w = 0; w < words; w++) v[w] ^= b[w];
      }
    }
    let pivot = -1;
    for (let w = 0; w < words && pivot < 0; w++) {
      if (v[w]) pivot = w * 32 + (31 - Math.clz32(v[w] & -v[w]));
    }
    if (pivot < 0) continue; // a sum of rings already kept
    basis.push({ pivot, v });
    kept.push(c);
    if (kept.length === want) break;
  }
  return kept;
}


/** A ring: its atoms in order round it. */
export type Ring = readonly number[];

const pairKey = (a: number, b: number): string => (a < b ? `${a},${b}` : `${b},${a}`);

/** A ring's bonds, each by its atoms. */
const ringEdges = (r: Ring): Set<string> => new Set(r.map((x, k) => pairKey(x, r[(k + 1) % r.length])));

/** What two rings have in common: how many atoms, and how many bonds. */
export function shared(r: Ring, s: Ring): { atoms: number; bonds: number } {
  const inS = new Set(s);
  const edges = ringEdges(s);
  let bonds = 0;
  for (const e of ringEdges(r)) if (edges.has(e)) bonds++;
  return { atoms: r.filter((a) => inS.has(a)).length, bonds };
}

/** Two rings sharing one atom and no bond: spiro. */
export const spiro = (r: Ring, s: Ring): boolean => {
  const c = shared(r, s);
  return c.atoms === 1 && c.bonds === 0;
};

/** Two rings sharing one bond: fused. */
export const fused = (r: Ring, s: Ring): boolean => shared(r, s).bonds === 1;

/** Bridged, as three or more atoms in common: the bridge rings of a norbornane share three. */
export const sharesThreeAtoms = (r: Ring, s: Ring): boolean => shared(r, s).atoms >= 3;

/** Bridged, as more than one bond shared with a ring no larger: whether `r` is held in its shape by `s` (conformersSought's question: can it flip). Against a larger ring, more than one bond is no bridge but the way round it. */
export const sharesMoreThanABond = (r: Ring, s: Ring): boolean => s.length <= r.length && shared(r, s).bonds > 1;

/**
 * The rings of a set grouped into ring systems: rings sharing an atom, merged. Each system's rings by their index and its atoms, in the order
 * the rings come and the atoms in them (once each); the systems in the order of their first ring.
 */
export function ringSystemsOf(n: number, rings: readonly Ring[]): { atoms: number[]; rings: number[] }[] {
  const at: number[][] = Array.from({ length: n }, () => []);
  rings.forEach((r, i) => r.forEach((a) => at[a].push(i)));
  const group = rings.map((_, i) => i);
  const find = (i: number): number => (group[i] === i ? i : (group[i] = find(group[i])));
  for (let a = 0; a < n; a++) {
    const rs = at[a];
    for (let i = 1; i < rs.length; i++) group[find(rs[i])] = find(rs[0]);
  }
  const by = new Map<number, { atoms: number[]; rings: number[] }>();
  rings.forEach((r, i) => {
    const g = find(i);
    const sys = by.get(g) ?? { atoms: [], rings: [] };
    sys.rings.push(i);
    for (const a of r) if (!sys.atoms.includes(a)) sys.atoms.push(a);
    by.set(g, sys);
  });
  return [...by.values()];
}

/** The rings of a set grouped where they share a bond - a naphthalene's two, an azulene's - each group's rings by their index, in the order of its first ring. */
export function fusedSetsOf(rings: readonly Ring[]): number[][] {
  const edges = rings.map(ringEdges);
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
  const by = new Map<number, number[]>();
  rings.forEach((_, i) => by.set(find(i), [...(by.get(find(i)) ?? []), i]));
  return [...by.values()];
}

/**
 * A graph's bonds as the rings are found from them: each distinct pair of atoms once, the lower atom first, in the order of the graph's first bond
 * between them; a bond to itself, or to an atom the graph does not have, is none.
 */
export function distinctEdges(g: Pick<ChemGraph, "atoms" | "bonds">): { edges: Edge[]; bond: number[] } {
  const n = g.atoms.length;
  const seen = new Set<string>();
  const edges: Edge[] = [];
  const bond: number[] = [];
  g.bonds.forEach(({ a, b }, i) => {
    if (a === b || a < 0 || b < 0 || a >= n || b >= n) return;
    const k = pairKey(a, b);
    if (seen.has(k)) return;
    seen.add(k);
    edges.push(a < b ? [a, b] : [b, a]);
    bond.push(i);
  });
  return { edges, bond };
}
