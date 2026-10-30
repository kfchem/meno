/**
 * *Compare bonding* (docs/WORKFLOWS-FOUNDATION.md, *Meno's own nodes*,
 * Structures): whether an entry's geometry is bonded as a reference is -
 * the same atoms in one numbering, atom by atom - and, where asked, whether
 * its stereocentres and double bonds have the reference's configuration.
 *
 * - **Bonds read from the geometry** as Meno reads every geometry given no
 *   bonds (`bondedPairs`, src/utils/structureParsers.ts): two atoms closer
 *   than their single-bond covalent radii (Pyykkö's) together, times the
 *   reach - 1.2 (`BOND_REACH`, the maintainer's of 2026-10-22, measured)
 *   unless the chemist sets another - and at least the floor over them,
 *   0.15 Å (`REACH_FLOOR`, the maintainer's of 2026-10-13) unless set.
 *   Which atoms are bonded is compared, not bond orders.
 * - **Configuration in the fixed numbering.** As the two share one
 *   numbering, a centre has the reference's configuration where its
 *   neighbours stand round it the same way: the sign of the volume their
 *   first three (by number) make about it, here and in the reference. A
 *   double bond is cis or trans as its first neighbours (by number) at each
 *   end stand, the dihedral between them under or over 90 degrees. With
 *   the same bonds, the same sign is the same R or S, the same E or Z.
 * - **Which atoms are stereocentres**, of the reference's structure: an atom
 *   with four neighbours, no two of them alike (in one symmetry orbit,
 *   src/lib/chem/identity.ts) - so a methylene's two hydrogens swapped are
 *   no difference. Which double bonds can be cis or trans: one whose ends
 *   each have one other neighbour, or two not alike. Three-coordinate
 *   centres (amines, phosphines, sulfoxides) are not compared.
 * - **Every centre by its atoms' numbers**, where asked: ConfoTS's check of
 *   a structure against its reference (its `check_chirality`, by ACCeL's
 *   `calc_stereo` labels by number), which also sees a methylene's two
 *   hydrogens, or a =CH2's, the other way round - no R or S, E or Z of
 *   theirs - as the reference's numbering would have them
 *   (`numberedCentres`).
 * - **Passed over**: atoms (from 0, as the entry numbers them), elements and
 *   bonds the chemist lists - a metal's
 *   coordination, say - in the bonds and in the configurations.
 * - Every difference is said: which bond, where it is read, at what
 *   distance; which centre or double bond.
 */
import type { Entry } from "../entry";
import { BOND_REACH, bondRadii, bondedPairs, bondingDistance, REACH_FLOOR } from "../../utils/structureParsers";
import { aromaticForm, symmetryOrbits } from "../chem/identity";
import { AROMATIC_BOND } from "../chem/kekulize";

export type PassOver = { atoms?: readonly number[]; elements?: readonly string[]; bonds?: readonly (readonly [number, number])[] };
/** What to compare: R or S, E or Z; what to pass over; and how far, times their covalent radii together, two atoms may stand and be bonded (`BOND_REACH` unless given). */
export type CompareOptions = { rs?: boolean; ez?: boolean; numbered?: boolean; passOver?: PassOver; reach?: number; floor?: number };
export type BondingCompared = { same: boolean; differences: string[] } | { failed: string };

