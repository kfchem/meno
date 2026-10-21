/**
 * The entry: one record for every molecule that flows through a workflow
 * (docs/WORKFLOWS-FOUNDATION.md, *The entry*, PR 1). Its structure in a
 * fixed numbering, its geometry, its species, an open map of properties -
 * each with its unit, the geometry it was worked out at and what worked it
 * out - its lineage as a record, and its status.
 *
 * The record is introduced here with the rules that hold it together; the
 * steps move onto it in the PRs after (collections, ports, the plugin
 * contract). Until then a workflow's entries are `SetEntry`, and
 * `entryOfSet` reads one as an entry.
 */
import type { Radical } from "./chem/molecule";
import type { Species } from "./io/writers";
import type { Unit } from "./units";

/** The entry's version, as a plugin is given it and a workspace keeps it: a reader refuses a version it does not know. */
export const ENTRY_SCHEMA = 1;

/** An atom in the entry's fixed numbering: its element, isotope, formal charge and radical. */
export type EntryAtom = { el: string; isotope?: number; charge?: number; radical?: Radical };
/**
 * A bond between two atoms by their number, from 0, with its order - and,
 * where it is a coordination bond (a ligand's donor to a metal, as drawn or
 * as a reader knows it), so: a restraint keeps such a bond as one, not as a
 * covalent bond of its order.
 */
export type EntryBond = { a1: number; a2: number; order: 1 | 2 | 3; coordination?: true };

/**
 * Where an entry's atoms are: none (a graph, as a generator may give), its
 * drawing's 2D, one 3D geometry, or frames - a path's, an ensemble's - each
 * its atoms' places in ångströms, x, y and z by atom in turn.
 */
export type Geometry =
  | { kind: "none" }
  | { kind: "2d"; xy: number[] }
  | { kind: "3d"; xyz: number[] }
  | { kind: "frames"; frames: number[][] };

/**
 * What a list's numbers are, one each: an atom in the entry's numbering, a
 * frame of its geometry, or a point of a curve. Every list says - three
 * atoms and three frames are otherwise one list.
 */
export type ListPer = "atom" | "frame" | "point";

/** A table's column: its name, and the unit of every number in it - from Meno's units table, or "none". */
export type Column = { name: string; unit: Unit | "none" };

/**
 * A restraint a step holds a geometry to: a distance between two atoms (in
 * ångströms), a dihedral of four (in degrees), or atoms fixed where they
 * are (no value); atoms by their number, from 0, as a bond's are. Its
 * strength is relative, 1 by default: each plugin turns it into a force
 * constant of its own and says its base constant, with its units, in
 * docs/PLUGINS.md.
 */
export type Restraint = { kind: "distance" | "dihedral" | "fixed"; atoms: number[]; value?: number; strength: number };

/**
 * A property's value: a number, a text, true or false, another entry's id,
 * a list (`per` atom, frame or point), a vector (a fingerprint), a small
 * table (one row per vibration or excited state, each column with its
 * unit), a vibration's modes (one row per mode, in its table's row order,
 * x, y and z by atom in turn - as the program gave them, their scale not
 * relied on), or restraints.
 */
export type PropertyValue =
  | number
  | string
  | boolean
  | { entry: string }
  | { list: number[]; per: ListPer }
  | { vector: number[] }
  | { table: { columns: Column[]; rows: (number | string | null)[][] } }
  | { modes: number[][] }
  | { restraints: Restraint[] };

/**
 * Where a property was worked out: the geometry (its key, `geometryKey`),
 * and the conditions, where they apply - the temperature (K) and pressure
 * (atm) as the program says it used them, never as a step asked; and the
 * solvent, named with its model as the program states them ("ALPB(water)",
 * "CPCM(water)"), compared as written. A plugin that used a solvent says
 * so: none said is the gas phase.
 */
export type At = { geometry: string; kelvin?: number; atm?: number; solvent?: string };

/**
 * What worked a property out: the step and its run; the plugin and its
 * version; the program, method and basis, or the model and its version;
 * and, for a thermal quantity (a free energy, an enthalpy), the treatment
 * of its vibrations, as the program says it (none said: not known).
 */
export type By = {
  step?: string;
  run?: string;
  plugin?: string;
  version?: string;
  program?: string;
  method?: string;
  basis?: string;
  model?: string;
  treatment?: string;
};

/** Whether a property was worked out: computed, failed (why), or not applicable (why). */
export type PropertyStatus = "computed" | { failed: string } | { notApplicable: string };

