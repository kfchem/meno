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
import { canonicalWritten, symmetryClasses, symmetryOrbits as orbitsAsDrawn } from "../layout/canonical";
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
  const units = stereoUnitsOnly(compared(input));
  const found = canonicalWritten(units.input);
  return { text: found.text, complete: found.complete && units.complete };
}

/** A configuration a structure carries: a centre's, by its atom; a double bond's, by its bond; an axis's, by its place among the axes. */
type StereoUnit = { centre: number } | { bond: number } | { axis: number } | { cumulated: number };

/**
 * The structure with only the configurations that make a stereo unit: a
 * wedge on a centre two of whose neighbours are alike, or a double bond
 * drawn bent, an axis or an odd cumulene, whose end has its two other
 * neighbours alike (an allene's or a cumulene's, its groups but the run it
 * is on), sets nothing - an isopropyl's CH, a prenyl's C=C(CH3)2 - and is taken
 * out, so that the structure is one whether drawn so or not. Alike means
 * in one orbit of the structure with that configuration left out and
 * every other one kept, under the symmetries that keep the unit's own
 * atoms where they are: 1,4-dimethylcyclohexane's ring arms at one centre
 * are alike until the other centre's configuration is counted, and its cis
 * and trans stay apart. Each is tried in turn, again after each one taken
 * out, until none is. A search for the orbits that ran out of steps still
 * joins only atoms an automorphism found takes onto each other, so groups
 * it finds alike are; where it did not find them alike, the configuration
 * is kept, as drawn, and `complete` says so.
 */
export function stereoUnitsOnly(input: LayoutInput): { input: LayoutInput; complete: boolean } {
  const around: number[][] = input.atoms.map(() => []);
  const multiple = new Map<number, number>();
  for (const b of input.bonds) {
    around[b.a].push(b.b);
    around[b.b].push(b.a);
    if (b.order >= 2) {
      multiple.set(b.a, b.b);
      multiple.set(b.b, b.a);
    }
  }
  // (the groups whose two alike would set nothing: a centre's neighbours; each end's others, a double bond's or an
  // axis's - but the atom it runs on through: the other end, bonded to it, or an allene's or a cumulene's next one)
  const across = (end: number, other: number) => (around[end].includes(other) ? other : (multiple.get(end) ?? other));
  const ends = (a: number, b: number) => [around[a].filter((m) => m !== across(a, b)), around[b].filter((m) => m !== across(b, a))];
  const sides = (g: LayoutInput, u: StereoUnit): number[][] => {
    if ("centre" in u) return [g.atoms[u.centre].tetra!.neighbours.filter((m) => m >= 0)];
    if ("bond" in u) return ends(g.bonds[u.bond].a, g.bonds[u.bond].b);
    if ("axis" in u) return ends(...g.axes![u.axis].atoms);
    return ends(...g.cumulated![u.cumulated].atoms);
  };
  const alike = (of: readonly number[], side: readonly number[]) => new Set(side.map((m) => of[m])).size < side.length;
  const without = (g: LayoutInput, u: StereoUnit): LayoutInput => {
    if ("centre" in u) return { ...g, atoms: g.atoms.map((a, i) => (i === u.centre ? (({ tetra: _tetra, ...rest }) => rest)(a) : a)) };
    if ("bond" in u) return { ...g, bonds: g.bonds.map((b, i) => (i === u.bond ? (({ stereo: _stereo, ...rest }) => rest)(b) : b)) };
    if ("axis" in u) return { ...g, axes: g.axes!.filter((_, i) => i !== u.axis) };
    return { ...g, cumulated: g.cumulated!.filter((_, i) => i !== u.cumulated) };
  };
  let g = input;
  let complete = true;
  for (;;) {
    const units: StereoUnit[] = [
      ...g.atoms.flatMap((a, i) => (a.tetra ? [{ centre: i }] : [])),
      ...g.bonds.flatMap((b, i) => (b.stereo ? [{ bond: i }] : [])),
      ...(g.axes ?? []).map((_, i) => ({ axis: i })),
      ...(g.cumulated ?? []).map((_, i) => ({ cumulated: i })),
    ];
    if (!units.length) return { input: g, complete };
    // (atoms the ranks tell apart are apart in every orbit: only those they leave alike are searched)
    const classes = symmetryClasses(g);
    let next: LayoutInput | null = null;
    for (const u of units) {
      if (!sides(g, u).some((side) => alike(classes, side))) continue;
      const left = without(g, u);
      // (the unit's own atoms marked, for the search only: the orbits of what keeps it where it is, not of what takes it
      // onto another atom alike - 1,3-dichloro-2,4-dimethylcyclobutane's two CHCl, one open, swapped by a half turn)
      const own = new Set("centre" in u ? [u.centre] : "bond" in u ? [g.bonds[u.bond].a, g.bonds[u.bond].b] : "axis" in u ? g.axes![u.axis].atoms : g.cumulated![u.cumulated].atoms);
      const found = orbitsAsDrawn({ ...left, atoms: left.atoms.map((a, i) => (own.has(i) ? { ...a, el: `${a.el}*` } : a)) });
      if (sides(g, u).some((side) => alike(found.orbit, side))) {
        next = left;
        break;
      }
      if (!found.complete) complete = false;
    }
    if (!next) return { input: g, complete };
    g = next;
  }
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
