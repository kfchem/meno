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
import { isUnit, type Unit } from "./units";

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
 * A vibration's frequency, the column a table of vibrations (the property
 * `vibrations`) has first - named once, here, so that a step finds it where
 * a plugin wrote it: in cm-1, an imaginary one negative, as the programs
 * print them. A plugin adds after it what else its program gives, each
 * with its unit; the modes go in the property `modes`, in the same order.
 */
export const FREQUENCY: Column = { name: "frequency", unit: "cm-1" };

/**
 * A restraint a step holds a geometry to, atoms by their number, from 0, as
 * a bond's are - each its own energy, added to the force field's, as
 * docs/PLUGINS.md states it for every plugin that takes restraints:
 * - a **distance** between two atoms, `value` in ångströms, held by
 *   E = k d² / 2 (d its distance from the value), `strength` k in
 *   kcal mol⁻¹ Å⁻²;
 * - a **dihedral** of four atoms, `value` in degrees, held by
 *   E = k φ² / 2 (φ its angle from the value, the shorter way round, in
 *   radians), `strength` k in kcal mol⁻¹ rad⁻²;
 * - atoms **fixed** where they are: neither value nor strength.
 */
export type Restraint = { kind: "distance" | "dihedral" | "fixed"; atoms: number[]; value?: number; strength?: number };

/**
 * A property's value: a number, a text, true or false, another entry's id,
 * a list (`per` atom, frame or point), a vector (a fingerprint), a small
 * table (one row per vibration or excited state, each column with its
 * unit), a vibration's modes (one row per mode, in its table's row order,
 * x, y and z by atom in turn - as the program gave them, their scale not
 * relied on), or restraints - and the places they were first held at by a
 * minimisation (`start`, x, y and z by atom in turn), for a later one to
 * start from again.
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
  | { restraints: Restraint[]; start?: number[] };

/**
 * Where a property was worked out: the geometry (its key, `geometryKey`),
 * and the conditions, where they apply - the temperature (K) and pressure
 * (atm) as the program says it used them, never as a step asked; and the
 * solvent, named with its model as the program states them ("ALPB(water)",
 * "CPCM(water)"), or "none" where the program's own setup shows it used
 * none - the gas phase, stated, not assumed - compared as written. None
 * said is not stated: it matches nothing that is.
 */
export type At = { geometry: string; kelvin?: number; atm?: number; solvent?: string };

/**
 * What worked a property out: the step and its run; the plugin and its
 * version; the program, method and basis, or the model and its version;
 * and, for a thermal quantity (a free energy, an enthalpy), the treatment
 * of its vibrations, as the program says it (none said: not known), and
 * the symmetry it took - the point group and the rotational symmetry
 * number its rotational entropy counts, as the program printed them (none
 * printed: not known). They are the molecule's, not a way of working out:
 * two molecules' differ by right, so they never keep two values apart.
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
  pointGroup?: string;
  symmetryNumber?: number;
};

/** Whether a property was worked out: computed, failed (why), or not applicable (why). */
export type PropertyStatus = "computed" | { failed: string } | { notApplicable: string };

export type Property = {
  value: PropertyValue;
  /** For each number in it, a unit from Meno's units table, or "none" where it has none (a count, a share) - "none" for a table, whose columns carry their own, and for modes and restraints, whose units are theirs. */
  unit: Unit | "none";
  at?: At;
  /**
   * The structure it was worked out from, where it is a value of the
   * structure and not of a geometry - a descriptor's molar mass, its logP -
   * as its key (lib/steps/restructure `structureKey`). A step that changes
   * an entry's bonding (Re-bond) marks one whose structure is no longer the
   * entry's as not applicable, never shown as current. None on a value of a
   * geometry (`at`) or on a label (a Tag's ID, restraints).
   */
  of?: string;
  by?: By;
  status: PropertyStatus;
  /**
   * What it is the sum of, where a step summed it (*Add*): each part as it
   * was - the property it was, its value, unit, and where and by what it
   * was worked out - so that a sum of values of several levels says each
   * one's, never one level for the whole (a free energy: a single point's
   * energy, a thermal correction of another level, a standard-state term).
   */
  parts?: PropertyPart[];
  /**
   * Where it is a value of a group, not of one geometry - an ensemble's
   * free energy over its conformers (*Ensemble energy*) - how many members
   * it is over: its geometry (`at`) is its representative's, and its parts
   * each member's value.
   */
  ensemble?: { of: number };
};

