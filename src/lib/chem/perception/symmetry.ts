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
 * - a cis or trans that sets nothing is read as none (`settingCisTrans`): a double bond with an end whose two other groups are
 *   alike is no stereo unit, so whichever way it was given, every reading here is that of the structure given none there; nor
 *   is one with an end that is no trigonal-planar centre (a sulfonium or sulfoxonium ylide's S, a sulfoximine's, a metal); an
 *   allene's axis with an end of two alike groups likewise.
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
import { metal } from "./elements";
import { lonePairOfThree } from "./stereo/lonePairs";

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
 * A double bond's two refs, the one on its first atom (`b.a`) first: found
 * by the end each is bonded to, not by its place in `refs`, so that a bond
 * whose atoms are listed the other way round, its refs as they were, is
 * read as the same configuration (a ref bonded to both ends, in a
 * three-membered ring, is taken as given).
 */
const refsByEnd = (adj: ReturnType<typeof adjacency>, b: { a: number; b: number; stereo?: { refs: readonly [number, number] } }): [number, number] => {
  const [p, q] = b.stereo!.refs;
  return p !== b.b && adj[b.a].some((e) => e.to === p) ? [p, q] : [q, p];
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
const endSet = (adj: ReturnType<typeof adjacency>, r: readonly number[], at: number, partner: number, ref: number): number =>
  setAgainst(
    adj[at].filter((e) => e.to !== partner).map((e) => e.to),
    r,
    ref,
  );

/**
 * `endSet` for an end whose neighbours other than its partner are
 * `others`, ranked by `r`: 1 where `ref` is the lower-ranked of them (or
 * the only one), -1 the higher, 0 where they share a rank.
 */
function setAgainst(others: readonly number[], r: readonly number[], ref: number): number {
  if (others.length < 2) return 1;
  const other = others.find((o) => o !== ref);
  if (other == null) return 1;
  return Math.sign(r[other] - r[ref]) || 0;
}

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
  const known = classedOnce.get(input) ?? classedNow(settingCisTrans(input));
  classedOnce.set(input, known);
  return { ...known, rank: [...known.rank] };
}

/** What `classed` works out: the ranks, what each atom is, the refinement, and the input they are of (`settingCisTrans`'s). */
type Classed = { rank: number[]; first: string[]; withStereo: (r: number[]) => number[]; input: SymmetryInput };

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
      const now = r;
      const { next, after, before } = parted(now, (i) =>
        [now[i], ...adj[i].map((e) => `${now[e.to]}:${e.order}`).sort(), ...pis[i].map((m) => `${now[m]}:pi`).sort()].join(","),
      );
      if (after === before) return next;
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
  const stereoKey = (r: number[], i: number): string => {
    const a = input.atoms[i];
    const parts: (number | string)[] = [];
    if (a.tetra) {
      const ns = a.tetra.neighbours.map((m) => (m < 0 ? -1 : r[m]));
      parts.push(new Set(ns).size === ns.length ? a.tetra.volume * parity(ns) : 0);
    }
    // (each end's reference against its other neighbour: endSet)
    for (const b of stereoAt[i]) {
      const [p, q] = refsByEnd(adj, b);
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
  };
  const withStereo = (r: number[]): number[] => {
    for (;;) {
      const now = r;
      const next = refine(parted(now, (i) => stereoKey(now, i)).next);
      if (classes(next) === classes(r)) return next;
      r = next;
    }
  };
  return { rank: withStereo(refine(rank)), first, withStereo, input };
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
  return orbitsOf(classed(input));
}

/** `symmetryOrbits` of what `classed` or `classedNow` worked out. */
function orbitsOf({ rank, first, withStereo, input }: Classed): { orbit: number[]; automorphisms: number[][]; complete: boolean } {
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
  const { rank, first, withStereo, input: own } = classed(input);
  // Atoms still alike: each of the lowest such class taken first in turn,
  // the ranks refined again, and so on until every atom stands alone; of
  // the orders that gives, the one that writes the molecule first (its
  // atoms and bonds, by their places, the least). Ranks alone can leave
  // atoms alike that are not - cuneane's, basketane's - and which of them
  // went first decided the order. Two orders that write the molecule the
  // same show a symmetry of it, and the atoms it takes onto each other are
  // not tried again: a tert-butyl's three methyls, alike in every way, are
  // tried once.
  return settled(rank, input.atoms.length, withStereo, (r) => written(own, first, r));
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
  const { rank, first, withStereo, input: own } = classed(input);
  const found = search(rank, input.atoms.length, withStereo, (r) => written(own, first, r));
  return { text: written(own, first, found.r), complete: !found.cut };
}

