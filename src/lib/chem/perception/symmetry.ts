/**
 * A structure's symmetry and its own order (foundation part 6): the one refinement of its atoms' ranks and the one search that
 * parts them, for every reader - identity, the layout, the CIP's helpers - moved here unchanged from lib/layout/canonical, which
 * keeps the layout's own orders over them (`canonicalOrder`, `walkOrder`, `reordered`, `restored`) and re-exports these names.
 *
 * Each atom is ranked by what it is - its element, charge, H count, bonds and their orders - and the ranks refined by its
 * neighbours' until they part no further (Morgan's way); then by each stereocentre's configuration and each double bond's cis
 * or trans, read against its neighbours' ranks, which tells apart atoms the bonds alone leave alike (diastereotopic groups).
 * Atoms still alike are parted by taking each in turn and keeping the order that writes the structure least.
 *
 * What a caller may rely on:
 * - classes (`symmetryClasses`): atoms the refinement cannot tell apart. Coarser than orbits in rare cages (bare cuneane's eight
 *   carbons are one class and three orbits): a prefilter only.
 * - orbits (`symmetryOrbits`): atoms an automorphism found takes onto each other. Never joined wrongly; where the search ran out
 *   of its budget (`complete` false) some orbits may be split. Where symmetry is meant, orbits, not classes.
 * - the canonical text (`canonicalText`, `canonicalWritten`, `canonicalSearched`): equal for two orders of one structure when
 *   the search was complete; never equal for two structures.
 *
 * What an orbit is NOT:
 * - not "atoms alike to a chemist". An automorphism here keeps every centre's sense, so orbits are the homotopic sets: right for
 *   laying a structure over itself without reflecting it. Enantiotopic atoms are apart (meso-tartaric acid's two centres; a
 *   CH2 either side of a mirror plane, as in cis-1,4-dimethylcyclohexane's ring); diastereotopic atoms can be together (the two
 *   methyls of the isopropyl group of (S)-3-methylbutan-2-ol), though a spectrum tells them apart.
 * - not of the aromatic form: as drawn means as drawn. A Kekule structure's orbits are those of its drawn double bonds (a
 *   Kekule toluene's seven carbons are seven orbits); the orbits of the aromatic form are lib/chem/identity's `symmetryOrbits`.
 * - no map with a reflection is held: a reader that needs those (mirror images laid over each other) cannot take them from
 *   orbits.
 */
import type { ChemGraph } from "./graph";
import type { Cumulated } from "./stereo/types";
import { parity } from "./stereo/geometry";
import { runsThrough } from "./stereo/runs";

/**
 * What the symmetry reads: the core's graph, with an odd run of cumulated double bonds set cis or trans (a butatriene's), and
 * which of a metal's donors are across from each other where that is given (the layout's `Arranged`) - structurally the
 * layout's input, without what is an instruction to the layout.
 */
export type SymmetryInput = ChemGraph & {
  cumulated?: readonly Cumulated[];
  arrangements?: readonly { metal: number; pairs: readonly (readonly [number, number])[] }[];
};

const adjacency = (input: SymmetryInput) => {
  const adj: { to: number; order: number }[][] = input.atoms.map(() => []);
  for (const b of input.bonds) {
    adj[b.a].push({ to: b.b, order: b.order });
    adj[b.b].push({ to: b.a, order: b.order });
  }
  return adj;
};

/**
 * How a double bond's or an axis's end is set against its reference
 * neighbour: 1 where the reference is the end's lower-ranked other
 * neighbour (or its only one), -1 where it is the higher-ranked, 0 where
 * the end's two others share a rank - no unit, as far as the ranks tell.
 * A cis/trans or a sense written as it stands times each end's, so that
 * whichever neighbour a drawing or a reading took for its reference, one
 * configuration is written one way.
 */
const endSet = (adj: ReturnType<typeof adjacency>, r: readonly number[], at: number, partner: number, ref: number): number => {
  const others = adj[at].filter((e) => e.to !== partner).map((e) => e.to);
  if (others.length < 2) return 1;
  const other = others.find((o) => o !== ref);
  if (other == null) return 1;
  return Math.sign(r[other] - r[ref]) || 0;
};

/** The atom an axis's or a cumulene's end runs on through to its other end (perception/stereo/runs `runsThrough`); the other end where none. */
const across = (adj: ReturnType<typeof adjacency>, end: number, other: number): number => runsThrough(adj[end], other) ?? other;

