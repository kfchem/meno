/**
 * A molecule's atoms in an order of their own, whatever order they came
 * in: the same molecule drawn with its atoms in any order is laid out the
 * same (`layout2D` lays out this order and hands the drawing back in the
 * order given).
 *
 * The atoms' ranks are the core's (perception/symmetry: the one refinement
 * and search, which tell apart every atom that differs - a stereocentre's
 * configuration and a double bond's cis or trans among what it reads);
 * atoms still alike after that are alike in every way the layout looks at -
 * a tert-butyl's methyls, a phenyl's two ortho carbons - and one of them is
 * taken first; the order that gives is the same molecule whichever is
 * taken. This file keeps the layout's own: the walk through the molecule
 * in rank order, and the input put in that order and the drawing back.
 */
import type { LayoutInput } from "./perceive";
import type { Layout2D } from "./engine";
import { parity } from "../chem/perception/stereo/geometry";
import { canonicalRanks } from "../chem/perception/symmetry";

// (the ranks, classes, orbits and texts are the core's - perception/symmetry - named here too, so that no import of them changes)
export { canonicalRanks, canonicalSearched, canonicalText, canonicalWritten, symmetryClasses, symmetryOrbits } from "../chem/perception/symmetry";

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
  const cumulated = input.cumulated?.map((x) => ({ ...x, atoms: [to[x.atoms[0]], to[x.atoms[1]]] as const, refs: [to[x.refs[0]], to[x.refs[1]]] as const }));
  const arrangements = input.arrangements?.map((x) => ({ metal: to[x.metal], pairs: x.pairs.map(([p, q]) => [to[p], to[q]] as const) }));
  return { atoms, bonds, ...(axes ? { axes } : {}), ...(cumulated ? { cumulated } : {}), ...(arrangements ? { arrangements } : {}) };
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