/** One part of a sum or an ensemble (`Property.parts`): the property it was, as it was - with its own parts, where it was a sum itself, one level down. */
export type PropertyPart = { property: string; value: number; unit: Unit | "none"; at?: At; by?: By; parts?: PropertyPart[] };

/**
 * An element of an entry that could be stereogenic: a centre (its atom), a
 * double bond, an axis or a cumulene (its two atoms), or another kind (a
 * metal's centre), by atom number from 0; and whether its configuration is
 * given - from a geometry in 3D, every element it fixes.
 */
export type StereoElement = { kind: "centre" | "double" | "axis" | "cumulene" | "other"; atoms: number[]; specified: boolean };

/**
 * Which stereoisomer an entry is, as the plugin that perceives
 * configurations found it from the entry's own geometry: its elements that
 * could be stereogenic - none, for a molecule with no stereo - and a key,
 * the same for two entries exactly when they are one stereoisomer, as that
 * plugin's version makes it. Or not perceived, and why: no plugin to
 * perceive it, or one that could not read the molecule. Not perceived is
 * neither "no stereo" nor "unspecified".
 */
export type EntryStereo = { perceived: true; elements: StereoElement[]; key: string; by: By } | { perceived: false; why: string };

/**
 * Which stereoisomer an entry is, as one text that two entries share
 * exactly when they are one: the key, with the plugin and version that made
 * it - keys of two versions are not compared - as a JSON list, so that no
 * two of them run together into one text. None where it is not known: not
 * perceived, an element left unspecified, which matches nothing - not even
 * another unspecified one - or no plugin or version said, for a key no one
 * vouches for. CIP labels are never in it.
 */
export function stereoIdentity(stereo: EntryStereo | undefined): string | null {
  if (!stereo?.perceived || stereo.elements.some((e) => !e.specified)) return null;
  if (!stereo.by.plugin || !stereo.by.version) return null;
  return JSON.stringify([stereo.by.plugin, stereo.by.version, stereo.key]);
}

/** An entry's status: done, failed (why), or set aside (why). */
export type EntryStatus = "done" | { failed: string } | { aside: string };

export type Entry = {
  /** Unique within its collection. */
  id: string;
  /** Its lineage, as a record: the entry or entries it was made from, by id. No matching reads it (question A). */
  from: string[];
  structure: { atoms: EntryAtom[]; bonds: EntryBond[] };
  geometry: Geometry;
  /** Its charge and spin multiplicity (lib/io/writers `speciesOf`); none for a skeleton, its hydrogens not there (lib/chem/skeleton). */
  species: Species | null;
  properties: Record<string, Property>;
  /** Which stereoisomer it is; absent until perceived. */
  stereo?: EntryStereo;
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
 * its kind holds, and its value and a strength above 0 where its kind has
 * them (atoms fixed have neither).
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
  if (value.start && (value.start.length !== 3 * atoms || !value.start.every(Number.isFinite))) return `Where the restraints were first held has ${value.start.length} numbers for ${atoms} atoms`;
  for (const [k, r] of value.restraints.entries()) {
    const n = r.kind === "fixed" ? null : RESTRAINT_ATOMS[r.kind];
    if (n != null ? r.atoms.length !== n : r.atoms.length < 1) return `Restraint ${k + 1}, a ${r.kind}, has ${r.atoms.length} atoms`;
    if (r.atoms.some((a) => !Number.isInteger(a) || a < 0 || a >= atoms)) return `Restraint ${k + 1} names an atom the entry does not have`;
    if (r.kind === "fixed") {
      if (r.value != null || r.strength != null) return `Restraint ${k + 1} fixes atoms, so it has neither value nor strength`;
      continue;
    }
    if (!Number.isFinite(r.value)) return `Restraint ${k + 1}, a ${r.kind}, has no value`;
    if (!(r.strength! > 0) || !Number.isFinite(r.strength)) return `Restraint ${k + 1} has a strength of ${r.strength}`;
  }
  return null;
}


const BY_FIELDS = ["step", "run", "plugin", "version", "program", "method", "basis", "model", "treatment", "pointGroup"] as const;

/**
 * A table of numbers as a file gives one, read back: its columns, each a
 * name and a unit; its rows, each a finite number for each column - as a
 * conformer carries its vibrations (workflow/entries `calcProperties`).
 * None where any of that does not read.
 */
