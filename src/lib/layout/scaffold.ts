/**
 * What a series of analogues shares, for lining them up (many.ts): a core
 * given by what made them, found in each by matching it atom for atom; or,
 * where none is given, each structure's ring scaffold - its rings and the
 * chains that join them, every other atom taken off - the same in those
 * that share it.
 */
import { aromaticForm } from "../chem/identity";
import { canonicalRanks, canonicalText } from "./canonical";
import { perceive, type LayoutInput } from "./perceive";

/**
 * The atoms of `input`'s ring scaffold: its rings and the chains between
 * them, with every atom off them taken away one end at a time - a chain's
 * end, an =O on a ring, a group on a chain - until none is left that is not
 * in a ring or between two. None where it has no ring.
 */
export function ringScaffold(input: LayoutInput): number[] {
  const n = input.atoms.length;
  const { rings } = perceive(input);
  const inRing = new Array<boolean>(n).fill(false);
  for (const r of rings) for (const a of r) inRing[a] = true;
  if (!inRing.some(Boolean)) return [];
  const degree = new Array<number>(n).fill(0);
  const near: number[][] = input.atoms.map(() => []);
  for (const b of input.bonds) {
    degree[b.a]++;
    degree[b.b]++;
    near[b.a].push(b.b);
    near[b.b].push(b.a);
  }
  const gone = new Array<boolean>(n).fill(false);
  const ends = [...Array(n).keys()].filter((i) => !inRing[i] && degree[i] <= 1);
  while (ends.length) {
    const i = ends.pop()!;
    if (gone[i]) continue;
    gone[i] = true;
    for (const j of near[i]) {
      if (gone[j]) continue;
      degree[j]--;
      if (!inRing[j] && degree[j] <= 1) ends.push(j);
    }
  }
  // (of a structure in several pieces, every piece's rings: each piece its own scaffold, kept together)
  return [...Array(n).keys()].filter((i) => !gone[i]);
}

/**
 * The part of `input` made of `atoms` alone, as a graph: their elements and
 * the bonds between them, each in the form every Kekulé structure of it
 * shares (chem/identity `aromaticForm`) - no H, no charge, no
 * configuration. What two cores or scaffolds are compared by.
 */
export function bareGraph(input: LayoutInput, atoms: readonly number[]): LayoutInput {
  const aro = aromaticForm(input);
  const index = new Map(atoms.map((a, k) => [a, k]));
  return {
    atoms: atoms.map((a) => ({ el: input.atoms[a].el, hs: 0 })),
    bonds: aro.bonds.flatMap((b) => (index.has(b.a) && index.has(b.b) ? [{ a: index.get(b.a)!, b: index.get(b.b)!, order: b.order }] : [])),
  };
}

/** A bare graph written in its own order: the same text for the same graph. */
export function graphText(graph: LayoutInput): string {
  return canonicalText(graph);
}

/**
 * The atoms of `b` matching those of `a` one for one, where the two bare
 * graphs are the same graph: for each atom of `a`, its atom in `b`, by
 * their canonical ranks (canonical.ts) - an isomorphism, the same one
 * however either's atoms come. Null where they are not the same graph.
 */
export function matchedByRank(a: LayoutInput, b: LayoutInput): number[] | null {
  if (a.atoms.length !== b.atoms.length || graphText(a) !== graphText(b)) return null;
  const ra = canonicalRanks(a);
  const byRank = new Map(canonicalRanks(b).map((r, i) => [r, i]));
  return ra.map((r) => byRank.get(r)!);
}

/**
 * Each way `core`'s atoms are found in `input`, at most `most` of them: for
 * each atom of the core, its atom in the structure - the same element, and
 * every bond between core atoms there between their atoms, of the same
 * order (each in its aromatic form) and no other. The structure's atoms may
 * carry more bonds, out to what is not the core: its groups. Searched atom
 * by atom along the core's bonds, the most bonded first.
 */
export function coreMatches(core: LayoutInput, input: LayoutInput, most = 24): number[][] {
  const c = bareGraph(core, [...core.atoms.keys()]);
  const m = bareGraph(input, [...input.atoms.keys()]);
  const nc = c.atoms.length;
  const nm = m.atoms.length;
  if (!nc || nc > nm) return [];
  const order = (g: LayoutInput) => {
    const map = new Map<string, number>();
    const near: number[][] = g.atoms.map(() => []);
    for (const b of g.bonds) {
      map.set(`${Math.min(b.a, b.b)},${Math.max(b.a, b.b)}`, b.order);
      near[b.a].push(b.b);
      near[b.b].push(b.a);
    }
    return { bond: (p: number, q: number) => map.get(`${Math.min(p, q)},${Math.max(p, q)}`), near };
  };
  const C = order(c);
  const M = order(m);
  // (the core's atoms in an order that keeps each next to one already placed, where it can)
  const seq: number[] = [];
  const placed = new Array<boolean>(nc).fill(false);
  while (seq.length < nc) {
    const start = [...Array(nc).keys()].filter((i) => !placed[i]).sort((p, q) => C.near[q].length - C.near[p].length)[0];
    const queue = [start];
    placed[start] = true;
    while (queue.length) {
      const v = queue.shift()!;
      seq.push(v);
      for (const w of C.near[v].slice().sort((p, q) => C.near[q].length - C.near[p].length))
        if (!placed[w]) {
          placed[w] = true;
          queue.push(w);
        }
    }
  }
  const found: number[][] = [];
  const to = new Array<number>(nc).fill(-1);
  const used = new Array<boolean>(nm).fill(false);
  const step = (k: number) => {
    if (found.length >= most) return;
    if (k === nc) {
      found.push(to.slice());
      return;
    }
    const v = seq[k];
    // (beside an atom placed already, where it has one: only that atom's neighbours to try)
    const anchor = C.near[v].find((w) => to[w] >= 0);
    const tries = anchor != null ? M.near[to[anchor]] : [...Array(nm).keys()];
    for (const u of tries) {
      if (used[u] || m.atoms[u].el !== c.atoms[v].el || M.near[u].length < C.near[v].length) continue;
      let ok = true;
      for (let j = 0; j < k && ok; j++) {
        const w = seq[j];
        const want = C.bond(v, w);
        const have = M.bond(u, to[w]);
        if (want !== have) ok = false;
      }
      if (!ok) continue;
      to[v] = u;
      used[u] = true;
      step(k + 1);
      to[v] = -1;
      used[u] = false;
      if (found.length >= most) return;
    }
  };
  step(0);
  return found;
}
