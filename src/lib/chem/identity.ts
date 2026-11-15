/**
 * A structure's identity and symmetry (docs/WORKFLOWS-FOUNDATION.md, PR 2),
 * from the canonical numbering Clean-up writes its layouts by
 * (src/lib/layout/canonical.ts):
 * - its identity: the structure written in its own order - the same for
 *   the same structure however its atoms are numbered, another for any
 *   other, a chiral one's mirror image included - and a short key of it;
 * - its atoms' orbits under the automorphisms found, and those
 *   automorphisms; and the group they generate, counted up to a cap.
 * Identity never replaces an entry's fixed numbering: it is worked out
 * from it, once per structure.
 *
 * What identity compares (docs/WORKFLOWS-FOUNDATION.md, *Enumerate*,
 * *Duplicates, and what judges them*): the constitution, with each atom's
 * element, charge, mass number and unpaired electrons, and each
 * configuration as drawn; aromatic rings as one form (`aromaticForm`); and a
 * plain hydrogen atom as one of its neighbour's hydrogens
 * (`hydrogensFolded`).
 */
import { canonicalSearched, canonicalWritten, symmetryClasses, symmetryOrbits as orbitsAsDrawn } from "../layout/canonical";
import { lonePairCentres } from "./lonePairCentres";
import { isMetal, type LayoutAtom, type LayoutBond, type LayoutInput } from "../layout/perceive";
import type { Axial, Cumulated, Tetrahedral } from "../layout/stereo";
import type { Radical } from "./molecule";
import { aromaticForm } from "./perception/aromatic";

// (the aromatic form identity and symmetry compare structures in: the core's, where the two forms are said apart)
export { aromaticForm };

/**
 * An atom as identity reads it: as the layout does, and besides, its mass
 * number where it is one isotope in particular, its unpaired electrons, and
 * whether it is mapped to an atom of a reaction - each of which keeps a
 * hydrogen an atom of its own (`hydrogensFolded`). Each atom's `hs` is its
 * hydrogens not drawn as atoms.
 */
export type IdentityAtom = LayoutAtom & { isotope?: number; radical?: Radical; mapped?: true };
export type IdentityInput = { atoms: readonly IdentityAtom[]; bonds: readonly LayoutBond[]; axes?: readonly Axial[]; cumulated?: readonly Cumulated[] };

/**
 * The structure with each plain hydrogen atom counted as one of its
 * neighbour's hydrogens, as a structure drawn without it has it: R1 = H is
 * the compound drawn without that H. A hydrogen stays an atom where it is
 * any of these:
 * - charged, with unpaired electrons, or one isotope in particular
 *   (deuterium, tritium);
 * - mapped to an atom of a reaction;
 * - bonded to another hydrogen (H2), or by anything but one single bond;
 * - bonded to more than one atom (bridging), or to none;
 * - on a metal (a hydride ligand);
 * - one of a pi system bound to a metal.
 *
 * A plain hydrogen that sets a configuration is folded in with the
 * configuration kept, carried over to the atom it is on: a stereocentre's
 * hydrogen becomes its implicit one, last among its neighbours, the sense
 * turned for each place it moves; where a double bond's or an axis's
 * configuration is set by it, by its end's other neighbour instead, the
 * sense turned. Where nothing is left to carry it - a centre with two
 * hydrogens, a double bond's end with two - there was no configuration, and
 * none is kept. Folding never depends on the order of the atoms.
 */