/**
 * One search of the molecule, as `canonicalWritten` makes it, and all it finds at once: the text, the order that writes it
 * (each atom's place, a canonical numbering of its atoms - which of two atoms alike in every way comes first may follow
 * the input's order), the symmetries met on the way (`symmetryOrbits`'), and whether the search was complete.
 */
export function canonicalSearched(input: SymmetryInput): { text: string; ranks: number[]; automorphisms: number[][]; complete: boolean } {
  const { rank, first, withStereo, input: own } = classed(input);
  const found = search(rank, input.atoms.length, withStereo, (r) => written(own, first, r));
  return { text: written(own, first, found.r), ranks: found.r, automorphisms: found.symmetries, complete: !found.cut };
}

/**
 * `input` with each cis or trans that sets nothing taken off - a double bond's, an odd cumulene's - and each allene's axis
 * that sets nothing (an even run's, its ends not bonded to each other): where, with that unit left out and every other
 * configuration kept, a symmetry of the structure holds both its ends and the groups on one end where they are and swaps
 * the two groups on the other. Turned over, it is then the same structure, so it states nothing: a 2-methylbut-2-ene's C=C,
 * a prenyl's, a cyclohexylidene's (its ring's two arms alike); 2-methylpenta-2,3-diene's axis, its end of two methyls - an
 * allene's two senses are each other's mirror image, and with two alike groups on an end the mirror image is the molecule
 * itself. Written as it stands, it would part those two groups by which one the search took first - two orbits for
 * 2,7-dimethylocta-2,6-diene's alike methyls, found in the chemistry check - so it is read as none, by every reading here
 * and by the drawing's reader (perception/stereo/from2d `readStereo`), from this one test.
 *
 * - Every other configuration kept: two groups alike in constitution but not in configuration are not alike.
 *   (4-methylcyclohexylidene)acetic acid's ring arms are alike while its C4 is open, and its C=C then sets nothing; with C4
 *   set they are not, and the two together set the molecule's axis (its two enantiomers). An end with an (R)- and an
 *   (S)-sec-butyl likewise keeps its cis or trans.
 * - The other end's groups held: a symmetry that swaps the groups on both ends turns the unit twice, and leaves it as it was
 *   (a C=C shared by two rings of one size, as in bicyclo[8.8.0]octadec-1(10)-ene, mirrored through its own plane).
 * - Two end atoms alike - each bonded to the end alone, of one element, charge and H count, by bonds of one order (a
 *   gem-dimethyl's, an isopropylidene's) - are swapped by a symmetry whatever else is given: alike, with no search.
 * - Classes of the constitution (no configuration at all) are a prefilter only: an end whose two groups they part has them
 *   apart in every orbit. Orbits decide, as classes can join atoms no symmetry joins.
 * - A symmetry found is one, so two groups found alike are, whether the search ran its course or not; where it ran out of
 *   steps without finding them alike, the unit is kept as given.
 * Each unit is asked of `input` with it alone left out; none is taken off before the others are asked.
 *
 * Nor does a cis or trans set anything where an end is no trigonal-planar centre (`trigonal`): only where each end's
 * neighbours, its hydrogens and its lone pairs make three (VSEPR) do the double bond and the groups on its ends lie in one
 * plane, which a cis or trans needs. A C=C's, a C=N's, an N=N's, a silene's or a disilene's ends are; so is a sulfine's S (two
 * neighbours and a lone pair: its E and Z are two compounds). A sulfonium ylide's S (three neighbours and a lone pair), a
 * sulfoxonium ylide's or a sulfoximine's S (four neighbours), a phosphorus ylide's P (four) and a metal carbene's metal are
 * not: their "double bond" is ylidic or dative, with no planar pi bond to hold a cis or trans, so none is read or written
 * there, however it was given. The lone pairs are counted as the CIP counts them (lib/chem/lonePairCentres
 * `lonePairOfThree`: the valence electrons less the charge, the bonds' orders and the hydrogens).
 */