type V = [number, number, number];
const at = (xyz: readonly number[], i: number): V => [xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const key = (p: number, q: number) => (p < q ? `${p}-${q}` : `${q}-${p}`);

/** The sign of the volume a centre's first three neighbours make about it. */
function handedness(xyz: readonly number[], c: number, n: readonly number[]): number {
  const o = at(xyz, c);
  return Math.sign(dot(cross(sub(at(xyz, n[0]), o), sub(at(xyz, n[1]), o)), sub(at(xyz, n[2]), o)));
}

/** Whether the first neighbours of a double bond's two ends stand cis: the dihedral between them under 90 degrees. */
function cis(xyz: readonly number[], a: number, p: number, q: number, b: number): boolean {
  const b1 = sub(at(xyz, p), at(xyz, a));
  const b2 = sub(at(xyz, q), at(xyz, p));
  const b3 = sub(at(xyz, b), at(xyz, q));
  return dot(cross(b1, b2), cross(b2, b3)) > 0;
}

/**
 * The centres ConfoTS's check reads by their atoms' numbers (its
 * `check_chirality`: ACCeL's `calc_stereo` with its labels by number, "nR"
 * or "nS", "nE" or "nZ" - an entry whose label differs from its
 * reference's at any atom is not the reference's), of a structure's bonds:
 * - **an atom of four neighbours**, each such atom: whether the volume its
 *   three highest-numbered neighbours make about its lowest-numbered is
 *   positive ("nS" there);
 * - **an atom of three with one double bond** - not an aromatic ring's, as
 *   Meno reads aromaticity (lib/chem/identity `aromaticForm`) - and a single
 *   one, where the atom across the double bond has two single bonds:
 *   whether its highest-numbered neighbour by a single bond and that atom's
 *   stand across the double bond from each other, their dihedral past 90
 *   degrees ("nE" there).
 * Not compared there, so not here: an end whose partner has one single
 * bond (an imine's carbon), an atom of two, an allene's ends.
 */
export function numberedCentres(structure: Entry["structure"]): { tetrahedral: { atom: number; atoms: [number, number, number, number] }[]; doubleEnds: { atom: number; atoms: [number, number, number, number] }[] } {
  const n = structure.atoms.length;
  const nbrs: number[][] = Array.from({ length: n }, () => []);
  for (const b of structure.bonds) {
    nbrs[b.a1].push(b.a2);
    nbrs[b.a2].push(b.a1);
  }
  // (each bond's order, an aromatic ring's as aromatic; a coordination bond as a single one, as ConfoTS reads bonds from the geometry)
  const form = aromaticForm({ atoms: structure.atoms.map((a) => ({ el: a.el })), bonds: structure.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.coordination ? 1 : b.order })) });
  const order = new Map(form.bonds.map((b) => [key(b.a, b.b), b.order === AROMATIC_BOND ? AROMATIC_BOND : b.order]));
  const by = (c: number, o: number) => nbrs[c].filter((x) => order.get(key(c, x)) === o);
  const highest = (xs: readonly number[]) => Math.max(...xs);
  const tetrahedral = nbrs.flatMap((ns, atom) => {
    if (ns.length !== 4) return [];
    const [a, b, c, d] = [...ns].sort((p, q) => q - p);
    return [{ atom, atoms: [a, b, c, d] as [number, number, number, number] }];
  });
  const doubleEnds = nbrs.flatMap((ns, atom) => {
    if (ns.length !== 3) return [];
    const doubles = by(atom, 2);
    const singles = by(atom, 1);
    if (doubles.length !== 1 || !singles.length) return [];
    const partner = doubles[0];
    const beyond = by(partner, 1);
    if (beyond.length !== 2) return [];
    return [{ atom, atoms: [highest(singles), atom, partner, highest(beyond)] as [number, number, number, number] }];
  });
  return { tetrahedral, doubleEnds };
}

/** "nS" at an atom of four, as ConfoTS reads it: the volume of its three highest-numbered neighbours about its lowest-numbered (`a`, `b`, `c` about `d`) positive. */
function numberedS(xyz: readonly number[], [a, b, c, d]: readonly number[]): boolean {
  const o = at(xyz, d);
  return dot(sub(at(xyz, a), o), cross(sub(at(xyz, b), o), sub(at(xyz, c), o))) > 0;
}

/** "nE" at a double bond's end, as ConfoTS reads it: the dihedral a-b=c-d past 90 degrees either way. */
function numberedE(xyz: readonly number[], [a, b, c, d]: readonly number[]): boolean {
  const cb = sub(at(xyz, c), at(xyz, b));
  return dot(cross(sub(at(xyz, a), at(xyz, b)), cb), cross(sub(at(xyz, d), at(xyz, c)), cb)) < 0;
}

/**
 * A structure's stereo units, by the rules above: its stereocentres (four
 * neighbours, no two in one symmetry orbit), each with its neighbours by
 * number; and its double bonds that can be cis or trans, each as the four
 * atoms whose dihedral tells which - the first neighbour (by number) at one
 * end, the two ends, the first neighbour at the other.
 */