export type Property = {
  value: PropertyValue;
  /** For each number in it, a unit from Meno's units table, or "none" where it has none (a count, a share) - "none" for a table, whose columns carry their own, and for modes and restraints, whose units are theirs. */
  unit: Unit | "none";
  at?: At;
  by?: By;
  status: PropertyStatus;
};

/** An entry's status: done, failed (why), or set aside (why). */
export type EntryStatus = "done" | { failed: string } | { aside: string };

export type Entry = {
  /** Unique within its collection. */
  id: string;
  /** Its lineage, as a record: the entry or entries it was made from, by id. No matching reads it (question A). */
  from: string[];
  structure: { atoms: EntryAtom[]; bonds: EntryBond[] };
  geometry: Geometry;
  species: Species;
  properties: Record<string, Property>;
  status: EntryStatus;
};

/**
 * A geometry's key: its places to 1e-5 Å, hashed (FNV-1a, 32 bits, as hex).
 * Two properties worked out at the same places have the same key - the
 * same frame read back, a geometry copied - and those at another's, not.
 */
export function geometryKey(xyz: readonly number[]): string {
  let h = 0x811c9dc5;
  for (const v of xyz) {
    const text = (Math.round(v * 1e5) / 1e5).toFixed(5);
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= 0x2c;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * An entry's properties as one made from it starts with: all of them, each
 * still saying the geometry it was worked out at - so that an ID, a name or
 * a group reaches the steps after, and an energy of an earlier geometry is
 * never taken for one of the new (*Levels of theory stay apart*).
 */
export function ridingAlong(from: Entry): Record<string, Property> {
  return Object.fromEntries(Object.entries(from.properties).map(([k, p]) => [k, { ...p }]));
}

/** Whether properties were all worked out at one geometry - what a node that combines them (Add) asks first. A property of no geometry (an ID, a name) is of any. */
export function atOneGeometry(props: readonly Property[]): boolean {
  const keys = new Set(props.flatMap((p) => (p.at ? [p.at.geometry] : [])));
  return keys.size <= 1;
}

/** How many frames an entry's geometry has: a path's or an ensemble's, or one; none for a graph. */
export function frameCount(g: Geometry): number {
  return g.kind === "frames" ? g.frames.length : g.kind === "none" ? 0 : 1;
}

/** How many atoms a restraint of each kind holds: a distance two, a dihedral four, atoms fixed one or more. */
const RESTRAINT_ATOMS = { distance: 2, dihedral: 4 } as const;

/**
 * What is wrong with a property's value for `entry`, in a line; null where
 * nothing is. A list as long as what it is per - the entry's atoms, or its
 * frames; a table's rows each as wide as its columns; each mode three
 * numbers for each atom; each restraint's atoms in the entry, as many as
 * its kind holds, its value where its kind has one, its strength above 0.
 */
export function valueFault(value: PropertyValue, entry: Pick<Entry, "structure" | "geometry">): string | null {
  if (typeof value !== "object" || "entry" in value || "vector" in value) return null;
  const atoms = entry.structure.atoms.length;
  if ("list" in value) {
    if (value.per === "atom" && value.list.length !== atoms) return `A list per atom has ${value.list.length} values for ${atoms} atoms`;
    const frames = frameCount(entry.geometry);
    if (value.per === "frame" && value.list.length !== frames) return `A list per frame has ${value.list.length} values for ${frames} frames`;
    return null;
  }
  if ("table" in value) {
    const wide = value.table.columns.length;
    const k = value.table.rows.findIndex((r) => r.length !== wide);
    return k < 0 ? null : `Row ${k + 1} of a table has ${value.table.rows[k].length} cells for ${wide} columns`;
  }
  if ("modes" in value) {
    const k = value.modes.findIndex((m) => m.length !== 3 * atoms);
    return k < 0 ? null : `Mode ${k + 1} has ${value.modes[k].length} numbers for ${atoms} atoms`;
  }
  for (const [k, r] of value.restraints.entries()) {
    const n = r.kind === "fixed" ? null : RESTRAINT_ATOMS[r.kind];
    if (n != null ? r.atoms.length !== n : r.atoms.length < 1) return `Restraint ${k + 1}, a ${r.kind}, has ${r.atoms.length} atoms`;
    if (r.atoms.some((a) => !Number.isInteger(a) || a < 0 || a >= atoms)) return `Restraint ${k + 1} names an atom the entry does not have`;
    if (r.kind !== "fixed" && !Number.isFinite(r.value)) return `Restraint ${k + 1}, a ${r.kind}, has no value`;
    if (!(r.strength > 0)) return `Restraint ${k + 1} has a strength of ${r.strength}`;
  }
  return null;
}