export function settingCisTrans<T extends SymmetryInput>(input: T): T {
  const units = [
    ...input.bonds.flatMap((b, k) => (b.stereo ? [{ bond: k }] : [])),
    ...(input.cumulated ?? []).map((_, k) => ({ run: k })),
    // (an allene's axis - its ends not bonded to each other; a biaryl's, a single bond, is not asked here: identity `filledIn`
    //  takes one that sets nothing out as a place of its own)
    ...(input.axes ?? []).flatMap(({ atoms: [u, v] }, k) => (input.bonds.some((b) => (b.a === u && b.b === v) || (b.a === v && b.b === u)) ? [] : [{ axis: k }])),
  ];
  if (!units.length) return input;
  const adj = adjacency(input);
  // (each end of a unit and the atom it goes on through to the other end: a double bond's other end, a run's next atom)
  const endsOf = (u: (typeof units)[number]): [number, number][] => {
    if ("bond" in u) {
      const { a, b } = input.bonds[u.bond];
      return [
        [a, b],
        [b, a],
      ];
    }
    const [p, q] = ("run" in u ? input.cumulated![u.run] : input.axes![u.axis]).atoms;
    return [
      [p, across(adj, p, q)],
      [q, across(adj, q, p)],
    ];
  };
  const others = (end: number, on: number) => adj[end].map((e) => e.to).filter((t) => t !== on);
  // (an end that is a trigonal-planar centre: no metal, and its neighbours, hydrogens and lone pairs three at most)
  const trigonal = (end: number): boolean => {
    const a = input.atoms[end];
    // (the element alone: a reader's graph writes a mass number or unpaired electrons after it - perception/stereo/from2d `drawnGraph`)
    const el = a.el.replace(/[\^.].*$/, "");
    if (metal.has(el)) return false;
    const hs = Math.max(0, a.hs ?? 0);
    const groups = adj[end].length + hs;
    if (groups > 3) return false;
    return !(groups === 3 && lonePairOfThree(el, a.charge ?? 0, adj[end].length, adj[end].reduce((t, e) => t + e.order, 0), hs));
  };
  // (what an atom bonded to `end` alone is, as the ranks first read it: element, charge, H count, its bond's order; none where
  //  it is a star's, a metal's donor across from another, or an axis's or a run's own)
  const placed = new Set([
    ...(input.arrangements ?? []).flatMap((x) => x.pairs.flat()),
    ...[...(input.axes ?? []), ...(input.cumulated ?? [])].flatMap((x) => x.atoms),
    ...input.atoms.flatMap((a) => a.pi ?? []),
  ]);
  const endAtom = (x: number, end: number): string | null => {
    const a = input.atoms[x];
    if (a.pi?.length || a.tetra || placed.has(x)) return null;
    return [a.el, a.charge ?? 0, a.hs ?? -1, adj[end].find((t) => t.to === x)!.order].join("|");
  };
  let constitution: number[] | null = null;
  const setsNothing = (u: (typeof units)[number]): boolean => {
    const [[p, pn], [q, qn]] = endsOf(u);
    if (!trigonal(p) || !trigonal(q)) return true;
    const left: SymmetryInput =
      "bond" in u
        ? { ...input, bonds: input.bonds.map((b, k) => (k === u.bond ? (({ stereo: _stereo, ...rest }) => rest)(b) : b)) }
        : "run" in u
          ? { ...input, cumulated: input.cumulated!.filter((_, k) => k !== u.run) }
          : { ...input, axes: input.axes!.filter((_, k) => k !== u.axis) };
    for (const [e, en, f, fn] of [
      [p, pn, q, qn],
      [q, qn, p, pn],
    ]) {
      const two = others(e, en);
      if (two.length !== 2) continue;
      // (two end atoms alike - a gem-dimethyl's, an isopropylidene's: swapping them keeps all else, with no search)
      if (two.every((x) => adj[x].length === 1)) {
        const [p0, p1] = two.map((x) => endAtom(x, e));
        if (p0 != null && p0 === p1) return true;
      }
      constitution ??= classedNow(unconfigured(input)).rank;
      if (constitution[two[0]] !== constitution[two[1]]) continue;
      // (both ends, and the other end's groups, each held in place by a mark of its own, for this search only)
      const held = new Map<number, string>([
        [e, "end"],
        [f, "far"],
        ...others(f, fn).map((x, k): [number, string] => [x, `far${k}`]),
      ]);
      const { orbit } = orbitsOf(classedNow({ ...left, atoms: left.atoms.map((a, i) => (held.has(i) ? { ...a, el: `${a.el}\u0001${held.get(i)}` } : a)) }));
      if (orbit[two[0]] === orbit[two[1]]) return true;
    }
    return false;
  };
  const empty = units.filter(setsNothing);
  if (!empty.length) return input;
  const bonds = new Set(empty.flatMap((u) => ("bond" in u ? [u.bond] : [])));
  const runs = new Set(empty.flatMap((u) => ("run" in u ? [u.run] : [])));
  const axes = new Set(empty.flatMap((u) => ("axis" in u ? [u.axis] : [])));
  return {
    ...input,
    bonds: input.bonds.map((b, k) => (bonds.has(k) ? (({ stereo: _stereo, ...rest }) => rest)(b) : b)),
    ...(input.cumulated ? { cumulated: input.cumulated.filter((_, k) => !runs.has(k)) } : {}),
    ...(input.axes ? { axes: input.axes.filter((_, k) => !axes.has(k)) } : {}),
  };
}