export function hydrogensFolded(input: IdentityInput): IdentityInput {
  const n = input.atoms.length;
  const around: { to: number; order: number }[][] = input.atoms.map(() => []);
  for (const b of input.bonds) {
    around[b.a].push({ to: b.b, order: b.order });
    around[b.b].push({ to: b.a, order: b.order });
  }
  const inPi = new Set(input.atoms.flatMap((a) => a.pi ?? []));
  const onAxis = new Set([...(input.axes ?? []), ...(input.cumulated ?? [])].flatMap((x) => x.atoms));
  const plain = (i: number): boolean => {
    const a = input.atoms[i];
    if (a.el !== "H" || a.charge || a.isotope || a.radical || a.mapped || a.hs || a.tetra || a.pi || inPi.has(i) || onAxis.has(i)) return false;
    if (around[i].length !== 1 || around[i][0].order !== 1) return false;
    const on = input.atoms[around[i][0].to];
    return on.el !== "H" && !isMetal(on.el);
  };
  const folded = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) folded[i] = plain(i);
  if (!folded.some(Boolean)) return input;
  const kept = input.atoms.map((_, i) => i).filter((i) => !folded[i]);
  const at = new Map(kept.map((i, k) => [i, k]));
  const extra = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) if (folded[i]) extra[around[i][0].to]++;

  // (a stereocentre's: its folded hydrogen its implicit one, last; two or more hydrogens, no stereocentre)
  const centre = (t: Tetrahedral): Tetrahedral | undefined => {
    const hs = t.neighbours.filter((m) => m < 0 || folded[m]).length;
    if (hs === 0) return { neighbours: t.neighbours.map((m) => at.get(m)!), volume: t.volume };
    if (hs > 1) return undefined;
    const h = t.neighbours.findIndex((m) => m < 0 || folded[m]);
    const moves = t.neighbours.length - 1 - h;
    const rest = t.neighbours.filter((_, k) => k !== h).map((m) => at.get(m)!);
    return { neighbours: [...rest, -1], volume: (moves % 2 ? -t.volume : t.volume) as 1 | -1 };
  };
  // (a reference atom folded: its end's other neighbour instead, the sense turned - none, where that end has no other)
  const instead = (end: number, ref: number, other: number): number | null => {
    const left = around[end].map((e) => e.to).filter((m) => m !== ref && m !== other);
    if (left.length !== 1 || folded[left[0]] || input.atoms[end].hs) return null;
    return left[0];
  };
  const atoms = kept.map((i) => {
    const { tetra, pi, ...a } = input.atoms[i];
    const t = tetra && centre(tetra);
    // (a star's pi system by its atoms' new places, as every other reference is: none of them is folded)
    return { ...a, ...(extra[i] ? { hs: (a.hs ?? 0) + extra[i] } : {}), ...(t ? { tetra: t } : {}), ...(pi ? { pi: pi.map((m) => at.get(m)!) } : {}) };
  });
  const bonds = input.bonds.flatMap((b): LayoutBond[] => {
    if (folded[b.a] || folded[b.b]) return [];
    const { stereo, ...rest } = b;
    const bond = { ...rest, a: at.get(b.a)!, b: at.get(b.b)! };
    if (!stereo) return [bond];
    let [p, q] = stereo.refs;
    let cis = stereo.cis;
    for (const [end, other, which] of [
      [b.a, b.b, 0],
      [b.b, b.a, 1],
    ] as const) {
      const ref = which === 0 ? p : q;
      if (!folded[ref]) continue;
      const by = instead(end, ref, other);
      if (by == null) return [bond];
      if (which === 0) p = by;
      else q = by;
      cis = !cis;
    }
    return [{ ...bond, stereo: { refs: [at.get(p)!, at.get(q)!], cis } }];
  });
  // (the atom an axis's or a cumulene's end runs on through: its cumulated double bond's)
  const runsOn = (end: number) => around[end].find((e) => e.order >= 2)?.to ?? -1;
  const axes = (input.axes ?? []).flatMap((x): Axial[] => {
    const refs = [...x.refs];
    let sense = x.sense;
    for (const k of [0, 1] as const) {
      if (!folded[refs[k]]) continue;
      // (the other end, a biaryl's; an allene's end runs on through its cumulated double bond)
      const end = x.atoms[k];
      const by = instead(end, refs[k], around[end].some((e) => e.to === x.atoms[1 - k]) ? x.atoms[1 - k] : runsOn(end));
      if (by == null) return [];
      refs[k] = by;
      sense = -sense as 1 | -1;
    }
    return [{ atoms: [at.get(x.atoms[0])!, at.get(x.atoms[1])!], refs: [at.get(refs[0])!, at.get(refs[1])!], sense }];
  });
  // (an odd cumulene's, as a double bond's)
  const cumulated = (input.cumulated ?? []).flatMap((x): Cumulated[] => {
    const refs = [...x.refs];
    let cis = x.cis;
    for (const k of [0, 1] as const) {
      if (!folded[refs[k]]) continue;
      const by = instead(x.atoms[k], refs[k], runsOn(x.atoms[k]));
      if (by == null) return [];
      refs[k] = by;
      cis = !cis;
    }
    return [{ atoms: [at.get(x.atoms[0])!, at.get(x.atoms[1])!], refs: [at.get(refs[0])!, at.get(refs[1])!], cis }];
  });
  return { atoms, bonds, ...(input.axes ? { axes } : {}), ...(input.cumulated ? { cumulated } : {}) };
}

