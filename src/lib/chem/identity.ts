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
 * configuration as drawn; aromatic rings as one form (`aromaticForm`); a
 * plain hydrogen atom as one of its neighbour's hydrogens
 * (`hydrogensFolded`); and the end chalcogens on P, As, Sb, S, Se and Te
 * as one form, whichever is drawn double or charged
 * (perception/chalcogenEnds); and, where centres are drawn in AND or OR
 * groups, the stereoisomers the drawing stands for (`grouped`).
 */
import { canonicalWritten, symmetryOrbits as orbitsAsDrawn } from "./perception/symmetry";
import { type Arranged, type LayoutAtom, type LayoutBond, type LayoutInput } from "../layout/perceive";
import type { Axial, Cumulated } from "../layout/stereo";
import type { Radical } from "./molecule";
import { aromaticForm } from "./perception/aromatic";
import { hydrogensFolded, metalHydrogensDrawn, plainHydrogenAtoms } from "./perception/fold";
import { endsShared, unchargedEnds } from "./perception/chalcogenEnds";
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
export type IdentityInput = {
  atoms: readonly IdentityAtom[];
  bonds: readonly LayoutBond[];
  axes?: readonly Axial[];
  cumulated?: readonly Cumulated[];
  arrangements?: readonly Arranged[];
  /** Its centres drawn in AND or OR groups (`IdentityGroup`); a centre in none is drawn absolute. */
  groups?: readonly IdentityGroup[];
};

/**
 * Centres whose configurations are drawn as one group (V3000's enhanced stereo, docs/WORKFLOWS-FOUNDATION.md): "and", a mixture of
 * the configurations drawn and those all turned over together (a racemate, where they are all its centres); "or", one or the other,
 * not known which. Each by its place among the input's atoms; two groups of a kind are two groups, told apart.
 */
export type IdentityGroup = { kind: "and" | "or"; atoms: readonly number[] };

// (a structure's plain hydrogens folded into the atoms they are on, configurations carried: the core's one fold)
export { hydrogensFolded };

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
  const folded = plainHydrogenAtoms(others);
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
 * part of what it is, its end chalcogens on P, As, Sb, S, Se and Te in
 * their uncharged form (`unchargedEnds`), its aromatic form
 * (`aromaticForm`), and those ends sharing their double bonds, charges and
 * hydrogens (`endsShared`) - perception/chalcogenEnds.
 */
function compared(input: IdentityInput): LayoutInput {
  // (its groups are identity's to write: `grouped`)
  const { groups: _groups, ...drawn } = input;
  // (a metal's hydrogens counted on it drawn as the atoms they are, as a hydride drawn is kept: [PdH]Cl2 is Cl2Pd-H)
  const folded = hydrogensFolded(metalHydrogensDrawn(drawn));
  const atoms = folded.atoms.map(({ isotope, radical, mapped: _mapped, ...a }) => ({ ...a, el: `${a.el}${isotope ? `^${isotope}` : ""}${radical ? `.${radical}` : ""}` }));
  return endsShared(aromaticForm(unchargedEnds({ ...folded, atoms })));
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
  const g = compared(input);
  return input.groups?.length ? grouped(g, input) : written(g);
}

/** A structure as identity compares it (`compared`), its configurations filled in (`filledIn`) and written in its own order. */
function written(g: LayoutInput): { text: string; complete: boolean } {
  const filled = filledIn(g);
  if (filled.text != null) return { text: filled.text, complete: filled.complete };
  const found = canonicalWritten(filled.input);
  return { text: found.text, complete: found.complete && filled.complete };
}

/** A configuration given in identity's input: a centre's by its atom, a double bond's by its bond, an axis's or an odd cumulene's by its place in its list. */
export type GivenPlace = { kind: "centre" | "bond" | "axis" | "cumulated"; at: number };

/**
 * Which configurations given in `input` set something - its units (foundation part 13): turned over, the structure writes
 * another identity. One that sets nothing (a wedge at an isopropyl's CH, a cis or trans drawn on a CH=C(CH3)2) writes the
 * same. The structure as drawn is written once,
 * on the first ask; each ask writes it turned. Where a search was not complete two texts may be one structure, so a place is
 * then taken to set something: never the other way.
 */
export function unitsOf(input: IdentityInput): (place: GivenPlace) => boolean {
  let drawn: string | null = null;
  return (place) => {
    const turned = turnedAt(input, place);
    if (!turned) return false;
    drawn ??= identity(input).text;
    return identity(turned).text !== drawn;
  };
}

