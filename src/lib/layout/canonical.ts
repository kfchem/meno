/**
 * A molecule's atoms in an order of their own, whatever order they came
 * in: the same molecule drawn with its atoms in any order is laid out the
 * same (`layout2D` lays out this order and hands the drawing back in the
 * order given).
 *
 * Each atom is ranked by what it is - its element, charge, H count, bonds
 * and their orders - and the ranks refined by its neighbours' until they
 * part no further (Morgan's way); then by each stereocentre's configuration
 * and each double bond's cis or trans, read against its neighbours' ranks,
 * which tells apart atoms the bonds alone leave alike (diastereotopic
 * groups). Atoms still alike after that are alike in every way the layout
 * looks at - a tert-butyl's methyls, a phenyl's two ortho carbons - and one
 * of them is taken first; the order that gives is the same molecule
 * whichever is taken.
 */
import type { LayoutInput } from "./perceive";
import type { Layout2D } from "./engine";

/**
 * Each atom's place in the molecule's own order (old index to new). `way`
 * picks among the molecule's own orders: the walk from the lowest-ranked
 * end atom or the highest (1), each atom's neighbours taken lowest first or
 * highest (2) - each the same whatever order the atoms came in.
 */
export function canonicalOrder(input: LayoutInput, way = 0): number[] {
  return walkOrder(input, canonicalRanks(input), way);
}

const adjacency = (input: LayoutInput) => {
  const adj: { to: number; order: number }[][] = input.atoms.map(() => []);
  for (const b of input.bonds) {
    adj[b.a].push({ to: b.b, order: b.order });
    adj[b.b].push({ to: b.a, order: b.order });
  }
  return adj;
};

/**
 * Each atom's rank in the molecule, every atom alone (see `canonicalOrder`):
 * the same for the same molecule whatever order its atoms came in, and for
 * every one of its own orders (`walkOrder`), so worked out once for all.
 */
export function canonicalRanks(input: LayoutInput): number[] {
  const n = input.atoms.length;
  const adj = adjacency(input);
  // what each atom is
  const first = input.atoms.map((a, i) =>
    [a.el, a.charge ?? 0, a.hs ?? -1, adj[i].length, adj[i].map((e) => e.order).sort((p, q) => p - q).join("."), a.pi?.length ?? 0].join("|"),
  );
  let rank = ranksOf(first);
  const refine = (r: number[]): number[] => {
    for (;;) {
      const keys = r.map((v, i) =>
        [v, ...adj[i].map((e) => `${r[e.to]}:${e.order}`).sort()].join(","),
      );
      const next = ranksOf(keys.map((k, i) => `${String(r[i]).padStart(6, "0")}/${k}`));
      if (classes(next) === classes(r)) return next;
      r = next;
    }
  };
  // and how each stereocentre and double bond is set, against its
  // neighbours' ranks (each a sign, or 0 where those ranks do not part)
  const stereoAt: (typeof input.bonds)[number][][] = input.atoms.map(() => []);
  for (const b of input.bonds) {
    if (!b.stereo) continue;
    stereoAt[b.a].push(b);
    stereoAt[b.b].push(b);
  }
  const stereoKeys = (r: number[]): string[] =>
    input.atoms.map((a, i) => {
      const parts: number[] = [];
      if (a.tetra) {
        const ns = a.tetra.neighbours.map((m) => (m < 0 ? -1 : r[m]));
        parts.push(new Set(ns).size === ns.length ? a.tetra.volume * parity(ns) : 0);
      }
      for (const b of stereoAt[i]) {
        const [p, q] = b.stereo!.refs;
        // (each end's other neighbour too, the ref compared with it)
        const end = (at: number, ref: number) => {
          const others = adj[at].filter((e) => e.to !== (at === b.a ? b.b : b.a)).map((e) => e.to);
          return others.length < 2 ? 1 : Math.sign(r[ref] - r[others.find((o) => o !== ref)!]) || 0;
        };
        parts.push((b.stereo!.cis ? 1 : -1) * end(b.a, p) * end(b.b, q));
      }
      return parts.join(",");
    });
  const withStereo = (r: number[]): number[] => {
    for (;;) {
      const keys = stereoKeys(r);
      const next = refine(ranksOf(r.map((v, i) => `${String(v).padStart(6, "0")}/${keys[i]}`)));
      if (classes(next) === classes(r)) return next;
      r = next;
    }
  };
  rank = withStereo(refine(rank));
  // Atoms still alike: each of the lowest such class taken first in turn,
  // the ranks refined again, and so on until every atom stands alone; of
  // the orders that gives, the one that writes the molecule first (its
  // atoms and bonds, by their places, the least). Ranks alone can leave
  // atoms alike that are not - cuneane's, basketane's - and which of them
  // went first decided the order. Two orders that write the molecule the
  // same show a symmetry of it, and the atoms it takes onto each other are
  // not tried again: a tert-butyl's three methyls, alike in every way, are
  // tried once.
  return settled(rank, n, withStereo, (r) => written(input, first, r));
}

