/**
 * A structure's identity and symmetry (docs/WORKFLOWS-FOUNDATION.md, PR 2),
 * from the canonical numbering of the core (perception/symmetry), which
 * Clean-up writes its layouts by too:
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
import { canonicalWritten, symmetryOrbits as orbitsAsDrawn } from "./perception/symmetry";
import { isMetal, type Arranged, type LayoutAtom, type LayoutBond, type LayoutInput } from "../layout/perceive";
import type { Axial, Cumulated, Tetrahedral } from "../layout/stereo";
import type { Radical } from "./molecule";
import { runsThrough } from "./perception/stereo/runs";
import { aromaticForm } from "./perception/aromatic";
import { blanksOf, filledIn, valuesOf } from "./perception/stereo/units";

// (identity's fill of what sets nothing: the core's, perception/stereo/units)
export { filledIn };

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
export type IdentityInput = { atoms: readonly IdentityAtom[]; bonds: readonly LayoutBond[]; axes?: readonly Axial[]; cumulated?: readonly Cumulated[]; arrangements?: readonly Arranged[] };

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
  const folded = foldedOf(input);
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
  // (the atom an axis's or a cumulene's end runs on through: its cumulated double bond's - perception/stereo/runs)
  const runsOn = (end: number) => runsThrough(around[end]) ?? -1;
  const axes = (input.axes ?? []).flatMap((x): Axial[] => {
    const refs = [...x.refs];
    let sense = x.sense;
    for (const k of [0, 1] as const) {
      if (!folded[refs[k]]) continue;
      // (the other end, a biaryl's; an allene's end runs on through its cumulated double bond)
      const end = x.atoms[k];
      const by = instead(end, refs[k], runsThrough(around[end], x.atoms[1 - k]) ?? -1);
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
  // (a metal's donors by their new places: no plain hydrogen is one - a hydride on a metal is kept)
  const arrangements = input.arrangements?.map((x) => ({ metal: at.get(x.metal)!, pairs: x.pairs.map(([p, q]) => [at.get(p)!, at.get(q)!] as const) }));
  return { atoms, bonds, ...(input.axes ? { axes } : {}), ...(input.cumulated ? { cumulated } : {}), ...(arrangements ? { arrangements } : {}) };
}

/** Which atoms `hydrogensFolded` folds in: each plain hydrogen (its own words). */
function foldedOf(input: IdentityInput): boolean[] {
  const around: { to: number; order: number }[][] = input.atoms.map(() => []);
  for (const b of input.bonds) {
    around[b.a].push({ to: b.b, order: b.order });
    around[b.b].push({ to: b.a, order: b.order });
  }
  const inPi = new Set(input.atoms.flatMap((a) => a.pi ?? []));
  const onAxis = new Set([...(input.axes ?? []), ...(input.cumulated ?? [])].flatMap((x) => x.atoms));
  return input.atoms.map((a, i) => {
    if (a.el !== "H" || a.charge || a.isotope || a.radical || a.mapped || a.hs || a.tetra || a.pi || inPi.has(i) || onAxis.has(i)) return false;
    if (around[i].length !== 1 || around[i][0].order !== 1) return false;
    const on = input.atoms[around[i][0].to];
    return on.el !== "H" && !isMetal(on.el);
  });
}

/**
 * Whether identity's fill leaves the arrangement of metal `m` - which of
 * its donors are across from each other - open: given none (any given for
 * it set aside), every other place filled as identity fills it, more than
 * one pairing that can be writes the structure differently. So the one
 * test of "not given" for identity and for the layout's mark "Which donors
 * are next to each other is not given": two donors alike next to the
 * metal can be different ligands further out ([Pt(NH2Me)2(NH2Et)2]2+'s,
 * [Co(NH2Me)4(NH2Et)2]3+'s), and only the whole structure tells. False
 * for an atom that is no metal of four or six donors, and where no pairing
 * can be (a tripod's).
 */
export function arrangementOpen(input: IdentityInput, m: number): boolean {
  // (asked again and again of one structure as a layout is measured - by its metrics and by its assembly, each building the
  //  structure its own way: worked out once, the key the same wherever the content is - fields in one order, none absent
  //  and none at its default told apart, the bonds in one order)
  const key = `${m}|${openKey(input)}`;
  const known = openKnown.get(key);
  if (known != null) return known;
  if (openKnown.size >= OPEN_KEPT) openKnown.clear();
  const open = openNow(input, m);
  openKnown.set(key, open);
  return open;
}
const openKnown = new Map<string, boolean>();
/** `input` written so that two inputs of one content write one text (`arrangementOpen`'s cache). */
function openKey(input: IdentityInput): string {
  const tidy = (o: object) =>
    Object.entries(o)
      .filter(([k, v]) => v !== undefined && !((k === "charge" || k === "hs") && v === 0))
      .sort(([p], [q]) => (p < q ? -1 : p > q ? 1 : 0));
  const bonds = input.bonds.map((b) => JSON.stringify(tidy(b))).sort();
  return JSON.stringify([input.atoms.map(tidy), bonds, input.axes ?? [], input.cumulated ?? [], input.arrangements ?? []]);
}
const OPEN_KEPT = 1024;

function openNow(input: IdentityInput, m: number): boolean {
  const others = { ...input, arrangements: (input.arrangements ?? []).filter((x) => x.metal !== m) };
  const folded = foldedOf(others);
  // (the metal's place once the plain hydrogens are folded in: none of them is it)
  const at = m - folded.slice(0, m).filter(Boolean).length;
  const g = compared(others);
  const blanks = blanksOf(g);
  if (!blanks.some((b) => b.kind === "metal" && b.at === at)) return false;
  const leftOpen = (h: LayoutInput) => {
    const filled = filledIn(h);
    return !(filled.input.arrangements ?? []).some((x) => x.metal === at) && !filled.settledMetals.includes(at);
  };
  if (leftOpen(g)) return true;
  // (two metals that set something only together - [Pd2Cl4(PMe3)2]'s cis and trans dimers - are filled in canonical order:
  //  the first alone sets nothing and is filled, the second is then left open. Each is asked alike: with another metal not
  //  given given each of its pairings in turn, is this one then left open. Up to `METALS_ASKED` others)
  const metals = blanks.filter((b) => b.kind === "metal" && b.at !== at);
  if (metals.length > METALS_ASKED) return false;
  return metals.some((b) => valuesOf(g, b).some(leftOpen));
}
/** How many other metals not given `arrangementOpen` sets in turn: more, and only the canonical order's fill is asked. */
const METALS_ASKED = 4;

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
 * bond-shift isomers, hydrogens folded in) and for the hand of an
 * octahedral centre, not yet told, which joins its enantiomers and, with
 * another such centre, its diastereomers (docs/WORKFLOWS-FOUNDATION.md).
 */
export function identity(input: IdentityInput): { text: string; complete: boolean } {
  const filled = filledIn(compared(input));
  if (filled.text != null) return { text: filled.text, complete: filled.complete };
  const found = canonicalWritten(filled.input);
  return { text: found.text, complete: found.complete && filled.complete };
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
