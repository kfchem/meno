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
import { canonicalRanks, canonicalWritten, symmetryClasses, symmetryOrbits as orbitsAsDrawn } from "../layout/canonical";
import { lonePairCentres } from "./lonePairCentres";
import { isMetal, type LayoutAtom, type LayoutBond, type LayoutInput } from "../layout/perceive";
import type { Axial, Cumulated, Tetrahedral } from "../layout/stereo";
import type { Radical } from "./molecule";

/**
 * An atom as identity reads it: as the layout does, and besides, its mass
 * number where it is one isotope in particular, its unpaired electrons, and
 * whether it is mapped to an atom of a reaction - each of which keeps a
 * hydrogen an atom of its own (`hydrogensFolded`). Each atom's `hs` is its
 * hydrogens not drawn as atoms.
 */
export type IdentityAtom = LayoutAtom & { isotope?: number; radical?: Radical; mapped?: true };
export type IdentityInput = { atoms: readonly IdentityAtom[]; bonds: readonly LayoutBond[]; axes?: readonly Axial[]; cumulated?: readonly Cumulated[] };

/** The bond order a bond its Kekulé structures disagree on is given for identity and symmetry, beside 1, 2 and 3. */
const AROMATIC = 4;

/**
 * The structure with every bond whose order its Kekulé structures disagree
 * on given one order, whichever of them was drawn: Meno's rule for identity
 * and symmetry. A structure's double bonds pair its atoms off (a perfect
 * matching of those with one); another Kekulé structure of it differs by
 * an alternating cycle - single and double bonds in turn, round a ring.
 * So a bond is drawn now single, now double exactly where it lies on such a
 * cycle, and those bonds become `AROMATIC`: benzene's, naphthalene's,
 * phenanthrene's and azulene's ring bonds, a pyridine's, cyclooctatetraene's.
 * A bond on no such cycle keeps its order, as every Kekulé structure has it:
 * pyrrole's, furan's and thiophene's (they have one Kekulé structure), a
 * quinone's (its C=O is no part of a cycle), azulene's middle bond. Which
 * bonds lie on an alternating cycle is the structure's, not the drawing's,
 * so every Kekulé structure of one structure comes to the same form, and
 * its identity cannot split by how its rings were drawn. It follows that
 * bond-shift isomers are one structure: 1,2-disubstituted cyclooctatetraene
 * with its substituents across a double bond and across a single one - two
 * compounds, a barrier apart - has one identity, as joins and duplicates
 * want it. A bond so made one order says no cis or trans of its own: it is
 * single in some of the structure's Kekulé structures, so a drawing's side
 * on it - a cyclooctatetraene's ring bonds, drawn cis - is dropped with its
 * order. That holds for a real trans bond too: in a large annulene (a
 * [14]- or [18]annulene, with E bonds in its ring), configurational
 * isomers that differ by such a bond are one structure, as the rule
 * states.
 */