/** Each star's pi system and each atom's stars (`LayoutAtom.pi`), both ways: what tells a haptic ring's atoms from others. */
const piLinks = (input: SymmetryInput) => {
  const links: number[][] = input.atoms.map(() => []);
  input.atoms.forEach((a, i) => a.pi?.forEach((m) => (links[i].push(m), links[m].push(i))));
  return links;
};

/**
 * Each atom's rank by what it is and what it is bonded to, refined by its
 * neighbours' and by how each stereocentre and double bond is set, until
 * they part no further - atoms alike left alike - with what each atom is
 * (`first`) and the refinement, for `canonicalRanks` to part them on.
 */
function classed(input: SymmetryInput): Classed {
  const known = classedOnce.get(input) ?? classedNow(input);
  classedOnce.set(input, known);
  return { ...known, rank: [...known.rank] };
}

type Classed = { rank: number[]; first: string[]; withStereo: (r: number[]) => number[] };

/**
 * `classed` worked out once for each input, as it is (inputs are not
 * changed in place): identity asks for a structure's classes before its
 * ranks and texts (lib/chem/identity `filledIn`), and all come from them.
 */
const classedOnce = new WeakMap<SymmetryInput, Classed>();

function classedNow(input: SymmetryInput): Classed {
  const adj = adjacency(input);
  const pis = piLinks(input);
  // (which atoms are an axis of chirality's, and which its ends' other
  // neighbours - each of them, not only the one taken for its reference:
  // which that was is no part of what the atoms are)
  // (an odd cumulene's ends and theirs likewise, set apart from an axis's)
  const onAxis = input.atoms.map(() => "");
  for (const [mark, units] of [
    ["a", input.axes ?? []],
    ["c", input.cumulated ?? []],
  ] as const)
    for (const x of units) {
      for (const a of x.atoms) onAxis[a] += mark;
      const [u, v] = x.atoms;
      for (const [end, far] of [
        [u, v],
        [v, u],
      ])
        for (const e of adj[end]) if (e.to !== across(adj, end, far)) onAxis[e.to] += "r";
    }
  // what each atom is: everything the layout reads of it - its element (or
  // the label it stands for), charge, H count, bonds and their orders, a
  // star's pi system, a part in an axis of chirality - and nothing else
  const first = input.atoms.map((a, i) =>
    [a.el, a.charge ?? 0, a.hs ?? -1, adj[i].length, adj[i].map((e) => e.order).sort((p, q) => p - q).join("."), a.pi?.length ?? 0, pis[i].length, onAxis[i]].join("|"),
  );
  const rank = ranksOf(first);
  const refine = (r: number[]): number[] => {
    for (;;) {
      const keys = r.map((v, i) =>
        [v, ...adj[i].map((e) => `${r[e.to]}:${e.order}`).sort(), ...pis[i].map((m) => `${r[m]}:pi`).sort()].join(","),
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
  // (each donor of a metal whose arrangement is given, and the donor across from it: `Arranged`)
  const partnerOf = new Map<number, number[]>();
  for (const x of input.arrangements ?? [])
    for (const [p, q] of x.pairs) {
      partnerOf.set(p, [...(partnerOf.get(p) ?? []), q]);
      partnerOf.set(q, [...(partnerOf.get(q) ?? []), p]);
    }
  const stereoKeys = (r: number[]): string[] =>
    input.atoms.map((a, i) => {
      const parts: (number | string)[] = [];
      if (a.tetra) {
        const ns = a.tetra.neighbours.map((m) => (m < 0 ? -1 : r[m]));
        parts.push(new Set(ns).size === ns.length ? a.tetra.volume * parity(ns) : 0);
      }
      // (each end's reference against its other neighbour: endSet)
      for (const b of stereoAt[i]) {
        const [p, q] = b.stereo!.refs;
        parts.push((b.stereo!.cis ? 1 : -1) * endSet(adj, r, b.a, b.b, p) * endSet(adj, r, b.b, b.a, q));
      }
      // (and an axis of chirality's sense, likewise)
      for (const x of input.axes ?? []) {
        if (!x.atoms.includes(i)) continue;
        const [p, q] = x.refs;
        const [u, v] = x.atoms;
        parts.push(x.sense * endSet(adj, r, u, across(adj, u, v), p) * endSet(adj, r, v, across(adj, v, u), q));
      }
      // (and an odd cumulene's cis or trans, as a double bond's, at its ends)
      for (const x of input.cumulated ?? []) {
        if (!x.atoms.includes(i)) continue;
        const [p, q] = x.refs;
        const [u, v] = x.atoms;
        parts.push((x.cis ? 1 : -1) * endSet(adj, r, u, across(adj, u, v), p) * endSet(adj, r, v, across(adj, v, u), q));
      }
      // (and a metal's donor, by the rank of the donor across from it: PtCl2Br(NH3)-'s Cl across Br is not its Cl across N. A
      //  bridge is a donor of two metals, across one donor at each: those ranks in order, not in the order the input lists the
      //  metals - else the bridges of a dimer ranked by the order of its atoms, two texts for one structure: found in the chemistry check)
      for (const v of (partnerOf.get(i) ?? []).map((q) => r[q]).sort((p, q) => p - q)) parts.push(`x${v}`);
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
  return { rank: withStereo(refine(rank)), first, withStereo };
}

/**
 * Each atom's symmetry class: atoms alike in every way the ranks can tell -
 * element, charge, H count, bonds, and how a stereocentre or double bond is
 * set against them - share a class; the classes ranked as `canonicalRanks`
 * ranks atoms, the same for the same molecule whatever order its atoms came
 * in. Ranks alone can leave atoms alike that are not (cuneane's, basketane's),
 * so a class says which atoms may be equivalent, and an automorphism must
 * still keep every bond.
 */
export function symmetryClasses(input: SymmetryInput): number[] {
  return classed(input).rank;
}

/**
 * The molecule's symmetry as `canonicalRanks`' search finds it: its
 * automorphisms met (each a permutation of the atoms, atom to atom, that
 * takes every atom onto one alike and every bond onto a bond), and each
 * atom's orbit under them - the atoms those take it onto, numbered by the
 * least canonical rank among them, so the same whatever order the atoms
 * came in. Orbits are never coarser than the molecule's true ones: two
 * atoms share one only where an automorphism found takes one onto the
 * other. Where the search ran out of steps (`complete` false: very large and
 * very symmetric molecules), some automorphisms may be missing and some
 * orbits split - finer, never wrongly joined.
 */
export function symmetryOrbits(input: SymmetryInput): { orbit: number[]; automorphisms: number[][]; complete: boolean } {
  const { rank, first, withStereo } = classed(input);
  const n = input.atoms.length;
  const found = search(rank, n, withStereo, (r) => written(input, first, r));
  const root = Array.from({ length: n }, (_, i) => i);
  const find = (a: number): number => (root[a] === a ? a : (root[a] = find(root[a])));
  for (const g of found.symmetries) g.forEach((b, a) => (root[find(a)] = find(b)));
  const least = new Map<number, number>();
  for (let a = 0; a < n; a++) {
    const k = find(a);
    least.set(k, Math.min(least.get(k) ?? Infinity, found.r[a]));
  }
  return { orbit: Array.from({ length: n }, (_, a) => least.get(find(a))!), automorphisms: found.symmetries, complete: !found.cut };
}

/**
 * Each atom's rank in the molecule, every atom alone (see `canonicalOrder`):
 * the same for the same molecule whatever order its atoms came in, and for
 * every one of its own orders (`walkOrder`), so worked out once for all.
 */
export function canonicalRanks(input: SymmetryInput): number[] {
  const { rank, first, withStereo } = classed(input);
  // Atoms still alike: each of the lowest such class taken first in turn,
  // the ranks refined again, and so on until every atom stands alone; of
  // the orders that gives, the one that writes the molecule first (its
  // atoms and bonds, by their places, the least). Ranks alone can leave
  // atoms alike that are not - cuneane's, basketane's - and which of them
  // went first decided the order. Two orders that write the molecule the
  // same show a symmetry of it, and the atoms it takes onto each other are
  // not tried again: a tert-butyl's three methyls, alike in every way, are
  // tried once.
  return settled(rank, input.atoms.length, withStereo, (r) => written(input, first, r));
}

/**
 * The molecule written in its own order (`canonicalRanks`): each place's
 * atom and how a stereocentre there is set, and the bonds between places -
 * the same text for the same molecule however its atoms are numbered, and
 * another for any other, its mirror image included where it is chiral.
 */
export function canonicalText(input: SymmetryInput): string {
  return canonicalWritten(input).text;
}

/**
 * `canonicalText`, and whether the search for the order that writes it
 * least was complete: where it ran out of steps (`settleBudget` - very
 * large and very symmetric molecules), the text is the least of the orders
 * tried, so one molecule may be written two ways. It is still the whole
 * molecule written out, so two molecules are never written the same.
 */
export function canonicalWritten(input: SymmetryInput): { text: string; complete: boolean } {
  const { rank, first, withStereo } = classed(input);
  const found = search(rank, input.atoms.length, withStereo, (r) => written(input, first, r));
  return { text: written(input, first, found.r), complete: !found.cut };
}

/**
 * One search of the molecule, as `canonicalWritten` makes it, and all it finds at once: the text, the order that writes it
 * (each atom's place, a canonical numbering of its atoms - which of two atoms alike in every way comes first may follow
 * the input's order), the symmetries met on the way (`symmetryOrbits`'), and whether the search was complete.
 */
export function canonicalSearched(input: SymmetryInput): { text: string; ranks: number[]; automorphisms: number[][]; complete: boolean } {
  const { rank, first, withStereo } = classed(input);
  const found = search(rank, input.atoms.length, withStereo, (r) => written(input, first, r));
  return { text: written(input, first, found.r), ranks: found.r, automorphisms: found.symmetries, complete: !found.cut };
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
  return search(start, n, refined, writes).r;
}

/**
 * `settled`'s search: the order that writes the molecule least, the
 * symmetries it met on the way - each a permutation of the atoms (atom to
 * atom) taking the molecule onto itself, found as two orders that write it
 * the same - and whether it ran out of steps before it had tried every way.
 */
function search(start: number[], n: number, refined: (r: number[]) => number[], writes: (r: number[]) => string): { r: number[]; symmetries: number[][]; cut: boolean } {
  let budget = settleBudget(n);
  let cut = false;
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
      if (best && budget <= 0) {
        cut = true;
        break;
      }
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
  const found = search(start);
  return { r: found.r, symmetries: found.symmetries, cut };
}

/**
 * The molecule written by its atoms' places (`r`, each atom alone): each
 * place's atom - what it is, how a stereocentre there is set - and the
 * bonds between places, with a double bond's cis or trans; the same text
 * for two orders only where they are the same molecule the same way.
 */
function written(input: SymmetryInput, what: readonly string[], r: readonly number[]): string {
  const adj = adjacency(input);
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
      // (cis or trans as its ends' lower-ranked neighbours have it, whichever neighbours it was given against: endSet)
      const st = b.stereo ? `:${(b.stereo.cis ? 1 : -1) * endSet(adj, r, b.a, b.b, b.stereo.refs[0]) * endSet(adj, r, b.b, b.a, b.stereo.refs[1]) > 0 ? "c" : "t"}` : "";
      return `${pad(r[p])}${pad(r[q])}:${b.order}${st}`;
    })
    .sort();
  const pis = at.map((a) => (input.atoms[a].pi ?? []).map((m) => pad(r[m])).sort().join(".")).join(";");
  // (an axis's sense likewise, as its ends' lower-ranked neighbours have it - the same seen from either end)
  const axes = (input.axes ?? [])
    .map((x) => {
      const [u, v] = x.atoms;
      const [a, b] = r[u] < r[v] ? [u, v] : [v, u];
      return `${pad(r[a])}${pad(r[b])}:${x.sense * endSet(adj, r, u, across(adj, u, v), x.refs[0]) * endSet(adj, r, v, across(adj, v, u), x.refs[1])}`;
    })
    .sort();
  // (an odd cumulene's cis or trans likewise, by its ends)
  const cumulated = (input.cumulated ?? [])
    .map((x) => {
      const [u, v] = x.atoms;
      const [a, b] = r[u] < r[v] ? [u, v] : [v, u];
      const set = (x.cis ? 1 : -1) * endSet(adj, r, u, across(adj, u, v), x.refs[0]) * endSet(adj, r, v, across(adj, v, u), x.refs[1]);
      return `${pad(r[a])}${pad(r[b])}:${set > 0 ? "c" : "t"}`;
    })
    .sort();
  // (a metal's donors across from each other, each pair by its places, lower first: written only where given, so a
  //  structure with none is written as it always was)
  const arranged = (input.arrangements ?? [])
    .map((x) => `${pad(r[x.metal])}:${x.pairs.map(([p, q]) => (r[p] < r[q] ? pad(r[p]) + pad(r[q]) : pad(r[q]) + pad(r[p]))).sort().join(".")}`)
    .sort();
  return `${atoms.join(";")}|${bonds.join(" ")}|${pis}|${axes.join(" ")}${cumulated.length ? `|${cumulated.join(" ")}` : ""}${arranged.length ? `|m${arranged.join(" ")}` : ""}`;
}

/** Each key's rank among the distinct keys, in sorted order. */
function ranksOf(keys: readonly string[]): number[] {
  const distinct = [...new Set(keys)].sort();
  const at = new Map(distinct.map((k, i) => [k, i]));
  return keys.map((k) => at.get(k)!);
}

const classes = (r: readonly number[]) => new Set(r).size;