export function stereoUnits(structure: Entry["structure"]): { centres: { atom: number; neighbours: number[] }[]; doubleBonds: [number, number, number, number][] } {
  const nbrs: number[][] = structure.atoms.map(() => []);
  for (const b of structure.bonds) {
    nbrs[b.a1].push(b.a2);
    nbrs[b.a2].push(b.a1);
  }
  for (const n of nbrs) n.sort((p, q) => p - q);
  const { orbit } = symmetryOrbits({
    atoms: structure.atoms.map((a) => ({ el: a.el, charge: a.charge, hs: 0 })),
    bonds: structure.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })),
  });
  const unlike = (xs: readonly number[]) => new Set(xs.map((x) => orbit[x])).size === xs.length;
  const centres = nbrs.flatMap((n, atom) => (n.length === 4 && unlike(n) ? [{ atom, neighbours: n }] : []));
  const doubleBonds: [number, number, number, number][] = [];
  for (const b of structure.bonds) {
    if (b.order !== 2) continue;
    const ends = [nbrs[b.a1].filter((y) => y !== b.a2), nbrs[b.a2].filter((y) => y !== b.a1)];
    if (ends.some((x) => x.length < 1 || x.length > 2 || (x.length === 2 && !unlike(x)))) continue;
    doubleBonds.push([ends[0][0], b.a1, b.a2, ends[1][0]]);
  }
  return { centres, doubleBonds };
}

/** How far two atoms of these radii together may stand and be bonded, in words: the reach, or the floor where it is the more (`bondingDistance`). */
const reachSaid = (radii: number, reach: number, floor: number) =>
  radii * reach >= radii + floor ? `${reach} times their covalent radii together` : `their covalent radii together and ${floor} Å over, more than ${reach} times them`;