function numberTableIn(v: unknown): PropertyValue | undefined {
  const t = (v as { table?: unknown } | null)?.table as { columns?: unknown; rows?: unknown } | undefined;
  if (!t || typeof t !== "object" || !Array.isArray(t.columns) || !Array.isArray(t.rows) || !t.columns.length) return undefined;
  const columns: Column[] = [];
  for (const c of t.columns as unknown[]) {
    const { name, unit } = (c ?? {}) as { name?: unknown; unit?: unknown };
    if (typeof name !== "string" || !name || !(unit === "none" || (typeof unit === "string" && isUnit(unit)))) return undefined;
    columns.push({ name, unit: unit as Unit | "none" });
  }
  const wide = columns.length;
  const isRow = (r: unknown): r is number[] => Array.isArray(r) && r.length === wide && r.every((x) => typeof x === "number" && Number.isFinite(x));
  if (!(t.rows as unknown[]).every(isRow)) return undefined;
  return { table: { columns, rows: (t.rows as number[][]).map((r) => [...r]) } };
}

/**
 * Restraints as a file gives them, read back (`Restraint`) - and where a
 * minimisation first held them (`start`), each a finite number: each row a
 * distance, a dihedral or atoms fixed, as many atoms as its kind holds,
 * each a whole number from 0, a
 * finite value and a strength above 0 where its kind has them, none where
 * it has not. None where any row does not read - nothing held in part.
 * Whether its atoms are the entry's is `valueFault`'s, as for any value.
 */
function restraintsIn(v: unknown): { restraints: Restraint[]; start?: number[] } | undefined {
  const rows = (v as { restraints?: unknown } | null)?.restraints;
  const start = (v as { start?: unknown } | null)?.start;
  if (start != null && (!Array.isArray(start) || !start.every((x) => typeof x === "number" && Number.isFinite(x)))) return undefined;
  if (!Array.isArray(rows)) return undefined;
  const out: Restraint[] = [];
  for (const r of rows as { kind?: unknown; atoms?: unknown; value?: unknown; strength?: unknown }[]) {
    if (!r || typeof r !== "object" || (r.kind !== "distance" && r.kind !== "dihedral" && r.kind !== "fixed")) return undefined;
    if (!Array.isArray(r.atoms) || !r.atoms.length || !r.atoms.every((a) => Number.isInteger(a) && (a as number) >= 0)) return undefined;
    // (as many atoms as its kind holds: a distance two, a dihedral four, atoms fixed one or more)
    if (r.kind !== "fixed" && r.atoms.length !== RESTRAINT_ATOMS[r.kind]) return undefined;
    if (r.kind === "fixed") {
      if (r.value != null || r.strength != null) return undefined;
      out.push({ kind: "fixed", atoms: [...(r.atoms as number[])] });
      continue;
    }
    if (typeof r.value !== "number" || !Number.isFinite(r.value) || typeof r.strength !== "number" || !Number.isFinite(r.strength) || !(r.strength > 0)) return undefined;
    out.push({ kind: r.kind, atoms: [...(r.atoms as number[])], value: r.value, strength: r.strength });
  }
  return { restraints: out, ...(start != null ? { start: [...(start as number[])] } : {}) };
}

/**
 * A property as a file or a plugin gives it, read back: its value - a
 * number, a text, true or false, a table of numbers (`numberTableIn`), or
 * restraints (`restraintsIn`) -
 * its unit, what worked it out and where (each field a text, a temperature
 * and a pressure numbers), and whether it was. None where any of that does
 * not read, or its value is of another kind - a list, a table of other
 * cells, modes - which a molecule on the page does not keep as a property.
 * (A workspace saved before restraints were read back kept them only until
 * it was opened again.)
 */