/** The molecule's own order `way` (old index to new) from its ranks (`canonicalRanks`). */
export function walkOrder(input: LayoutInput, rank: readonly number[], way = 0): number[] {
  const n = input.atoms.length;
  const adj = adjacency(input);
  // the atoms in the order a walk through the molecule meets them, as a
  // SMILES string writes them - from an end atom, the lowest ranked, each
  // atom's neighbours in rank order - not grouped by rank: the layout's
  // choices between equals were made on such orders, and read worse on
  // the ranks themselves
  const order: number[] = [];
  const seen = new Array<boolean>(n).fill(false);
  const walk = (start: number) => {
    const stack = [start];
    while (stack.length) {
      const a = stack.pop()!;
      if (seen[a]) continue;
      seen[a] = true;
      order.push(a);
      const next = adj[a].map((e) => e.to).filter((b) => !seen[b]).sort((p, q) => (way & 2 ? rank[p] - rank[q] : rank[q] - rank[p]));
      stack.push(...next);
    }
  };
  for (;;) {
    let fewest = Infinity;
    let start = -1;
    for (let i = 0; i < n; i++) {
      if (seen[i]) continue;
      const d = adj[i].length;
      const better = way & 1 ? rank[i] > rank[start] : rank[i] < rank[start];
      if (d < fewest || (d === fewest && better)) [fewest, start] = [d, i];
    }
    if (start < 0) break;
    walk(start);
  }
  const to = new Array<number>(n);
  order.forEach((a, k) => (to[a] = k));
  return to;
}

/**
 * The most search steps `settled` takes for a molecule of `n` atoms; past
 * them, the least order found so far. (Members of a class are tried in the
 * input's order, so a molecule that runs out of steps - very large and
 * very symmetric, more than a dozen alike groups that are not alike in
 * every way - can again come out by the order of its atoms.)
 */
const settleBudget = (n: number) => 200 + 20 * n;

/**
 * Ranks refined to one atom each by taking alike atoms first in turn (see
 * `canonicalOrder`): the order that writes the molecule least.
 */
function settled(start: number[], n: number, refined: (r: number[]) => number[], writes: (r: number[]) => string): number[] {
  let budget = settleBudget(n);
  type Leaf = { text: string; r: number[]; symmetries: number[][] };
  const search = (r: number[]): Leaf => {
    if (classes(r) === n) return { text: writes(r), r, symmetries: [] };
    const counts = new Map<number, number>();
    for (const v of r) counts.set(v, (counts.get(v) ?? 0) + 1);
    const cell = Math.min(...[...counts].filter(([, c]) => c > 1).map(([v]) => v));
    // (the atoms any symmetry found here takes onto each other, as one)
    const root = r.map((_, i) => i);
    const find = (a: number): number => (root[a] === a ? a : (root[a] = find(root[a])));
    const join = (g: readonly number[]) => g.forEach((b, a) => (root[find(a)] = find(b)));
    let best: Leaf | null = null;
    const tried: number[] = [];
    const symmetries: number[][] = [];
    for (let m = 0; m < n; m++) {
      if (r[m] !== cell || tried.some((t) => find(t) === find(m))) continue;
      if (best && budget <= 0) break;
      budget--;
      const leaf = search(refined(ranksOf(r.map((v, i) => `${String(v).padStart(6, "0")}/${i === m ? 0 : 1}`))));
      tried.push(m);
      for (const g of leaf.symmetries) {
        symmetries.push(g);
        join(g);
      }
      if (!best || leaf.text < best.text) best = leaf;
      else if (leaf.text === best.text) {
        // (each atom where the other order puts the atom in its place)
        const at = new Array<number>(n);
        leaf.r.forEach((p, a) => (at[p] = a));
        const g = best.r.map((p) => at[p]);
        symmetries.push(g);
        join(g);
      }
    }
    return { text: best!.text, r: best!.r, symmetries };
  };
  return search(start).r;
}

/**
 * The molecule written by its atoms' places (`r`, each atom alone): each
 * place's atom - what it is, how a stereocentre there is set - and the
 * bonds between places, with a double bond's cis or trans; the same text
 * for two orders only where they are the same molecule the same way.
 */
