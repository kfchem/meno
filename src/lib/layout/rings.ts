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
function ringParts(n: number, edges: readonly Edge[]): { atoms: number[]; edges: number[] }[] {
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

/**
 * Every ring among `rings` (a smallest set, or part of one: a ring system's)
 * and every other cycle through their atoms that no sum of shorter rings
 * gives - each cycle as small as a ring of a smallest set can be, up to the
 * longest of `rings`. Where more than one set is as small, which of them
 * `smallestRings` keeps goes by the order the atoms come in: quinuclidine
 * has three six-membered cycles and any two are a smallest set. These are
 * all three, in any order (each from its lowest atom, toward the lower of
 * that atom's two neighbours in it).
 */
export function ringsAlike(rings: readonly (readonly number[])[], neighbours: readonly (readonly number[])[]): number[][] {
  if (!rings.length) return [];
  const atoms = new Set(rings.flat());
  const longest = Math.max(...rings.map((r) => r.length));
  // each cycle by its bonds, over GF(2)
  const bondIndex = new Map<string, number>();
  const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
  for (const a of atoms) for (const b of neighbours[a]) if (atoms.has(b) && !bondIndex.has(key(a, b))) bondIndex.set(key(a, b), bondIndex.size);
  const words = Math.ceil(bondIndex.size / 32);
  const vectorOf = (ring: readonly number[]) => {
    const v = new Uint32Array(words);
    ring.forEach((a, i) => {
      const e = bondIndex.get(key(a, ring[(i + 1) % ring.length]))!;
      v[e >>> 5] ^= 1 << (e & 31);
    });
    return v;
  };
  // (reduced against the rings shorter than it: nothing left, a sum of them)
  const reduce = (v: Uint32Array, basis: readonly { pivot: number; v: Uint32Array }[]) => {
    for (const { pivot, v: b } of basis) {
      if (v[pivot >>> 5] & (1 << (pivot & 31))) for (let w = 0; w < words; w++) v[w] ^= b[w];
    }
    for (let w = 0; w < words; w++) if (v[w]) return w * 32 + (31 - Math.clz32(v[w] & -v[w]));
    return -1;
  };
  // every simple cycle of up to `longest` atoms, each once
  const cycles: number[][] = [];
  const path: number[] = [];
  const on = new Set<number>();
  const walk = (start: number, at: number) => {
    for (const b of neighbours[at]) {
      if (!atoms.has(b) || b < start) continue;
      if (b === start) {
        if (path.length >= 3 && path[1] < path[path.length - 1]) cycles.push([...path]);
        continue;
      }
      if (on.has(b) || path.length >= longest) continue;
      path.push(b);
      on.add(b);
      walk(start, b);
      path.pop();
      on.delete(b);
    }
  };
  for (const s of [...atoms].sort((p, q) => p - q)) {
    path.push(s);
    on.add(s);
    walk(s, s);
    path.pop();
    on.delete(s);
  }
  // kept where the given rings shorter than it do not add up to it
  const byLength = [...rings].sort((p, q) => p.length - q.length);
  const out: number[][] = [];
  for (const cycle of cycles.sort((p, q) => p.length - q.length)) {
    const basis: { pivot: number; v: Uint32Array }[] = [];
    for (const r of byLength) {
      if (r.length >= cycle.length) break;
      const v = vectorOf(r);
      const pivot = reduce(v, basis);
      if (pivot >= 0) basis.push({ pivot, v });
    }
    if (reduce(vectorOf(cycle), basis) >= 0) out.push(cycle);
  }
  return out;
}