/** `input` with the configuration at `place` turned over, or null where none is given there. */
function turnedAt(input: IdentityInput, place: GivenPlace): IdentityInput | null {
  const at = place.at;
  if (place.kind === "centre") {
    const t = input.atoms[at]?.tetra;
    return t ? { ...input, atoms: input.atoms.map((a, i) => (i === at ? { ...a, tetra: { ...t, volume: t.volume > 0 ? -1 : 1 } } : a)) } : null;
  }
  if (place.kind === "bond") {
    const st = input.bonds[at]?.stereo;
    return st ? { ...input, bonds: input.bonds.map((b, i) => (i === at ? { ...b, stereo: { ...st, cis: !st.cis } } : b)) } : null;
  }
  if (place.kind === "axis") {
    const x = input.axes?.[at];
    return x ? { ...input, axes: input.axes!.map((y, i) => (i === at ? { ...y, sense: x.sense > 0 ? -1 : 1 } : y)) } : null;
  }
  const c = input.cumulated?.[at];
  return c ? { ...input, cumulated: input.cumulated!.map((y, i) => (i === at ? { ...y, cis: !c.cis } : y)) } : null;
}

/**
 * The identity of a structure with centres drawn in AND or OR groups (`IdentityGroup`; foundation part 13, its first asker), as
 * the stereoisomers it stands for. Each group's centres as drawn or all turned over together: an AND group's two in the
 * mixture, an OR group's one or the other, not known which. So it is written as the ways it may be - each OR group as drawn
 * or turned over - each with the identities (`written`) of the stereoisomers in it, every AND group as drawn and turned over:
 * the same text for every drawing of the same stereoisomers, whichever hand is drawn, whichever centre a group holds and
 * however the groups are numbered. A racemate, one or the other and the drawn absolute are three structures; a group whose
 * turning over writes the structure as drawn (a meso form's two centres, a centre that sets nothing) says nothing, and the
 * structure is written as it would be without it. A centre with no configuration drawn is in no group. Past `GROUP_WRITINGS`
 * stereoisomers to write, the structure as drawn, said not complete.
 */
function grouped(g: LayoutInput, input: IdentityInput): { text: string; complete: boolean } {
  // (each atom's place once its plain hydrogens are folded in: none of them is in a group, as none carries a configuration)
  const folded = plainHydrogenAtoms(input);
  const place: number[] = [];
  let k = 0;
  for (let i = 0; i < input.atoms.length; i++) place.push(folded[i] ? -1 : k++);
  const seen = new Set<number>();
  const groups = (input.groups ?? [])
    .map((x) => ({
      kind: x.kind,
      atoms: [...new Set(x.atoms)].flatMap((i) => {
        const at = place[i] ?? -1;
        if (at < 0 || !g.atoms[at]?.tetra || seen.has(at)) return [];
        seen.add(at);
        return [at];
      }),
    }))
    .filter((x) => x.atoms.length);
  const ors = groups.filter((x) => x.kind === "or");
  const ands = groups.filter((x) => x.kind === "and");
  if (2 ** groups.length > GROUP_WRITINGS) return { ...written(g), complete: false };
  let complete = true;
  const ways = new Set<string>();
  for (let or = 0; or < 2 ** ors.length; or++) {
    const texts = new Set<string>();
    for (let and = 0; and < 2 ** ands.length; and++) {
      const over = [...ors.flatMap((x, b) => (or & (1 << b) ? x.atoms : [])), ...ands.flatMap((x, b) => (and & (1 << b) ? x.atoms : []))];
      const w = written(turned(g, over));
      complete &&= w.complete;
      texts.add(w.text);
    }
    ways.add(JSON.stringify([...texts].sort()));
  }
  // (one way, one stereoisomer: the structure as it would be written with no group)
  if (ways.size === 1) {
    const only: string[] = JSON.parse([...ways][0]);
    if (only.length === 1) return { text: only[0], complete };
  }
  return { text: `stereoisomers ${JSON.stringify([...ways].sort().map((w) => JSON.parse(w)))}`, complete };
}

/** How many stereoisomers `grouped` writes at most - two to the power of the groups: past it, the structure as drawn only. */
export const GROUP_WRITINGS = 256;

/** `g` with the centres at `atoms` turned over. */
function turned(g: LayoutInput, atoms: readonly number[]): LayoutInput {
  const over = new Set(atoms);
  return { ...g, atoms: g.atoms.map((a, i) => (over.has(i) && a.tetra ? { ...a, tetra: { ...a.tetra, volume: a.tetra.volume > 0 ? -1 : 1 } } : a)) };
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
