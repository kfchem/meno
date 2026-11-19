/**
 * Where a structure can carry a configuration and carries none, and identity's fill of it (foundation part 13, design 3.8): the
 * candidates by shape (`blanksOf`), the values each may take (`valuesOf`, `given`), and the fill that gives each blank that sets
 * nothing a configuration, so that a structure written with it and without it is one (`filledIn`). Moved here unchanged from
 * lib/chem/identity (part 13's move), which imports it back; what a later step changes is pinned in this file's test as it stands.
 */
import { AROMATIC } from "../aromatic";
import { elementOf, endsAsDrawn } from "../chalcogenEnds";
import { drawnRoundMetal } from "../elements";
import { SMALL_RING } from "../rings";
import { canonicalSearched, canonicalWritten, settingCisTrans, symmetryClasses, type SymmetryInput } from "../symmetry";
import { lonePairCentres } from "./lonePairs";

/**
 * Two donors of one metal that its ligand joins by a ring of this many atoms or fewer, the metal counted, are never across: a chelate's
 * five- or six-membered ring cannot span the metal (found in the chemistry check). Larger rings may - a porphyrin's opposite N, joined
 * only by a ring of ten - so a filled arrangement may put those across; one read stands as read. Read by identity's fill and by the
 * SMILES reader, which refuses a mark that puts two such donors across (lib/chem/chelateRing re-exports it).
 */
export const CHELATE_RING = 7;

/** A metal, as identity's fill asks: one ligands are drawn round (../elements `drawnRoundMetal`). */
const isMetal = (el: string): boolean => drawnRoundMetal.has(el);

/** The elements a centre of four groups may be (as the chemistry check ruled them: never a metal). */
const CENTRES = new Set(["B", "C", "Si", "Ge", "Sn", "Pb", "N", "P", "As", "Sb", "Bi", "S", "Se", "Te"]);


/**
 * A place that could carry a configuration and carries none: a centre (its
 * neighbours in the order the configuration names them, a lone pair or an
 * implicit H last), a double bond, an allene's axis or an odd cumulene's
 * cis or trans - each with its own atoms and, for the search's prefilter,
 * the groups whose two alike would let it set nothing.
 */
export type Blank = (
  | { kind: "centre"; at: number; neighbours: number[] }
  | { kind: "biaryl"; at: number }
  | { kind: "bond"; at: number; refs: [number, number] }
  | { kind: "axis" | "cumulated"; ends: [number, number]; refs: [number, number] }
  | { kind: "metal"; at: number; pairings: (readonly [number, number])[][] }
) & { own: number[]; sides: number[][] };

/**
 * Where a structure could carry a configuration and carries none, by shape
 * alone (the candidates; no symmetry asked): an atom of B, C, Si, Ge,
 * Sn, Pb, N, P, As, Sb, Bi, S, Se or Te with four groups, at most one of
 * them a plain hydrogen, or three and a lone pair it keeps
 * (./lonePairCentres) - an H among the three for a P, As, Sb or Bi (a
 * secondary phosphine's P); a double bond, each end with a group but the other
 * end and no other double bond, in no ring of `SMALL_RING` or fewer; and a
 * run of cumulated double bonds between two carbons, each with a group -
 * even, an axis; odd, a cis or trans. A biaryl's axis is none: only a
 * drawing states one (ST-1.7).
 */
