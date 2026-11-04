/**
 * *Restraints* and *Torsion restraints* (docs/WORKFLOWS-FOUNDATION.md,
 * *Meno's own nodes*, Structures; docs/STRUCTURE-STEPS.md): the restraints
 * a restrained minimisation holds a geometry to, as the property
 * `restraints` - rows of the entry record's `Restraint` (src/lib/entry.ts),
 * atoms from 0, each with its energy as the record states it. Restraints
 * are a label, not a value of a geometry (lib/entry `Property`): they name
 * no geometry, and ride through the steps after as they are.
 *
 * *Restraints*: each entry is its own reference - its bonds say which
 * restraints there are, its geometry the values they hold.
 * - **Coordination bonds** (a bond the entry marks as one) are kept at a
 *   factor of their atoms' van der Waals radii together - Alvarez's radii
 *   (src/lib/chem/elements.ts; S. Alvarez, Dalton Trans. 2013, 42, 8617).
 *   The factor and the strength are the chemist's: neither has a default.
 * - **Listed pairs of atoms** are kept at their distance in the entry.
 * - **Listed atoms** are fixed where they stand.
 *
 * *Torsion restraints*: each entry against a reference - the product it is
 * to become, in one numbering - each torsion across one of the reference's
 * double bonds that is trans there, and is not trans here, held at 180°;
 * its strength raised by a step each time, from what the entry already
 * holds. A torsion once held stays held, at the strength it reached.
 *
 * Nothing is left out quietly: an atom the entry has not, an element with
 * no van der Waals radius, or an entry with no 3D places fails it, with the
 * reason.
 */
import { elementOf } from "../chem/elements";
import { aromaticForm } from "../chem/identity";
import { AROMATIC_BOND } from "../chem/kekulize";
import type { Entry, Property, Restraint } from "../entry";
import { dihedral, distance } from "./measure";

/**
 * A distance's strength unless the chemist sets another, in kcal mol⁻¹ Å⁻²:
 * measured, on eight acid–base pairs held at 0.9 of their van der Waals
 * radii together (H3N…BH3, Me3N…BF3, H2O…BF3, Et2O…BF3, pyridine…BH3,
 * Me2O…AlCl3, Me3P…BH3, Me2CO…BF3): minimised by the RDKit plugin (ten
 * conformers each) it holds within 0.01 Å; by xtb 6.7.1, within 0.01 Å
 * under GFN-FF and within 0.02 Å under GFN2-xTB, whose pull on Me2O…AlCl3
 * is the strongest (docs/STRUCTURE-STEPS.md;
 * scripts/calc/measure_restraint_strengths.py measures it again).
 */
export const DISTANCE_STRENGTH = 500;

/**
 * What *Torsion restraints* adds to a torsion's strength each time unless
 * the chemist sets another, in kcal mol⁻¹ rad⁻²: measured, on six Z
 * isomers held towards their E isomers (but-2-ene, pent-2-ene, stilbene,
 * methyl crotonate, hexa-2,4-diene E,Z to E,E, crotononitrile; the RDKit
 * plugin's minimisation), to make each right in one round, held within
 * 1.5° (docs/STRUCTURE-STEPS.md; scripts/calc/measure_restraint_strengths.py
 * measures it again).
 */
export const TORSION_STEP = 50;

/** What *Restraints* is asked for: coordination bonds at a factor of their van der Waals radii together, pairs kept at their distance, atoms fixed - each distance held with `strength` (kcal mol⁻¹ Å⁻²). */
export type RestraintsAsked = {
  /** The factor coordination bonds are kept at, of their atoms' van der Waals radii together; none held where not given. */
  coordination?: number;
  /** Pairs of atoms (from 0) kept at their distance in the entry. */
  distances?: readonly (readonly [number, number])[];
  /** Atoms (from 0) fixed where they stand. */
  fixed?: readonly number[];
  /** Each distance's force constant, in kcal mol⁻¹ Å⁻²: what a distance needs. */
  strength?: number;
};