/** The structure with no configuration at all - its constitution, a star's pi system kept: `settingCisTrans`' prefilter. */
const unconfigured = (input: SymmetryInput): SymmetryInput => ({
  atoms: input.atoms.map(({ tetra: _tetra, ...a }) => a),
  bonds: input.bonds.map(({ stereo: _stereo, ...b }) => b),
});

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
      const leaf = search(refined(parted(r, (i) => (i === m ? "0" : "1")).next));
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
      const refs = b.stereo ? refsByEnd(adj, b) : null;
      const st = b.stereo && refs ? `:${(b.stereo.cis ? 1 : -1) * endSet(adj, r, b.a, b.b, refs[0]) * endSet(adj, r, b.b, b.a, refs[1]) > 0 ? "c" : "t"}` : "";
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

/**
 * Each atom's rank (`r`) parted by what `key` says of it: `ranksOf` of the keys `${r[i]} padded to six}/${key(i)}` - the ranks
 * first, then the keys within each, sorted - with a key asked only of an atom whose rank it shares with another, so that a
 * refinement pays only for the atoms still alike. With how many ranks there are after, and before.
 */
function parted(r: readonly number[], key: (i: number) => string): { next: number[]; after: number; before: number } {
  const members = new Map<number, number[]>();
  r.forEach((v, i) => {
    const m = members.get(v);
    if (m) m.push(i);
    else members.set(v, [i]);
  });
  const next = new Array<number>(r.length);
  let rank = 0;
  for (const v of [...members.keys()].sort((p, q) => p - q)) {
    const atoms = members.get(v)!;
    if (atoms.length === 1) {
      next[atoms[0]] = rank++;
      continue;
    }
    const keys = atoms.map(key);
    const distinct = [...new Set(keys)].sort();
    const at = new Map(distinct.map((k, i) => [k, rank + i]));
    atoms.forEach((a, i) => (next[a] = at.get(keys[i])!));
    rank += distinct.length;
  }
  return { next, after: rank, before: members.size };
}

/** Each key's rank among the distinct keys, in sorted order. */
function ranksOf(keys: readonly string[]): number[] {
  const distinct = [...new Set(keys)].sort();
  const at = new Map(distinct.map((k, i) => [k, i]));
  return keys.map((k) => at.get(k)!);
}

const classes = (r: readonly number[]) => new Set(r).size;