export function aromaticForm(input: LayoutInput): LayoutInput {
  const n = input.atoms.length;
  // (each atom's partner by its one double bond, where it has exactly one and no triple bond)
  const mate = new Array<number>(n).fill(-1);
  const doubles = new Array<number>(n).fill(0);
  const triple = new Array<boolean>(n).fill(false);
  for (const b of input.bonds) {
    if (b.order === 2) {
      doubles[b.a]++;
      doubles[b.b]++;
      mate[b.a] = b.b;
      mate[b.b] = b.a;
    } else if (b.order === 3) triple[b.a] = triple[b.b] = true;
  }
  const paired = (i: number) => doubles[i] === 1 && !triple[i] && mate[i] >= 0 && doubles[mate[i]] === 1 && !triple[mate[i]];
  // (the single bonds between paired atoms: what an alternating cycle's other half runs along)
  const singles: number[][] = input.atoms.map(() => []);
  for (const b of input.bonds) {
    if (b.order === 1 && paired(b.a) && paired(b.b)) {
      singles[b.a].push(b.b);
      singles[b.b].push(b.a);
    }
  }
  const key = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
  const aromatic = new Set<string>();
  // a single bond u-v lies on an alternating cycle where, from v's partner, single and double bonds in
  // turn reach a single bond into u's partner (u - v = v' - ... - u' = u)
  for (const b of input.bonds) {
    if (b.order !== 1 || !paired(b.a) || !paired(b.b) || mate[b.a] === b.b) continue;
    const [u, v] = [b.a, b.b];
    const goal = mate[u];
    const seen = new Set<number>([mate[v]]);
    const queue = [mate[v]];
    let found = false;
    while (queue.length && !found) {
      const x = queue.shift()!;
      for (const y of singles[x]) {
        if (y === goal) {
          found = true;
          break;
        }
        if (y === u || y === v) continue;
        const next = mate[y];
        if (next === u || next === v || seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    if (!found) continue;
    aromatic.add(key(u, v));
    aromatic.add(key(u, mate[u]));
    aromatic.add(key(v, mate[v]));
  }
  if (!aromatic.size) return input;
  return {
    ...input,
    bonds: input.bonds.map((b) => {
      if (!aromatic.has(key(b.a, b.b))) return b;
      const { stereo: _side, ...rest } = b;
      return { ...rest, order: AROMATIC };
    }),
  };
}

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

/** The elements a centre of four groups may be (part 13's candidates, as CHEM ruled them: never a metal). */
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
 * alone (part 13's candidates; no symmetry asked): an atom of B, C, Si, Ge,
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
 * (part 13's U1; CHEM's rule, 11-13): nothing drawn is ever taken out. A
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
 * proved: it is held by CHEM's known answers and, over every writing of
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
 * (CHEM, 11-14). Two texts the same are one
 * structure, whether the search finished or not; where it ran out of steps
 * and wrote two, that place is left as it is, and `complete` says so.
 */
export function filledIn(input: LayoutInput): { input: LayoutInput; complete: boolean; text?: string } {
  let g = input;
  let complete = true;
  // (the text of the structure as it now is, where the last fill wrote it: `identity` asks for no search again)
  let text: string | undefined;
  // (a place two of whose groups are end atoms alike - a gem-dimethyl's, an isopropyl's, a tert-butyl's, a prenyl's
  //  C=C(CH3)2 - sets nothing whatever else is given: swapping the two turns it over and leaves all else. Filled first,
  //  with no search; and as it sets nothing in every completion, it changes no other place's two senses)
  const ends = endsAlike(g);
  for (const b of blanksOf(g)) if (b.kind !== "biaryl" && b.sides.some((side) => ends(side))) g = given(g, b, true);
  // (the classes of the constitution alone, coarser than every orbit of the structure with any configuration given)
  let classes: number[] | null = null;
  for (;;) {
    const blanks = blanksOf(g);
    if (!blanks.length) return { input: g, complete, text };
    classes ??= symmetryClasses(unconfigured(input));
    const cs = classes;
    const tried = blanks.filter((b) => b.sides.some((side) => new Set(side.map((m) => cs[m])).size < side.length));
    if (!tried.length) return { input: g, complete, text };
    const rank = tried.length > 1 ? canonicalRanks(g) : [];
    const place = (b: Blank) => b.own.map((a) => rank[a]).sort((x, y) => x - y);
    tried.sort((p, q) => {
      const [x, y] = [place(p), place(q)];
      return x[0] - y[0] || (x[1] ?? -1) - (y[1] ?? -1);
    });
    let next: LayoutInput | null = null;
    for (const b of tried) {
      const [up, down] = [given(g, b, true), given(g, b, false)];
      const [u, d] = [canonicalWritten(up), canonicalWritten(down)];
      // (one text is one structure, whether the search finished or not: it writes the whole of it)
      if (u.text === d.text) {
        next = b.kind === "biaryl" ? { ...g, axes: g.axes!.filter((_, i) => i !== b.at) } : up;
        text = b.kind === "biaryl" ? undefined : u.complete ? u.text : undefined;
        break;
      }
      if (!u.complete || !d.complete) complete = false;
    }
    if (!next) return { input: g, complete, text: undefined };
    g = next;
  }
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
  const text = identityText(input);
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