export function propertyIn(v: unknown): Property | undefined {
  const p = v as { value?: unknown; unit?: unknown; at?: unknown; of?: unknown; by?: unknown; status?: unknown; parts?: unknown; ensemble?: unknown } | null;
  if (!p || typeof p !== "object") return undefined;
  const value: PropertyValue | undefined =
    (typeof p.value === "number" && Number.isFinite(p.value)) || typeof p.value === "string" || typeof p.value === "boolean"
      ? p.value
      : typeof p.value === "object" && p.value !== null && "restraints" in p.value
        ? restraintsIn(p.value)
        : numberTableIn(p.value);
  if (value === undefined) return undefined;
  if (!(p.unit === "none" || (typeof p.unit === "string" && isUnit(p.unit)))) return undefined;
  const st = p.status as { failed?: unknown; notApplicable?: unknown } | string | null | undefined;
  const status: PropertyStatus | undefined =
    st === "computed" ? "computed" : typeof st === "object" && st ? (typeof st.failed === "string" ? { failed: st.failed } : typeof st.notApplicable === "string" ? { notApplicable: st.notApplicable } : undefined) : undefined;
  if (!status) return undefined;
  const by = byIn(p.by);
  const at = atIn(p.at);
  if (by === null || at === null) return undefined;
  if (p.of != null && typeof p.of !== "string") return undefined;
  // (a sum's parts, or an ensemble's: each as it was, or none of them - one whose parts do not all read is not read without them)
  const parts = p.parts != null ? partsIn(p.parts, 1) : undefined;
  if (parts === null) return undefined;
  let ensemble: { of: number } | undefined;
  if (p.ensemble != null) {
    const of = (p.ensemble as { of?: unknown }).of;
    if (typeof of !== "number" || !Number.isInteger(of) || of < 1) return undefined;
    ensemble = { of };
  }
  return { value, unit: p.unit as Unit | "none", ...(at ? { at } : {}), ...(typeof p.of === "string" ? { of: p.of } : {}), ...(by ? { by } : {}), status, ...(parts ? { parts } : {}), ...(ensemble ? { ensemble } : {}) };
}

/** A sum's or an ensemble's parts as a file gives them, read back: each as it was, with its own parts `deeper` levels down at most; null where any does not read, or there are none. */
function partsIn(v: unknown, deeper: number): PropertyPart[] | null {
  if (!Array.isArray(v) || !v.length) return null;
  const parts: PropertyPart[] = [];
  for (const raw of v as unknown[]) {
    const q = raw as { property?: unknown; value?: unknown; unit?: unknown; at?: unknown; by?: unknown; parts?: unknown } | null;
    if (!q || typeof q.property !== "string" || !q.property || typeof q.value !== "number" || !Number.isFinite(q.value)) return null;
    if (!(q.unit === "none" || (typeof q.unit === "string" && isUnit(q.unit)))) return null;
    const qBy = byIn(q.by);
    const qAt = atIn(q.at);
    if (qBy === null || qAt === null) return null;
    const inner = q.parts != null ? (deeper > 0 ? partsIn(q.parts, deeper - 1) : null) : undefined;
    if (inner === null) return null;
    parts.push({ property: q.property, value: q.value, unit: q.unit as Unit | "none", ...(qAt ? { at: qAt } : {}), ...(qBy ? { by: qBy } : {}), ...(inner ? { parts: inner } : {}) });
  }
  return parts;
}

/** What worked a value out, as a file gives it, read back: each field a text; none where none is given; null where it does not read. */
function byIn(v: unknown): By | undefined | null {
  if (v == null) return undefined;
  const b = v as Record<string, unknown>;
  if (typeof b !== "object" || BY_FIELDS.some((f) => b[f] != null && typeof b[f] !== "string")) return null;
  // (a symmetry number: a whole number, 1 or more)
  const sigma = b.symmetryNumber;
  if (sigma != null && !(typeof sigma === "number" && Number.isInteger(sigma) && sigma >= 1)) return null;
  return { ...Object.fromEntries(BY_FIELDS.flatMap((f) => (typeof b[f] === "string" ? [[f, b[f]]] : []))), ...(sigma != null ? { symmetryNumber: sigma as number } : {}) };
}

/** Where a value was worked out, as a file gives it, read back: its geometry's key, a temperature and pressure, a solvent; none where none is given; null where it does not read. */
function atIn(v: unknown): At | undefined | null {
  if (v == null) return undefined;
  const a = v as { geometry?: unknown; kelvin?: unknown; atm?: unknown; solvent?: unknown };
  if (typeof a !== "object" || typeof a.geometry !== "string") return null;
  if ((a.kelvin != null && !Number.isFinite(a.kelvin)) || (a.atm != null && !Number.isFinite(a.atm)) || (a.solvent != null && typeof a.solvent !== "string")) return null;
  return { geometry: a.geometry, ...(a.kelvin != null ? { kelvin: a.kelvin as number } : {}), ...(a.atm != null ? { atm: a.atm as number } : {}), ...(a.solvent != null ? { solvent: a.solvent as string } : {}) };
}

/** Properties by name as a file or a plugin gives them, read back (`propertyIn`): those that read; none where none do. */
export function propertiesIn(v: unknown): Record<string, Property> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out = Object.fromEntries(Object.entries(v as Record<string, unknown>).flatMap(([k, p]) => (k && propertyIn(p) ? [[k, propertyIn(p)!]] : [])));
  return Object.keys(out).length ? out : undefined;
}
