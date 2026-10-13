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

/** Each atom's place in the molecule's own order (old index to new). */
export function canonicalOrder(input: LayoutInput): number[] {
  const n = input.atoms.length;
  const adj: { to: number; order: number }[][] = input.atoms.map(() => []);
  for (const b of input.bonds) {
    adj[b.a].push({ to: b.b, order: b.order });
    adj[b.b].push({ to: b.a, order: b.order });
  }
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
  const stereoKeys = (r: number[]): string[] =>
    input.atoms.map((a, i) => {
      const parts: number[] = [];
      if (a.tetra) {
        const ns = a.tetra.neighbours.map((m) => (m < 0 ? -1 : r[m]));
        parts.push(new Set(ns).size === ns.length ? a.tetra.volume * parity(ns) : 0);
      }
      for (const b of input.bonds) {
        if (!b.stereo || (b.a !== i && b.b !== i)) continue;
        const [p, q] = b.stereo.refs;
        // (each end's other neighbour too, the ref compared with it)
        const end = (at: number, ref: number) => {
          const others = adj[at].filter((e) => e.to !== (at === b.a ? b.b : b.a)).map((e) => e.to);
          return others.length < 2 ? 1 : Math.sign(r[ref] - r[others.find((o) => o !== ref)!]) || 0;
        };
        parts.push((b.stereo.cis ? 1 : -1) * end(b.a, p) * end(b.b, q));
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
  // atoms still alike: the first of the lowest such rank taken first
  while (classes(rank) < n) {
    const counts = new Map<number, number>();
    for (const v of rank) counts.set(v, (counts.get(v) ?? 0) + 1);
    const tied = Math.min(...[...counts].filter(([, c]) => c > 1).map(([v]) => v));
    const pick = rank.indexOf(tied);
    rank = withStereo(refine(ranksOf(rank.map((v, i) => `${String(v).padStart(6, "0")}/${i === pick ? 0 : 1}`))));
  }
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
      const next = adj[a].map((e) => e.to).filter((b) => !seen[b]).sort((p, q) => rank[q] - rank[p]);
      stack.push(...next);
    }
  };
  for (;;) {
    const left = rank.map((_, i) => i).filter((i) => !seen[i]);
    if (!left.length) break;
    const ends = left.filter((i) => adj[i].length === Math.min(...left.map((j) => adj[j].length)));
    walk(ends.reduce((p, q) => (rank[q] < rank[p] ? q : p)));
  }
  const to = new Array<number>(n);
  order.forEach((a, k) => (to[a] = k));
  return to;
}

/** The input with its atoms in the given order (old index to new), its bonds sorted by their atoms there. */
export function reordered(input: LayoutInput, to: readonly number[]): LayoutInput {
  const from = new Array<number>(to.length);
  to.forEach((t, o) => (from[t] = o));
  const atoms = from.map((o) => {
    const a = input.atoms[o];
    return {
      ...a,
      ...(a.tetra ? { tetra: { neighbours: a.tetra.neighbours.map((m) => (m < 0 ? m : to[m])), volume: a.tetra.volume } } : {}),
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
    hydrogens: out.hydrogens.map((h) => ({ ...h, on: atom(h.on) })),
  };
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