/**
 * The structure as identity compares it: its plain hydrogens folded in
 * (`hydrogensFolded`), each atom's mass number and unpaired electrons made
 * part of what it is, and its aromatic form (`aromaticForm`).
 */
function compared(input: IdentityInput): LayoutInput {
  const folded = hydrogensFolded(input);
  const atoms = folded.atoms.map(({ isotope, radical, mapped: _mapped, ...a }) => ({ ...a, el: `${a.el}${isotope ? `^${isotope}` : ""}${radical ? `.${radical}` : ""}` }));
  return aromaticForm({ ...folded, atoms });
}

/**
 * A structure's identity text, and whether the search that writes it was
 * complete. Where it was not (`canonicalWritten`: very large and very
 * symmetric structures), one structure may be written two ways, so a
 * duplicate can be missed; two different structures are still never
 * written the same, but by the rules identity follows (Kekulé structures,
 * bond-shift isomers, hydrogens folded in).
 */
export function identity(input: IdentityInput): { text: string; complete: boolean } {
  const filled = filledIn(compared(input));
  if (filled.text != null) return { text: filled.text, complete: filled.complete };
  const found = canonicalWritten(filled.input);
  return { text: found.text, complete: found.complete && filled.complete };
}

/** The elements a centre of four groups may be (as the chemistry check ruled them: never a metal). */
const CENTRES = new Set(["B", "C", "Si", "Ge", "Sn", "Pb", "N", "P", "As", "Sb", "Bi", "S", "Se", "Te"]);

/** A double bond in a ring of this many atoms or fewer states no cis or trans (the reader's and the CIP's number). */
const SMALL_RING = 7;

/**
 * A place that could carry a configuration and carries none: a centre (its
 * neighbours in the order the configuration names them, a lone pair or an
 * implicit H last), a double bond, an allene's axis or an odd cumulene's
 * cis or trans - each with its own atoms and, for the search's prefilter,
 * the groups whose two alike would let it set nothing.
 */
type Blank = (
  | { kind: "centre"; at: number; neighbours: number[] }
  | { kind: "biaryl"; at: number }
  | { kind: "bond"; at: number; refs: [number, number] }
  | { kind: "axis" | "cumulated"; ends: [number, number]; refs: [number, number] }
) & { own: number[]; sides: number[][] };

/**
 * Where a structure could carry a configuration and carries none, by shape
 * alone (the candidates; no symmetry asked): an atom of B, C, Si, Ge,
 * Sn, Pb, N, P, As, Sb, Bi, S, Se or Te with four groups, at most one of
 * them a plain hydrogen, or three and a lone pair it keeps
 * (./lonePairCentres); a double bond, each end with a group but the other
 * end and no other double bond, in no ring of `SMALL_RING` or fewer; and a
 * run of cumulated double bonds between two carbons, each with a group -
 * even, an axis; odd, a cis or trans. A biaryl's axis is none: only a
 * drawing states one (ST-1.7).
 */