/** What restraints an entry was given, by kind, as a step's line counts them - and how many it held before of the kinds made here (distances, atoms fixed), now replaced, and of torsions, kept. */
export type RestraintsCount = { coordination: number; distances: number; fixed: number; replaced: number; torsionsKept: number };

type V = [number, number, number];
const at = (xyz: readonly number[], i: number): V => [xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]];

/** The restraints an entry already holds, or none. */
export function restraintsHeld(e: Pick<Entry, "properties">): Restraint[] {
  const v = e.properties.restraints?.value;
  return typeof v === "object" && v !== null && "restraints" in v ? v.restraints : [];
}

/**
 * Restraints from `e` itself (*Restraints*), or why there can be none. Of
 * what the entry held before, the kinds made here - distances, atoms fixed -
 * are replaced, and its torsions (*Torsion restraints*', with the strengths
 * they reached) kept, each counted.
 */
export function restraintsOf(e: Entry, o: RestraintsAsked): { property: Property; count: RestraintsCount } | { failed: string } {
  if (e.geometry.kind !== "3d") return { failed: e.geometry.kind === "frames" ? "It holds frames: take one frame first (Take frames)." : "It has no 3D places to take restraints from." };
  const xyz = e.geometry.xyz;
  const atoms = e.structure.atoms;
  const n = atoms.length;
  const missing = [...(o.distances ?? []).flat(), ...(o.fixed ?? [])].find((a) => !Number.isInteger(a) || a < 0 || a >= n);
  if (missing !== undefined) return { failed: `It has no atom ${missing + 1}: its atoms are 1 to ${n}.` };
  const strength = o.strength ?? NaN;
  if ((o.coordination != null || o.distances?.length) && !(strength > 0 && Number.isFinite(strength))) return { failed: "A distance held needs a strength above 0." };
  const before = restraintsHeld(e);
  const torsions = before.filter((r) => r.kind === "dihedral").map((r) => ({ ...r, atoms: [...r.atoms] }));
  const rows: Restraint[] = [...torsions];
  const count: RestraintsCount = { coordination: 0, distances: 0, fixed: 0, replaced: before.length - torsions.length, torsionsKept: torsions.length };
  if (o.coordination != null) {
    for (const b of e.structure.bonds) {
      if (!b.coordination) continue;
      const [ra, rb] = [atoms[b.a1].el, atoms[b.a2].el].map((el) => elementOf(el)?.vdw ?? null);
      if (ra == null || rb == null) return { failed: `No van der Waals radius is known for ${ra == null ? atoms[b.a1].el : atoms[b.a2].el}, so its coordination bond cannot be kept.` };
      rows.push({ kind: "distance", atoms: [b.a1, b.a2], value: o.coordination * (ra + rb), strength });
      count.coordination++;
    }
  }
  for (const [p, q] of o.distances ?? []) {
    rows.push({ kind: "distance", atoms: [p, q], value: distance(at(xyz, p), at(xyz, q)), strength });
    count.distances++;
  }
  // (atoms fixed are fixed: nothing to hold them to, nothing to hold them by)
  const fixed = [...new Set(o.fixed ?? [])];
  if (fixed.length) {
    rows.push({ kind: "fixed", atoms: fixed });
    count.fixed = fixed.length;
  }
  const was = e.properties.restraints?.value;
  const value = typeof was === "object" && was !== null && "restraints" in was ? { ...was, restraints: rows } : { restraints: rows };
  return { property: { value, unit: "none", status: "computed" }, count };
}

/**
 * The torsions a reference holds trans across its double bonds, each as
 * its four atoms (a neighbour, the two ends, a neighbour), in the order of
 * its bonds: each bond of order 2 that is not aromatic as Meno reads
 * aromaticity (lib/chem/identity `aromaticForm`: a bond on an alternating
 * cycle), each end with at least one other neighbour; each pair of the
 * ends' neighbours by single bonds - hydrogens among them - whose dihedral
 * there is over 90° either way. Cis ones are not taken: a ring's own
 * torsion across its double bond is cis, and its exocyclic ones trans.
 */