function written(input: LayoutInput, what: readonly string[], r: readonly number[]): string {
  const at = new Array<number>(r.length);
  r.forEach((p, a) => (at[p] = a));
  const pad = (v: number) => String(v).padStart(6, "0");
  const atoms = at.map((a) => {
    const t = input.atoms[a].tetra;
    return t ? `${what[a]}@${t.volume * parity(t.neighbours.map((m) => (m < 0 ? Infinity : r[m])))}` : what[a];
  });
  const bonds = input.bonds
    .map((b) => {
      const [p, q] = r[b.a] < r[b.b] ? [b.a, b.b] : [b.b, b.a];
      const st = b.stereo ? `:${b.stereo.cis ? "c" : "t"}${pad(r[b.stereo.refs[p === b.a ? 0 : 1]])}${pad(r[b.stereo.refs[p === b.a ? 1 : 0]])}` : "";
      return `${pad(r[p])}${pad(r[q])}:${b.order}${st}`;
    })
    .sort();
  return `${atoms.join(";")}|${bonds.join(" ")}`;
}

/** The input with its atoms in the given order (old index to new), its bonds sorted by their atoms there. */
export function reordered(input: LayoutInput, to: readonly number[]): LayoutInput {
  const from = new Array<number>(to.length);
  to.forEach((t, o) => (from[t] = o));
  const atoms = from.map((o) => {
    const a = input.atoms[o];
    return {
      ...a,
      ...(a.tetra ? { tetra: inOrder(a.tetra.neighbours.map((m) => (m < 0 ? m : to[m])), a.tetra.volume) } : {}),
      ...(a.pi ? { pi: a.pi.map((m) => to[m]) } : {}),
    };
  });
  const bonds = input.bonds
    .map((b) => {
      const [a, c] = [to[b.a], to[b.b]];
      const stereo = b.stereo && { ...b.stereo, refs: [to[b.stereo.refs[0]], to[b.stereo.refs[1]]] as [number, number] };
      // (its ends lower first, a double bond's refs kept with their ends)
      if (a <= c) return { ...b, a, b: c, ...(stereo ? { stereo } : {}) };
      return { ...b, a: c, b: a, ...(stereo ? { stereo: { ...stereo, refs: [stereo.refs[1], stereo.refs[0]] as [number, number] } } : {}) };
    })
    .sort((p, q) => p.a - q.a || p.b - q.b);
  const axes = input.axes?.map((x) => ({ ...x, atoms: [to[x.atoms[0]], to[x.atoms[1]]] as const, refs: [to[x.refs[0]], to[x.refs[1]]] as const }));
  return { atoms, bonds, ...(axes ? { axes } : {}) };
}

/** A drawing of the reordered input handed back in the order of the input itself (`to`: old index to new). */
export function restored(out: Layout2D, to: readonly number[]): Layout2D {
  const back = new Array<number>(to.length);
  to.forEach((t, o) => (back[t] = o));
  const atom = (m: number) => (m < 0 ? m : back[m]);
  const pair = ([a, b]: [number, number]): [number, number] => [atom(a), atom(b)];
  return {
    ...out,
    x: to.map((t) => out.x[t]),
    y: to.map((t) => out.y[t]),
    depth: to.map((t) => out.depth[t]),
    solid: to.map((t) => out.solid[t]),
    bold: out.bold.map(pair),
    toward: out.toward.map(pair),
    dashed: out.dashed.map(pair),
    wedges: out.wedges.map((w) => ({ ...w, from: atom(w.from), to: atom(w.to) })),
    // (each place its own: a drawing kept by layout2D is handed out again)
    hydrogens: out.hydrogens.map((h) => ({ ...h, at: { ...h.at }, on: atom(h.on) })),
  };
}

/**
 * A centre's neighbours in their order, its implicit H last, and the volume
 * that says the same configuration of them: a centre written with its
 * neighbours in another order is the same centre, and laid out the same.
 */
function inOrder(neighbours: readonly number[], volume: 1 | -1): { neighbours: number[]; volume: 1 | -1 } {
  const sorted = [...neighbours].sort((p, q) => (p < 0 ? 1 : q < 0 ? -1 : p - q));
  // (the sign of the permutation taking one order to the other)
  const key = (n: number) => (n < 0 ? Infinity : n);
  return { neighbours: sorted, volume: (volume * parity(neighbours.map(key))) as 1 | -1 };
}

/** Each key's rank among the distinct keys, in sorted order. */
function ranksOf(keys: readonly string[]): number[] {
  const distinct = [...new Set(keys)].sort();
  const at = new Map(distinct.map((k, i) => [k, i]));
  return keys.map((k) => at.get(k)!);
}

const classes = (r: readonly number[]) => new Set(r).size;

/** The sign of the permutation that sorts `xs` (distinct) ascending. */
function parity(xs: readonly number[]): 1 | -1 {
  let sign: 1 | -1 = 1;
  const a = [...xs];
  for (let i = 0; i < a.length; i++)
    for (let j = i + 1; j < a.length; j++) if (a[i] > a[j]) sign = sign === 1 ? -1 : 1;
  return sign;
}