function blanksOf(g: LayoutInput): Blank[] {
  const n = g.atoms.length;
  const around: number[][] = g.atoms.map(() => []);
  const doubles: number[][] = g.atoms.map(() => []);
  for (const b of g.bonds) {
    around[b.a].push(b.b);
    around[b.b].push(b.a);
    if (b.order === 2) {
      doubles[b.a].push(b.b);
      doubles[b.b].push(b.a);
    }
  }
  for (const a of around) a.sort((x, y) => x - y);
  // (its element as written: identity's own marks - a mass number, an unpaired electron - taken off: `compared`)
  const element = (i: number) => g.atoms[i].el.replace(/[\^.].*$/, "");
  const hs = (i: number) => g.atoms[i].hs ?? 0;
  const pyramid = lonePairCentres(
    g.atoms.map((a, i) => ({ el: element(i), charge: a.charge ?? 0, hs: a.hs ?? 0 })),
    g.bonds,
  );
  const out: Blank[] = [];
  for (let i = 0; i < n; i++) {
    if (g.atoms[i].tetra || !CENTRES.has(element(i)) || hs(i) > 1) continue;
    if (around[i].length + hs(i) === 4) out.push({ kind: "centre", at: i, neighbours: [...around[i], ...(hs(i) ? [-1] : [])], own: [i], sides: [around[i]] });
    else if (around[i].length === 3 && !hs(i) && pyramid(i)) out.push({ kind: "centre", at: i, neighbours: [...around[i]], own: [i], sides: [around[i]] });
  }
  // (whether a and b are joined but through their own bond within `most` bonds: a ring of `most` + 1 atoms or fewer)
  const near = (a: number, b: number, most: number) => {
    let at = [a];
    const seen = new Set([a]);
    for (let d = 1; d <= most && at.length; d++) {
      const next: number[] = [];
      for (const x of at)
        for (const y of around[x]) {
          if (seen.has(y) || (x === a && y === b)) continue;
          if (y === b) return true;
          seen.add(y);
          next.push(y);
        }
      at = next;
    }
    return false;
  };
  const others = (end: number, partner: number) => around[end].filter((m) => m !== partner);
  g.bonds.forEach((b, k) => {
    if (b.order !== 2 || b.stereo || doubles[b.a].length !== 1 || doubles[b.b].length !== 1) return;
    const [p, q] = [others(b.a, b.b), others(b.b, b.a)];
    if (!p.length || !q.length || near(b.a, b.b, SMALL_RING - 1)) return;
    out.push({ kind: "bond", at: k, refs: [p[0], q[0]], own: [b.a, b.b], sides: [p, q] });
  });
  // (a run: from an end of one double bond through atoms of two to the other end of one)
  const given = new Set([...(g.axes ?? []), ...(g.cumulated ?? [])].map((x) => [...x.atoms].sort((u, v) => u - v).join(",")));
  for (let e = 0; e < n; e++) {
    if (doubles[e].length !== 1 || doubles[doubles[e][0]].length !== 2) continue;
    let [before, at, count] = [e, doubles[e][0], 1];
    while (doubles[at].length === 2 && count <= n) {
      const next = doubles[at].find((m) => m !== before)!;
      [before, at, count] = [at, next, count + 1];
    }
    const f = at;
    if (f <= e || doubles[f].length !== 1 || element(e) !== "C" || element(f) !== "C" || given.has(`${e},${f}`)) continue;
    const [p, q] = [others(e, doubles[e][0]), others(f, doubles[f][0])];
    if (!p.length || !q.length) continue;
    out.push({ kind: count % 2 ? "cumulated" : "axis", ends: [e, f], refs: [p[0], q[0]], own: [e, f], sides: [p, q] });
  }
  // (a biaryl's axis drawn: no place of its own when blank - only a drawing states one - so where it sets nothing, its
  //  plain form is no axis at all, as a biaryl drawn with none)
  (g.axes ?? []).forEach((x, k) => {
    const [u, v] = x.atoms;
    if (around[u].includes(v)) out.push({ kind: "biaryl", at: k, own: [u, v], sides: [others(u, v), others(v, u)] });
  });
  return out;
}

/** The structure with `b` given a configuration: one sense or the other (a biaryl's axis turned, or as drawn). */
function given(g: LayoutInput, b: Blank, up: boolean): LayoutInput {
  if (b.kind === "biaryl") return up ? g : { ...g, axes: g.axes!.map((x, i) => (i === b.at ? { ...x, sense: x.sense === 1 ? -1 : 1 } : x)) };
  if (b.kind === "centre") return { ...g, atoms: g.atoms.map((a, i) => (i === b.at ? { ...a, tetra: { neighbours: b.neighbours, volume: up ? 1 : -1 } } : a)) };
  if (b.kind === "bond") return { ...g, bonds: g.bonds.map((x, i) => (i === b.at ? { ...x, stereo: { refs: b.refs, cis: up } } : x)) };
  if (b.kind === "axis") return { ...g, axes: [...(g.axes ?? []), { atoms: b.ends, refs: b.refs, sense: up ? 1 : -1 }] };
  return { ...g, cumulated: [...(g.cumulated ?? []), { atoms: b.ends, refs: b.refs, cis: up }] };
}