export function blanksOf(g: SymmetryInput): Blank[] {
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
  // (its element as written: identity's own marks - a mass number, an unpaired electron, a centre's shared ends - taken off: `compared`)
  const element = (i: number) => elementOf(g.atoms[i].el);
  const hs = (i: number) => g.atoms[i].hs ?? 0;
  // (a centre whose end chalcogens share their bonds read by the lone-pair rule as drawn: ../chalcogenEnds `endsAsDrawn`)
  const pyramid = lonePairCentres(
    g.atoms.map((a, i) => ({ el: element(i), charge: a.charge ?? 0, hs: a.hs ?? 0 })),
    endsAsDrawn(g.atoms, g.bonds),
  );
  const out: Blank[] = [];
  for (let i = 0; i < n; i++) {
    if (g.atoms[i].tetra || !CENTRES.has(element(i)) || hs(i) > 1) continue;
    if (around[i].length + hs(i) === 4) out.push({ kind: "centre", at: i, neighbours: [...around[i], ...(hs(i) ? [-1] : [])], own: [i], sides: [around[i]] });
    // (three groups and a lone pair it keeps - with an H among the three, carried, a P's, As's, Sb's or Bi's as it is without one: a
    //  secondary phosphine's P, the maintainer's ruling of 2026-11-06, ./lonePairs; its H last, the lone pair understood)
    else if (around[i].length + hs(i) === 3 && pyramid(i)) out.push({ kind: "centre", at: i, neighbours: [...around[i], ...(hs(i) ? [-1] : [])], own: [i], sides: [around[i]] });
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
  // (a metal of four or six donors whose arrangement is not given, with the pairings that can be: none with two donors
  //  across that the ligand joins by a ring of `CHELATE_RING` atoms or fewer, the metal counted - a chelate's two ends
  //  are never across, a porphyrin's opposite N may be. Bonds through the metal are not the ligand's: `ligandNear` from a
  //  donor walks no further than the metal)
  const arranged = new Set((g.arrangements ?? []).map((x) => x.metal));
  const orderAt = new Map(g.bonds.map((b) => [b.a < b.b ? `${b.a},${b.b}` : `${b.b},${b.a}`, b.order]));
  for (let m = 0; m < n; m++) {
    const donors = around[m];
    if (!isMetal(element(m)) || arranged.has(m) || hs(m) || (donors.length !== 4 && donors.length !== 6)) continue;
    const joined = (p: number, q: number) => ligandNear(around, m, p, q, CHELATE_RING - 2);
    const unjoined = pairingsOf(donors).filter((pairing) => pairing.every(([p, q]) => !joined(p, q)));
    // (and two donors a third holds flat across from each other in every pairing: a porphyrin's opposite N, terpyridine's
    //  outer two - `heldFlat`. Pairs that cannot all be had together leave the pairings as they were: never closed by a fault)
    const held = donors.length === 6 ? heldFlat(m, donors, around, (p, q) => orderAt.get(p < q ? `${p},${q}` : `${q},${p}`) ?? 1, element) : [];
    const across = unjoined.filter((pairing) => held.every(([p, q]) => pairing.some(([x, y]) => (x === p && y === q) || (x === q && y === p))));
    const pairings = across.length ? across : unjoined;
    if (pairings.length) out.push({ kind: "metal", at: m, pairings, own: [m], sides: [donors] });
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
export function given(g: SymmetryInput, b: Exclude<Blank, { kind: "metal" }>, up: boolean): SymmetryInput {
  if (b.kind === "biaryl") return up ? g : { ...g, axes: g.axes!.map((x, i) => (i === b.at ? { ...x, sense: x.sense === 1 ? -1 : 1 } : x)) };
  if (b.kind === "centre") return { ...g, atoms: g.atoms.map((a, i) => (i === b.at ? { ...a, tetra: { neighbours: b.neighbours, volume: up ? 1 : -1 } } : a)) };
  if (b.kind === "bond") return { ...g, bonds: g.bonds.map((x, i) => (i === b.at ? { ...x, stereo: { refs: b.refs, cis: up } } : x)) };
  if (b.kind === "axis") return { ...g, axes: [...(g.axes ?? []), { atoms: b.ends, refs: b.refs, sense: up ? 1 : -1 }] };
  return { ...g, cumulated: [...(g.cumulated ?? []), { atoms: b.ends, refs: b.refs, cis: up }] };
}

/**
 * The structure with `b` given each value it can have: a centre's, a double bond's, an axis's or a cumulene's two
 * senses (a biaryl's: as drawn, then turned); a metal's every pairing that can be.
 */
export function valuesOf(g: SymmetryInput, b: Blank): SymmetryInput[] {
  if (b.kind !== "metal") return [given(g, b, true), given(g, b, false)];
  return b.pairings.map((pairs) => ({ ...g, arrangements: [...(g.arrangements ?? []), { metal: b.at, pairs }] }));
}

/** Every way of pairing off `donors` (four: three ways; six: fifteen), each pair lower first. */
function pairingsOf(donors: readonly number[]): (readonly [number, number])[][] {
  if (!donors.length) return [[]];
  const [first, ...rest] = donors;
  return rest.flatMap((q) => pairingsOf(rest.filter((r) => r !== q)).map((more) => [[Math.min(first, q), Math.max(first, q)] as const, ...more]));
}

/**
 * The pairs of a six-donor metal `m`'s donors a third holds flat across from each other (found in the chemistry check): B, a
 * donor in a ring of five or six that does not hold the metal, B and its two neighbours in that ring trigonal, and from each
 * of those two a path of trigonal atoms - B's neighbour and one or two more, a chelate ring of five or six with the metal -
 * to one donor: those two donors are across. A porphyrin's opposite N, terpyridine's outer two, a pincer's whose arms are
 * trigonal. A path of CH2 - cyclam, dien, salen - holds nothing flat. Trigonal: an atom with a double or aromatic bond, or an
 * N in a ring of five or six whose two neighbours in that ring each have one (a pyrrole's).
 */
function heldFlat(m: number, donors: readonly number[], around: readonly number[][], order: (p: number, q: number) => number, element: (i: number) => string): [number, number][] {
  const doubled = (i: number) => around[i].some((j) => order(i, j) === 2 || order(i, j) === AROMATIC);
  // (a ring of five or six through B and its two neighbours x and y, not through the metal: x to y in three or four bonds)
  const ringed = (b: number, x: number, y: number) => {
    let at = [x];
    const seen = new Set([b, m, x]);
    for (let d = 1; d <= 4 && at.length; d++) {
      const next: number[] = [];
      for (const u of at)
        for (const v of around[u]) {
          if (v === y && d >= 3) return true;
          if (seen.has(v)) continue;
          seen.add(v);
          next.push(v);
        }
      at = next;
    }
    return false;
  };
  // (trigonal: a double or aromatic bond of its own; or an N in a ring of five or six whose two neighbours in that ring each have
  //  one - a pyrrole's. An NH linking two rings by single bonds is not held flat for sure: never counted so)
  const trigonal = (i: number) => {
    if (doubled(i)) return true;
    if (element(i) !== "N") return false;
    const near = around[i].filter((j) => j !== m && doubled(j));
    return near.some((j, k) => near.slice(k + 1).some((l) => ringed(i, j, l)));
  };
  // (the one donor reached from x - B's neighbour - by trigonal atoms, x and one or two more between B and it; none, or two, and null)
  const donorBy = (b: number, x: number): number | null => {
    const found = new Set<number>();
    const walk = (path: number[]) => {
      const last = path[path.length - 1];
      if (path.length >= 2) for (const d of around[last]) if (d !== b && d !== m && donors.includes(d) && !path.includes(d)) found.add(d);
      if (path.length === 3) return;
      for (const v of around[last]) if (v !== b && v !== m && !path.includes(v) && !donors.includes(v) && trigonal(v)) walk([...path, v]);
    };
    walk([x]);
    return found.size === 1 ? [...found][0] : null;
  };
  const out: [number, number][] = [];
  for (const b of donors) {
    if (!trigonal(b)) continue;
    const near = around[b].filter((x) => x !== m && trigonal(x));
    for (let i = 0; i < near.length; i++)
      for (let j = i + 1; j < near.length; j++) {
        if (!ringed(b, near[i], near[j])) continue;
        const [a, c] = [donorBy(b, near[i]), donorBy(b, near[j])];
        if (a != null && c != null && a !== c && !out.some(([p, q]) => (p === a && q === c) || (p === c && q === a))) out.push([a, c]);
      }
  }
  return out;
}

/** Whether two donors `p` and `q` of metal `m` are joined, not through the metal, within `most` bonds. */
function ligandNear(around: readonly number[][], m: number, p: number, q: number, most: number): boolean {
  let at = [p];
  const seen = new Set([p, m]);
  for (let d = 1; d <= most && at.length; d++) {
    const next: number[] = [];
    for (const x of at)
      for (const y of around[x]) {
        if (y === q) return true;
        if (seen.has(y)) continue;
        seen.add(y);
        next.push(y);
      }
    at = next;
  }
  return false;
}

/** The structure with no configuration at all: what its symmetry by constitution alone is asked of (`filledIn`'s prefilter). */
function unconfigured(g: SymmetryInput): SymmetryInput {
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
 * given: there no configuration is written, drawn or not; and a double
 * bond's or an odd cumulene's cis or trans that sets nothing with the rest
 * as given (perception/symmetry `settingCisTrans`) is taken off. A
 * place that could carry a configuration and carries none (`blanksOf`) is
 * given one where both senses write the same text: such a place sets
 * nothing, so writing it changes no compound - an isopropyl's CH, the
 * third centre of the cis,trans 1,2,3-trimethylcyclopropane written with
 * its trans pair; a double bond or an odd cumulene so is left with none,
 * and asked no more (below). A place whose
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
 * and a writing that states one compound has that compound's text. Where
 * writings that leave the same thing unsaid in different ways get two
 * identities, they are alike told apart, never two unlike joined, and only
 * where no single compound is stated. A double bond or an odd cumulene
 * that sets nothing is left with none, never filled: a cis or trans given
 * there is none to every canonical reading (perception/symmetry
 * `settingCisTrans`) while the rest stays open, so filled, it would turn
 * into a configuration again once another place was filled - that acid
 * with its double bond filled and then its centre would have one
 * enantiomer's text, though it states neither. So that acid drawn with its
 * double bond bent, with its centre wedged, or with nothing at all is one
 * structure.
 *
 * A metal of four or six donors whose arrangement is not given - which of
 * its donors are across from each other - is such a place too, its values
 * every pairing that can be (none with a chelate's two ends across): filled
 * where all of them write one text (PtCl4 2-, Pt(en)Cl2, [Co(en)3]3+), open
 * where they do not (cisplatin with none given).
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
export function filledIn(input: SymmetryInput): { input: SymmetryInput; complete: boolean; text?: string; searches: number; settledMetals: number[] } {
  // (a cis or trans given where it sets nothing, the rest as given - a cyclohexylidene's with its ring's C4 left open - taken
  //  off: perception/symmetry `settingCisTrans`, as every canonical reading takes it)
  let g = settingCisTrans(input);
  let complete = true;
  // (how many canonical searches the fill made - its cost, the same for the same structure whatever its atoms' order)
  let searches = 0;
  const written = (h: SymmetryInput) => (searches++, canonicalWritten(h));
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
  const constitution = symmetryClasses(unconfigured(input));
  const own = new Set(every.flatMap((b) => b.own));
  const plainAt = new Set<number>();
  const plainBond = new Set<number>();
  const settledHere = (b: Blank) => (b.kind === "centre" && plainAt.has(b.at)) || (b.kind === "bond" && plainBond.has(b.at));
  // (asked again until nothing more settles: a place settled is no place for the groups that hold it - each sense of it one
  //  structure, so two groups alike but for it are alike - and three tert-butyls on one carbon settle it, their own centres
  //  settled first: tri-tert-butylmethanol. And a cage's bridgehead two of whose bridges are alike: `bridgesAlike`)
  for (;;) {
    const places = new Set(every.filter((b) => !settledHere(b)).flatMap((b) => b.own));
    const alike = groupsAlike(g, places, constitution);
    const bridges = bridgesAlike(g, places, constitution);
    const more = every.filter(
      (b) => !settledHere(b) && (b.kind === "centre" || b.kind === "bond") && b.sides.some((side, k) => ends(side) || alike(b.own[k] ?? b.own[0], side) || bridges(b.own[k] ?? b.own[0], side)),
    );
    if (!more.length) break;
    for (const b of more) {
      if (b.kind === "centre") plainAt.add(b.at);
      else if (b.kind === "bond") plainBond.add(b.at);
    }
    g = { ...g, atoms: g.atoms.map(({ tetra, ...a }, i) => (plainAt.has(i) || !tetra ? a : { ...a, tetra })), bonds: g.bonds.map(({ stereo, ...b }, k) => (plainBond.has(k) || !stereo ? b : { ...b, stereo })) };
  }
  const settled = every.filter(settledHere);
  // (a metal all of whose donors, or all but one, are groups alike as wholes - Pd(PPh3)4, [Co(NH3)6]3+, RhCl(PPh3)3,
  //  PtCl3Br 2-: the odd one across any of the others, every pairing one structure, so it carries none, as such a centre
  //  carries no sense: one given taken off, none filled in, and no search - RhCl(PPh3)3's ran out of steps, found in review.
  //  A place inside those groups that
  //  sets nothing whatever else is given - each PPh3's P - is no place for this: however it is, the groups stay alike)
  const loose = groupsAlike(g, new Set([...own].filter((x) => !settled.some((b) => b.own.includes(x)))), constitution);
  const plainMetal = new Set(every.flatMap((b) => (b.kind === "metal" && loose.allButOne(b.at, b.sides[0]) ? [b.at] : [])));
  if (plainMetal.size) g = { ...g, arrangements: (g.arrangements ?? []).filter((x) => !plainMetal.has(x.metal)) };
  // (said to whoever asks whether a metal is open - `arrangementOpen`: settled so, it is not)
  const settledMetals = [...plainMetal];
  // (a double bond or an odd cumulene found to set nothing below: left with none, never given one - a cis or trans given there
  //  would be taken off by every canonical reading while its place stays open, and become a configuration again once
  //  another place was filled: (4-methylcyclohexylidene)acetic acid's C=C filled and then its C4, one enantiomer's text for
  //  a writing that states neither)
  const leftNone = new Set<string>();
  const noneKey = (b: Blank) => (b.kind === "bond" ? `b${b.at}` : b.kind === "cumulated" ? `c${b.ends.join(",")}` : null);
  // (the places left: those not settled so)
  const open = (b: Blank) => !settledHere(b) && !(b.kind === "metal" && plainMetal.has(b.at)) && !leftNone.has(noneKey(b) ?? "");
  // (an axis or a cumulene of alike end atoms: filled, as before)
  for (const b of blanksOf(g)) if ((b.kind === "axis" || b.kind === "cumulated") && b.sides.some((side) => ends(side))) g = given(g, b, true);
  // (the classes of the constitution alone, coarser than every orbit of the structure with any configuration given)
  let classes: number[] | null = null;
  // (each fill gives one place or takes out one drawn axis, so there are never more rounds than places at the start: a round
  //  past that is a fault, and ends with what is filled so far, said incomplete, rather than running on)
  const most = blanksOf(g).filter(open).length;
  for (let round = 0; ; round++) {
    const blanks = blanksOf(g).filter(open);
    if (!blanks.length) return { input: g, complete, text, searches, settledMetals };
    if (round > most) return { input: g, complete: false, text: undefined, searches, settledMetals };
    classes ??= symmetryClasses(unconfigured(input));
    const cs = classes;
    const tried = blanks.filter((b) => b.sides.some((side) => new Set(side.map((m) => cs[m])).size < side.length));
    if (!tried.length) return { input: g, complete, text, searches, settledMetals };
    // (one search of the structure as it is, where it is needed: the canonical order of its places, and its symmetries)
    let now: ReturnType<typeof canonicalSearched> | null = null;
    const searched = () => (now ??= (searches++, canonicalSearched(g)));
    if (tried.length > 1) {
      const rank = searched().ranks;
      const place = (b: Blank) => b.own.map((a) => rank[a]).sort((x, y) => x - y);
      tried.sort((p, q) => {
        const [x, y] = [place(p), place(q)];
        return x[0] - y[0] || (x[1] ?? -1) - (y[1] ?? -1);
      });
    }
    let next: SymmetryInput | null = null;
    for (const b of tried) {
      // (a symmetry of the structure that keeps the place and turns it over - two of a centre's groups swapped, or the two
      //  on one end of a double bond: its two senses are one structure, so it sets nothing, with no writing)
      if (b.kind !== "biaryl" && b.kind !== "metal" && turnedOver(b, searched().automorphisms)) {
        const none = noneKey(b);
        if (none) leftNone.add(none);
        next = none ? g : given(g, b, true);
        text = undefined;
        break;
      }
      // (a metal two of whose pairings pair its donors' classes differently: two structures surely - a symmetry keeps every
      //  class - so it sets something, with no writing: PdCl2(PPh3)2's Cl across Cl, or across P)
      if (b.kind === "metal") {
        const byClass = b.pairings.map((pairs) => pairs.map(([x, y]) => [cs[x], cs[y]].sort((m, n) => m - n).join(",")).sort().join(" "));
        if (new Set(byClass).size > 1) continue;
      }
      const values = valuesOf(g, b);
      const u = written(values[0]);
      // (the first value that writes another text, if any: a metal's fifteen pairings are not all written where two differ)
      let d: ReturnType<typeof canonicalWritten> | null = null;
      for (const v of values.slice(1)) {
        const w = written(v);
        if (w.text === u.text) continue;
        d = w;
        break;
      }
      // (one text is one structure, whether the search finished or not: it writes the whole of it)
      if (!d) {
        const none = noneKey(b);
        if (none) leftNone.add(none);
        next = b.kind === "biaryl" ? { ...g, axes: g.axes!.filter((_, i) => i !== b.at) } : none ? g : values[0];
        text = b.kind === "biaryl" || none ? undefined : u.complete ? u.text : undefined;
        break;
      }
      if (!u.complete || !d.complete) complete = false;
    }
    if (!next) return { input: g, complete, text: undefined, searches, settledMetals };
    g = next;
  }
}

/**
 * Whether one of `automorphisms` (each atom to atom) keeps place `b` and turns it over: keeps a centre and moves its groups
 * by an odd permutation, or keeps both ends of a double bond, an axis or a cumulene and swaps the two groups on one end only.
 * Then the place's two senses are one structure. False where none found does - the search's symmetries are those it met,
 * so this may miss one, never find one that is not.
 */
function turnedOver(b: Exclude<Blank, { kind: "biaryl" | "metal" }>, automorphisms: readonly (readonly number[])[]): boolean {
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

/**
 * Whether `at` is a bridgehead of a cage two of whose bridges are alike: every group of `side` a bridge to one other atom -
 * cut from `at` and that atom, each its own part - as quinuclidine's three to its N; and two of them alike as wholes, with no
 * place in them (`places`) and no configuration, written the same with the atoms on each bridgehead marked. Exchanging the
 * two turns both bridgeheads over and moves nothing else, and a cage's bridgeheads stand only one way to each other, so the
 * sense at `at` says nothing. Two arms of a ring are no cage (1,4-dimethylcyclohexane's cis and trans), nor are bridges to
 * different atoms (tropine's C3): a centre still (found in the chemistry check).
 */
function bridgesAlike(g: SymmetryInput, places: ReadonlySet<number>, classes: readonly number[]): (at: number, side: readonly number[]) => boolean {
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
  /** The part reached from `from`, never through `at` or `far`; null past GROUP_MOST atoms. */
  const part = (from: number, at: number, far: number): number[] | null => {
    const seen = new Set([at, far, from]);
    const out = [from];
    for (let k = 0; k < out.length; k++)
      for (const y of around[out[k]]) {
        if (seen.has(y)) continue;
        if (out.length >= GROUP_MOST) return null;
        seen.add(y);
        out.push(y);
      }
    return out;
  };
  /** How many atoms a bridge has along it: from its atom on `at`'s side (`from`) to the nearest of its atoms on `far`. */
  const bridgeLength = (group: readonly number[], from: number, far: number): number => {
    const inGroup = new Set(group);
    let at = [from];
    const seen = new Set([from]);
    for (let d = 1; at.length; d++) {
      if (at.some((a) => around[a].includes(far))) return d;
      const next: number[] = [];
      for (const u of at)
        for (const v of around[u]) {
          if (!inGroup.has(v) || seen.has(v)) continue;
          seen.add(v);
          next.push(v);
        }
      at = next;
    }
    return Infinity;
  };
  const text = (group: readonly number[], at: number, far: number): string | null => {
    if (group.some((a) => places.has(a) || configured.has(a))) return null;
    const index = new Map(group.map((a, i) => [a, i]));
    const mark = (a: number) => [at, far].map((e, k) => (around[a].includes(e) ? `^${k ? "far" : "on"}${order.get(key(a, e))}` : "")).join("");
    const atoms = group.map((a) => ({ ...g.atoms[a], el: `${g.atoms[a].el}${mark(a)}` }));
    const bonds = g.bonds.filter((b) => index.has(b.a) && index.has(b.b)).map((b) => ({ a: index.get(b.a)!, b: index.get(b.b)!, order: b.order }));
    return canonicalWritten({ atoms, bonds }).text;
  };
  return (at, side) => {
    if (side.length < 3) return false;
    // (the other bridgehead: an atom of the first bridge every group of `at` reaches it by, each by its own part)
    const first = part(side[0], at, -1);
    if (!first) return false;
    for (const far of first) {
      const parts = side.map((n) => (n === far ? null : part(n, at, far)));
      if (parts.some((q) => !q)) continue;
      const own = parts as number[][];
      // (each its own part, apart from the others, and each meeting the far bridgehead)
      if (own.some((_, k) => own.some((r, l) => l !== k && r.includes(side[k])))) continue;
      if (!own.every((q) => q.some((a) => around[a].includes(far)))) continue;
      // (every bridge of BRIDGE_MOST atoms or fewer between the two bridgeheads, along it: a longer one lets the bridgeheads
      //  stand in or out - in,out-bicyclo[4.4.1]undecane - and their senses to each other say which)
      if (own.some((q, k) => bridgeLength(q, side[k], far) > BRIDGE_MOST)) continue;
      for (let p = 0; p < side.length; p++)
        for (let q = p + 1; q < side.length; q++) {
          if (classes[side[p]] !== classes[side[q]]) continue;
          const t = text(own[p], at, far);
          if (t != null && t === text(own[q], at, far)) return true;
        }
      return false;
    }
    return false;
  };
}

/**
 * The most atoms a cage's bridge may have, along it, for its bridgeheads to stand only one way to each other (`bridgesAlike`):
 * with four, in,out isomers begin (bicyclo[4.4.1]undecane's, found in the chemistry check). That none is known with every
 * bridge of three or fewer is the chemistry check's memory, not a source read: a bound on the safe side - a cage past it is
 * left to the search, never two compounds joined.
 */
const BRIDGE_MOST = 3;

/**
 * The atoms of `g` a cage holds: an atom joined to another by three paths that share no atom but their ends, each with
 * one to `BRIDGE_MOST` atoms between them - a bridgehead of norbornane, of camphor, of tropane, quinuclidine's N, every atom
 * of cubane and of adamantane's cage. A fused system's junction is none (its two junctions are bonded: a bond is no bridge - bicyclo[3.3.0]octane's, decalin's), nor a
 * bridgehead whose bridges are long enough to stand in or out (bicyclo[4.4.1]undecane's), whose senses are its own. Such an
 * atom's configuration is tied to the cage's other bridgehead's - turned alone it makes no structure - yet it is a real one,
 * which names cite (camphor's 1R,4R): the CIP labels it as its rules give, whatever identity's turning says (the chemistry
 * check's ruling).
 */
export function cageAtoms(g: { readonly atoms: readonly unknown[]; readonly bonds: readonly { readonly a: number; readonly b: number }[] }): Set<number> {
  const around: number[][] = g.atoms.map(() => []);
  for (const b of g.bonds) {
    around[b.a].push(b.b);
    around[b.b].push(b.a);
  }
  const out = new Set<number>();
  // (three paths sharing no atom between)
  const apart = (p: readonly number[], q: readonly number[]) => !p.some((x) => q.includes(x));
  for (let a = 0; a < g.atoms.length; a++) {
    // (three paths need three bonds)
    if (around[a].length < 3) continue;
    // (every path out of `a` of up to BRIDGE_MOST + 1 bonds, by the atom it ends at: its atoms between)
    const paths = new Map<number, number[][]>();
    const walk = (at: number, between: number[]) => {
      for (const n of around[at]) {
        if (n === a || between.includes(n)) continue;
        // (a bond straight to it is no bridge: a fused system's junctions are bonded, a cage's bridgeheads are not - found in review)
        if (between.length) paths.set(n, [...(paths.get(n) ?? []), between]);
        if (between.length < BRIDGE_MOST) walk(n, [...between, n]);
      }
    };
    walk(a, []);
    let found = false;
    for (const ps of paths.values()) {
      for (let i = 0; i < ps.length && !found; i++)
        for (let j = i + 1; j < ps.length && !found; j++) {
          if (!apart(ps[i], ps[j])) continue;
          for (let k = j + 1; k < ps.length && !found; k++) if (apart(ps[i], ps[k]) && apart(ps[j], ps[k])) found = true;
        }
      if (found) break;
    }
    if (found) out.add(a);
  }
  return out;
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
function groupsAlike(
  g: SymmetryInput,
  places: ReadonlySet<number>,
  classes: readonly number[],
): ((at: number, side: readonly number[]) => boolean) & { all: (at: number, side: readonly number[]) => boolean; allButOne: (at: number, side: readonly number[]) => boolean } {
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
  const two = (at: number, side: readonly number[]) => {
    for (let p = 0; p < side.length; p++)
      for (let q = p + 1; q < side.length; q++) {
        if (classes[side[p]] !== classes[side[q]]) continue;
        const t = textOf(at, side[p]);
        if (t != null && t === textOf(at, side[q])) return true;
      }
    return false;
  };
  // (every group of `side` alike as a whole with the first)
  const all = (at: number, side: readonly number[]) => {
    if (side.length < 2 || side.some((x) => classes[x] !== classes[side[0]])) return false;
    const t = textOf(at, side[0]);
    return t != null && side.every((x) => textOf(at, x) === t);
  };
  // (every group of `side` but one alike as a whole with the others: swapping those is a symmetry whatever else is given, and
  //  for a metal every pairing of them and the odd one is one of these swaps from every other)
  const allButOne = (at: number, side: readonly number[]) => side.length >= 3 && side.some((_, k) => all(at, side.filter((_, j) => j !== k)));
  return Object.assign(two, { all, allButOne });
}

/**
 * Whether a group of atoms bonded to one atom holds two end atoms alike: each bonded to nothing else, of one element
 * as identity reads it (its mass number and unpaired electrons part of it), charge and hydrogens, by bonds of one
 * order - two methyls, two fluorines. Swapping them is a symmetry of the structure whatever else is given.
 */
function endsAlike(g: SymmetryInput): (side: readonly number[]) => boolean {
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