export function comparedBonding(e: Entry, reference: Entry, o: CompareOptions = {}): BondingCompared {
  if (e.geometry.kind !== "3d") return { failed: e.geometry.kind === "frames" ? "The entry holds frames: take one frame first (Take frames)." : "The entry has no 3D places to read bonds from." };
  const atoms = e.structure.atoms;
  const ref = reference.structure.atoms;
  if (atoms.length !== ref.length) return { failed: `The entry has ${atoms.length} atoms and the reference ${ref.length}: both must hold the same atoms in one numbering.` };
  const bad = atoms.findIndex((a, i) => a.el !== ref[i].el);
  if (bad >= 0) return { failed: `Atom ${bad + 1} is ${atoms[bad].el} here and ${ref[bad].el} in the reference: both must hold the same atoms in one numbering.` };
  const xyz = e.geometry.xyz;
  const els = atoms.map((a) => a.el);
  const skipAtom = new Set(o.passOver?.atoms ?? []);
  const skipEl = new Set(o.passOver?.elements ?? []);
  const skipBond = new Set((o.passOver?.bonds ?? []).map(([p, q]) => key(p, q)));
  const passed = (p: number, q: number) => skipAtom.has(p) || skipAtom.has(q) || skipEl.has(els[p]) || skipEl.has(els[q]) || skipBond.has(key(p, q));

  const radii = bondRadii(els);
  const reach = o.reach ?? BOND_REACH;
  const floor = o.floor ?? REACH_FLOOR;
  const pairs = bondedPairs(xyz, radii, reach, floor);
  const here = new Set<string>();
  for (let k = 0; k < pairs.length; k += 2) here.add(key(pairs[k], pairs[k + 1]));
  const there = new Set(reference.structure.bonds.map((b) => key(b.a1, b.a2)));
  const differences: string[] = [];
  const d = (p: number, q: number) => Math.hypot(...sub(at(xyz, p), at(xyz, q)));
  const said = (p: number, q: number) => `${els[p]}${p + 1}-${els[q]}${q + 1}`;
  for (const b of reference.structure.bonds) {
    if (passed(b.a1, b.a2) || here.has(key(b.a1, b.a2))) continue;
    differences.push(`${said(b.a1, b.a2)} is bonded in the reference, not here: ${d(b.a1, b.a2).toFixed(2)} Å apart, past ${bondingDistance(radii[b.a1], radii[b.a2], reach, floor).toFixed(2)} Å (${reachSaid(radii[b.a1] + radii[b.a2], reach, floor)}).`);
  }
  for (let k = 0; k < pairs.length; k += 2) {
    const [p, q] = [pairs[k], pairs[k + 1]];
    if (passed(p, q) || there.has(key(p, q))) continue;
    differences.push(`${said(p, q)} is bonded here, not in the reference: ${d(p, q).toFixed(2)} Å apart, within ${bondingDistance(radii[p], radii[q], reach, floor).toFixed(2)} Å (${reachSaid(radii[p] + radii[q], reach, floor)}).`);
  }

  if (o.rs || o.ez || o.numbered) {
    if (reference.geometry.kind !== "3d") return { failed: "The reference has no 3D places: R or S, E or Z and centres by number cannot be compared with it." };
    const rxyz = reference.geometry.xyz;
    const units = stereoUnits(reference.structure);
    if (o.rs) {
      for (const { atom: c, neighbours: n } of units.centres) {
        if (skipAtom.has(c) || skipEl.has(els[c])) continue;
        const h = handedness(xyz, c, n);
        const r = handedness(rxyz, c, n);
        if (h !== r) differences.push(`${els[c]}${c + 1} has ${h === 0 ? "its neighbours in a plane" : "the other configuration"} from the reference's.`);
      }
    }
    if (o.ez) {
      for (const [a, p, q, b] of units.doubleBonds) {
        if (passed(p, q)) continue;
        const here = cis(xyz, a, p, q, b);
        const there = cis(rxyz, a, p, q, b);
        if (here !== there) differences.push(`The double bond ${said(p, q)} is ${here ? "cis" : "trans"} at ${said(a, b)} here and ${there ? "cis" : "trans"} in the reference.`);
      }
    }
    if (o.numbered) {
      // (each centre by its atoms' numbers - but one R or S, or E or Z, compares already: the same reading by number, not said twice)
      const centres = new Set(o.rs ? units.centres.map((u) => u.atom) : []);
      const doubles = new Set(o.ez ? units.doubleBonds.map(([, p, q]) => key(p, q)) : []);
      const { tetrahedral, doubleEnds } = numberedCentres(reference.structure);
      for (const { atom: c, atoms } of tetrahedral) {
        if (skipAtom.has(c) || skipEl.has(els[c]) || centres.has(c)) continue;
        if (numberedS(xyz, atoms) !== numberedS(rxyz, atoms)) differences.push(`${els[c]}${c + 1} has its neighbours, by their numbers, the other way round from the reference's.`);
      }
      for (const { atom: c, atoms } of doubleEnds) {
        const [a, , q, b] = atoms;
        if (passed(c, q) || doubles.has(key(c, q))) continue;
        const here = numberedE(xyz, atoms);
        const there = numberedE(rxyz, atoms);
        if (here !== there) differences.push(`At ${els[c]}${c + 1}, ${els[a]}${a + 1} and ${els[b]}${b + 1} stand ${here ? "trans" : "cis"} across the double bond ${said(c, q)} here and ${there ? "trans" : "cis"} in the reference.`);
      }
    }
  }
  return { same: differences.length === 0, differences };
}

/** Atoms typed from 1 ("3, 7-9"), as the entry numbers them from 0; or why they do not read. */
export function atomsFromOne(text: string): number[] | { why: string } {
  const out: number[] = [];
  for (const part of text.split(/[\s,]+/).filter(Boolean)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m || Number(m[1]) < 1 || (m[2] != null && Number(m[2]) < Number(m[1]))) return { why: `"${part}" is no atom number, from 1, or run of them (7-9)` };
    for (let n = Number(m[1]); n <= Number(m[2] ?? m[1]); n++) out.push(n - 1);
  }
  return out;
}

/** The first of the references an entry is bonded as (Compare bonding with each reference, naming the one it matches), or null where none. */
export function matchingReference(e: Entry, references: readonly Entry[], o: CompareOptions = {}): number | null {
  for (let i = 0; i < references.length; i++) {
    const r = comparedBonding(e, references[i], o);
    if (!("failed" in r) && r.same) return i;
  }
  return null;
}