/** The structure with no configuration at all: what its symmetry by constitution alone is asked of (`filledIn`'s prefilter). */
function unconfigured(g: LayoutInput): LayoutInput {
  return {
    atoms: g.atoms.map(({ tetra: _tetra, ...a }) => a),
    bonds: g.bonds.map(({ stereo: _stereo, ...b }) => b),
  };
}

/**
 * The structure with every configuration that sets nothing filled in, so
 * that it is one structure whether that configuration is drawn or not
 * (a rule of the chemistry check): nothing drawn is ever taken out, but
 * at a centre or double bond two of whose groups are alike - two ends, or
 * two whole groups (`groupsAlike`) - which sets nothing however the rest is
 * given: there no configuration is written, drawn or not. A
 * place that could carry a configuration and carries none (`blanksOf`) is
 * given one where both senses write the same text: such a place sets
 * nothing, so writing it changes no compound - an isopropyl's CH, a
 * prenyl's C=C(CH3)2, the third centre of the cis,trans
 * 1,2,3-trimethylcyclopropane written with its trans pair. A place whose
 * two senses write two texts is open, and stays so: the cis pair's third
 * centre, which decides between two compounds.
 *
 * One at a time: the lowest in the canonical order of the structure as it
 * then is, then asked again. The order matters - filling one place can
 * leave another open ((4-methylcyclohexylidene)acetic acid with nothing
 * given: its centre alone sets nothing, and its double bond alone, but
 * once either is filled the other decides) - so it is always the
 * canonical order, and the text does not depend on the order the atoms
 * came in. That this order gives one form for every structure is not
 * proved: it is held by the chemistry check's known answers and, over every writing of
 * fourteen structures, by the tests: never one identity for two meanings,
 * and a writing that states one compound has that compound's text. Some
 * writings that leave the same thing unsaid in different ways get two
 * identities (that acid, drawn with its double bond bent and with nothing
 * at all): alike told apart, never two unlike joined, and only where no
 * single compound is stated.
 *
 * A biaryl's axis is no such place when blank - only a drawing states one -
 * so one drawn that sets nothing (a 2,6-dimethylphenyl's) is the one thing
 * taken out: its plain form is a biaryl drawn with none.
 *
 * Its filled form is identity's own - never shown, drawn or saved.
 * A place no two of whose groups (on one side, for a double bond's or a
 * run's ends) share a class of the structure's constitution is not tried:
 * every symmetry then keeps each place's sense, so how many places are
 * written one way is kept, and its two senses could only write two texts
 * (found in the chemistry check). Two texts the same are one
 * structure, whether the search finished or not; where it ran out of steps
 * and wrote two, that place is left as it is, and `complete` says so.
 */