export function transTorsions(reference: Entry): [number, number, number, number][] {
  if (reference.geometry.kind !== "3d") return [];
  const xyz = reference.geometry.xyz;
  const { bonds } = reference.structure;
  const singly: number[][] = reference.structure.atoms.map(() => []);
  for (const b of bonds) {
    if (b.order !== 1 || b.coordination) continue;
    singly[b.a1].push(b.a2);
    singly[b.a2].push(b.a1);
  }
  const form = aromaticForm({
    atoms: reference.structure.atoms.map((a) => ({ el: a.el, charge: a.charge, hs: 0 })),
    bonds: bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })),
  });
  const out: [number, number, number, number][] = [];
  bonds.forEach((b, k) => {
    if (b.order !== 2 || b.coordination || form.bonds[k].order === AROMATIC_BOND) return;
    for (const p of [...singly[b.a1]].sort((x, y) => x - y))
      for (const q of [...singly[b.a2]].sort((x, y) => x - y))
        if (Math.abs(dihedral(at(xyz, p), at(xyz, b.a1), at(xyz, b.a2), at(xyz, q))) > 90) out.push([p, b.a1, b.a2, q]);
  });
  return out;
}

/** Two torsions as one: the same four atoms, either way round. */
const sameTorsion = (r: readonly number[], t: readonly number[]) => r.length === 4 && (r.every((a, i) => a === t[i]) || r.every((a, i) => a === t[3 - i]));

/** What *Torsion restraints* did to an entry: the torsions trans in the reference, those of them not trans here, those newly held, and those whose strength was raised. */
export type TorsionsCount = { trans: number; wrong: number; added: number; raised: number };

/**
 * `e`'s restraints with each torsion that is trans in `reference` and not
 * trans in `e` held at 180°, its strength (kcal mol⁻¹ rad⁻²)
 * `step` more than the entry held it at - `step` where it held it at none.
 * A torsion it holds already that is trans now stays as it was. The rest of
 * what it holds rides along. Or why it cannot be done.
 */
export function torsionsRestrained(e: Entry, reference: Entry, step: number): { property: Property; count: TorsionsCount } | { failed: string } {
  if (e.geometry.kind !== "3d") return { failed: e.geometry.kind === "frames" ? "It holds frames: take one frame first (Take frames)." : "It has no 3D places to compare torsions in." };
  if (reference.geometry.kind !== "3d") return { failed: "The reference has no 3D places, so which torsions are trans in it is not known." };
  const atoms = e.structure.atoms;
  const ref = reference.structure.atoms;
  if (atoms.length !== ref.length) return { failed: `It has ${atoms.length} atoms and the reference ${ref.length}: both must hold the same atoms in one numbering.` };
  const bad = atoms.findIndex((a, i) => a.el !== ref[i].el);
  if (bad >= 0) return { failed: `Atom ${bad + 1} is ${atoms[bad].el} here and ${ref[bad].el} in the reference: both must hold the same atoms in one numbering.` };
  const xyz = e.geometry.xyz;
  const rows = restraintsHeld(e).map((r) => ({ ...r, atoms: [...r.atoms] }));
  const trans = transTorsions(reference);
  const count: TorsionsCount = { trans: trans.length, wrong: 0, added: 0, raised: 0 };
  for (const t of trans) {
    if (Math.abs(dihedral(at(xyz, t[0]), at(xyz, t[1]), at(xyz, t[2]), at(xyz, t[3]))) > 90) continue;
    count.wrong++;
    const held = rows.find((r) => r.kind === "dihedral" && sameTorsion(r.atoms, t));
    if (held) {
      held.strength = (held.strength ?? 0) + step;
      held.value = 180;
      count.raised++;
    } else {
      rows.push({ kind: "dihedral", atoms: [...t], value: 180, strength: step });
      count.added++;
    }
  }
  const was = e.properties.restraints?.value;
  const value = typeof was === "object" && was !== null && "restraints" in was ? { ...was, restraints: rows } : { restraints: rows };
  return { property: { value, unit: "none", status: "computed" }, count };
}
