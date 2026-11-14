/**
 * The rings of a molecule's graph: the smallest set of smallest rings is the core's now (lib/chem/perception/rings); this module keeps what
 * is the layout's own - the cycles beyond a smallest set - and names the core's again where the layout asks for rings.
 */
export { smallestRings, type Edge } from "../chem/perception/rings";

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