export function filledIn(input: LayoutInput): { input: LayoutInput; complete: boolean; text?: string; searches: number } {
  let g = input;
  let complete = true;
  // (how many canonical searches the fill made - its cost, the same for the same structure whatever its atoms' order)
  let searches = 0;
  const written = (h: LayoutInput) => (searches++, canonicalWritten(h));
  // (the text of the structure as it now is, where the last fill wrote it: `identity` asks for no search again)
  let text: string | undefined;
  // (a place two of whose groups are end atoms alike - a gem-dimethyl's, an isopropyl's, a tert-butyl's, a prenyl's
  //  C=C(CH3)2 - sets nothing whatever else is given: swapping the two turns it over and leaves all else. Filled first,
  //  with no search; and as it sets nothing in every completion, it changes no other place's two senses)
  const ends = endsAlike(g);
  // (and one two of whose groups are alike as wholes - PPh3's P, its three phenyls - likewise: `groupsAlike`. Each group's
  //  writing is small; the structure's own search, the costly part, is left for the places these do not settle. Such a
  //  centre or double bond sets nothing however the rest is given, so it carries no configuration at all - one drawn on it
  //  taken off, none filled in, it is offered no more: written so, its text never turns on which way it was filled in, as a
  //  sense picked by the order the atoms came in would where a search runs out of steps - Pd(PPh3)4, found in review)
  const every = blanksOf(unconfigured(g));
  const alike = groupsAlike(g, new Set(every.flatMap((b) => b.own)), symmetryClasses(unconfigured(input)));
  const settled = every.filter((b) => (b.kind === "centre" || b.kind === "bond") && b.sides.some((side, k) => ends(side) || alike(b.own[k] ?? b.own[0], side)));
  const plainAt = new Set(settled.flatMap((b) => (b.kind === "centre" ? [b.at] : [])));
  const plainBond = new Set(settled.flatMap((b) => (b.kind === "bond" ? [b.at] : [])));
  g = { ...g, atoms: g.atoms.map(({ tetra, ...a }, i) => (plainAt.has(i) || !tetra ? a : { ...a, tetra })), bonds: g.bonds.map(({ stereo, ...b }, k) => (plainBond.has(k) || !stereo ? b : { ...b, stereo })) };
  // (the places left: those not settled so)
  const open = (b: Blank) => !(b.kind === "centre" && plainAt.has(b.at)) && !(b.kind === "bond" && plainBond.has(b.at));
  // (an axis or a cumulene of alike end atoms: filled, as before)
  for (const b of blanksOf(g)) if ((b.kind === "axis" || b.kind === "cumulated") && b.sides.some((side) => ends(side))) g = given(g, b, true);
  // (the classes of the constitution alone, coarser than every orbit of the structure with any configuration given)
  let classes: number[] | null = null;
  // (each fill gives one place or takes out one drawn axis, so there are never more rounds than places at the start: a round
  //  past that is a fault, and ends with what is filled so far, said incomplete, rather than running on)
  const most = blanksOf(g).filter(open).length;
  for (let round = 0; ; round++) {
    const blanks = blanksOf(g).filter(open);
    if (!blanks.length) return { input: g, complete, text, searches };
    if (round > most) return { input: g, complete: false, text: undefined, searches };
    classes ??= symmetryClasses(unconfigured(input));
    const cs = classes;
    const tried = blanks.filter((b) => b.sides.some((side) => new Set(side.map((m) => cs[m])).size < side.length));
    if (!tried.length) return { input: g, complete, text, searches };
    // (one search of the structure as it is: the canonical order of its places, and its symmetries)
    searches++;
    const now = canonicalSearched(g);
    const rank = now.ranks;
    const place = (b: Blank) => b.own.map((a) => rank[a]).sort((x, y) => x - y);
    tried.sort((p, q) => {
      const [x, y] = [place(p), place(q)];
      return x[0] - y[0] || (x[1] ?? -1) - (y[1] ?? -1);
    });
    let next: LayoutInput | null = null;
    for (const b of tried) {
      // (a symmetry of the structure that keeps the place and turns it over - two of a centre's groups swapped, or the two
      //  on one end of a double bond: its two senses are one structure, so it sets nothing, with no writing - PPh3's P,
      //  whose three phenyls are alike in every way)
      if (b.kind !== "biaryl" && turnedOver(b, now.automorphisms)) {
        next = given(g, b, true);
        text = undefined;
        break;
      }
      const [up, down] = [given(g, b, true), given(g, b, false)];
      const [u, d] = [written(up), written(down)];
      // (one text is one structure, whether the search finished or not: it writes the whole of it)
      if (u.text === d.text) {
        next = b.kind === "biaryl" ? { ...g, axes: g.axes!.filter((_, i) => i !== b.at) } : up;
        text = b.kind === "biaryl" ? undefined : u.complete ? u.text : undefined;
        break;
      }
      if (!u.complete || !d.complete) complete = false;
    }
    if (!next) return { input: g, complete, text: undefined, searches };
    g = next;
  }
}

/**
 * Whether one of `automorphisms` (each atom to atom) keeps place `b` and turns it over: keeps a centre and moves its groups
 * by an odd permutation, or keeps both ends of a double bond, an axis or a cumulene and swaps the two groups on one end only.
 * Then the place's two senses are one structure. False where none found does - the search's symmetries are those it met,
 * so this may miss one, never find one that is not.
 */
function turnedOver(b: Exclude<Blank, { kind: "biaryl" }>, automorphisms: readonly (readonly number[])[]): boolean {
  return automorphisms.some((s) => {
    if (b.kind === "centre") {
      if (s[b.at] !== b.at) return false;
      const moved = b.neighbours.map((x) => b.neighbours.indexOf(x < 0 ? x : s[x]));
      if (moved.some((k) => k < 0)) return false;
      // (odd: as many cycles as there are groups, less an odd number)
      const seen = new Set<number>();
      let cycles = 0;
      for (let k = 0; k < moved.length; k++) {
        if (seen.has(k)) continue;
        cycles++;
        for (let j = k; !seen.has(j); j = moved[j]) seen.add(j);
      }
      return (moved.length - cycles) % 2 === 1;
    }
    const [e, f] = b.own;
    if (s[e] !== e || s[f] !== f) return false;
    const swapped = (side: readonly number[]) => side.length === 2 && s[side[0]] === side[1];
    return swapped(b.sides[0]) !== swapped(b.sides[1]);
  });
}

/** The most atoms a group may have for `groupsAlike` to write it: a larger one is left to the search. */
const GROUP_MOST = 64;

/**
 * Whether two of the groups `side` on atom `at` are alike as wholes: each hanging from `at` alone - cut from it, with no way
 * back to the rest - with no place in it (`places`) and no configuration, of one constitution class (`classes`), and the two
 * written the same as molecules of their own, the atom on `at` marked so and by the order of its bond to it. Swapping them is
 * a symmetry of the structure whatever else is given, so a place they are groups of sets nothing (`endsAlike`, for groups of
 * one atom, asks no writing).
 */
function groupsAlike(g: LayoutInput, places: ReadonlySet<number>, classes: readonly number[]): (at: number, side: readonly number[]) => boolean {
  const around: number[][] = g.atoms.map(() => []);
  const order = new Map<string, number>();
  const key = (p: number, q: number) => (p < q ? `${p},${q}` : `${q},${p}`);
  for (const b of g.bonds) {
    around[b.a].push(b.b);
    around[b.b].push(b.a);
    order.set(key(b.a, b.b), b.order);
  }
  const configured = new Set<number>();
  g.atoms.forEach((a, i) => a.tetra && configured.add(i));
  for (const b of g.bonds) if (b.stereo) [b.a, b.b].forEach((i) => configured.add(i));
  for (const x of [...(g.axes ?? []), ...(g.cumulated ?? [])]) x.atoms.forEach((i) => configured.add(i));
  const texts = new Map<string, string | null>();
  const textOf = (at: number, root: number): string | null => {
    const k = `${at}>${root}`;
    if (texts.has(k)) return texts.get(k)!;
    let text: string | null = null;
    const group = [root];
    const seen = new Set([at, root]);
    let fits = !places.has(root) && !configured.has(root);
    for (let i = 0; fits && i < group.length; i++)
      for (const y of around[group[i]]) {
        // (a way back to `at` but by the group's own bond: a ring through it, no group of its own)
        if (y === at && group[i] !== root) fits = false;
        if (seen.has(y)) continue;
        if (places.has(y) || configured.has(y) || group.length >= GROUP_MOST) fits = false;
        seen.add(y);
        group.push(y);
      }
    if (fits) {
      const index = new Map(group.map((a, i) => [a, i]));
      const atoms = group.map((a, i) => ({ ...g.atoms[a], el: i === 0 ? `${g.atoms[a].el}^on${order.get(key(at, root))}` : g.atoms[a].el }));
      const bonds = g.bonds.filter((b) => index.has(b.a) && index.has(b.b)).map((b) => ({ a: index.get(b.a)!, b: index.get(b.b)!, order: b.order }));
      text = canonicalWritten({ atoms, bonds }).text;
    }
    texts.set(k, text);
    return text;
  };
  return (at, side) => {
    for (let p = 0; p < side.length; p++)
      for (let q = p + 1; q < side.length; q++) {
        if (classes[side[p]] !== classes[side[q]]) continue;
        const t = textOf(at, side[p]);
        if (t != null && t === textOf(at, side[q])) return true;
      }
    return false;
  };
}

/**
 * Whether a group of atoms bonded to one atom holds two end atoms alike: each bonded to nothing else, of one element
 * as identity reads it (its mass number and unpaired electrons part of it), charge and hydrogens, by bonds of one
 * order - two methyls, two fluorines. Swapping them is a symmetry of the structure whatever else is given.
 */
function endsAlike(g: LayoutInput): (side: readonly number[]) => boolean {
  const degree = g.atoms.map(() => 0);
  const order = new Map<number, number>();
  for (const b of g.bonds) {
    degree[b.a]++;
    degree[b.b]++;
    order.set(b.a, b.order);
    order.set(b.b, b.order);
  }
  const key = (i: number) => {
    const a = g.atoms[i];
    return degree[i] === 1 && !a.tetra && !a.pi ? `${a.el}|${a.charge ?? 0}|${a.hs ?? 0}|${order.get(i)}` : null;
  };
  return (side) => {
    const keys = side.map(key).filter((k): k is string => k != null);
    return new Set(keys).size < keys.length;
  };
}

/**
 * The structure written in its own order (`identity`): the same text for the
 * same structure, whatever order its atoms are in. It does not say whether
 * the search that wrote it was complete: a caller that judges duplicates by
 * it, and must say where a duplicate may have been missed, uses `identity`.
 */
export function identityText(input: IdentityInput): string {
  return identity(input).text;
}

/**
 * A structure's identity as a short key: its identity text hashed (FNV-1a,
 * twice over, 64 bits as hex). Two structures with the same key are the
 * same structure but by a collision far less likely than a typo; where it
 * matters, the texts are compared. Like `identityText`, it does not say
 * whether the search was complete; `identity` does.
 */
export function identityKey(input: IdentityInput): string {
  return hashed(identityText(input));
}

/**
 * A structure's constitution as a short key: its identity with no
 * configuration given and none filled in (`filledIn` is for what a
 * configuration drawn or not drawn means, and a constitution has none) -
 * the key Meno has always written for it, so that a value saved with the
 * key of the structure it was worked out on (lib/steps/restructure
 * `structureKey`) still finds it. Grouping and tables by constitution ask
 * this.
 */
export function constitutionKey(input: IdentityInput): string {
  const bare = {
    atoms: input.atoms.map(({ tetra: _tetra, ...a }) => a),
    bonds: input.bonds.map(({ stereo: _stereo, ...b }) => b),
  };
  return hashed(canonicalWritten(compared(bare)).text);
}

/** A text hashed (FNV-1a, twice over, 64 bits as hex). */
function hashed(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

/**
 * Each atom's orbit (atoms an automorphism takes onto each other share
 * one, numbered the same whatever the order of the atoms), the
 * automorphisms found, and whether the search was complete (layout's
 * `symmetryOrbits`: where it was not, some orbits are split, never joined
 * wrongly) - of the structure's aromatic form, so that a benzene ring's
 * atoms are alike whichever Kekulé structure was drawn.
 */
export function symmetryOrbits(input: LayoutInput): ReturnType<typeof orbitsAsDrawn> {
  return orbitsAsDrawn(aromaticForm(input));
}

/** How many automorphisms `automorphismGroup` lists at most, unless told otherwise. */
export const GROUP_CAP = 10_000;

/**
 * The automorphism group the automorphisms found generate: every product of
 * them, the identity first, each a permutation of the atoms (atom to atom);
 * listed up to `cap` - `complete` false where there were more. Every
 * symmetric comparison of two geometries (an RMSD over the molecule's
 * symmetries) takes the least over these.
 */
export function automorphismGroup(generators: readonly (readonly number[])[], n: number, cap = GROUP_CAP): { members: number[][]; complete: boolean } {
  const identity = Array.from({ length: n }, (_, i) => i);
  const key = (p: readonly number[]) => p.join(",");
  const seen = new Set([key(identity)]);
  const members = [identity];
  for (let k = 0; k < members.length; k++) {
    for (const g of generators) {
      // (g after the member: atom a goes where the member takes it, then where g takes that)
      const product = members[k].map((x) => g[x]);
      const kp = key(product);
      if (seen.has(kp)) continue;
      if (members.length >= cap) return { members, complete: false };
      seen.add(kp);
      members.push(product);
    }
  }
  return { members, complete: true };
}
