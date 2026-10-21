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
/** A bond between two atoms by their number, from 0, with its order. */
export type EntryBond = { a1: number; a2: number; order: 1 | 2 | 3 };

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

/** A property's value: a number, a text, true or false, another entry's id, a list (per atom in the numbering, or a curve's points), a vector (a fingerprint), or a small table (one row per vibration or excited state). */
export type PropertyValue =
  | number
  | string
  | boolean
  | { entry: string }
  | { list: number[] }
  | { vector: number[] }
  | { table: { columns: string[]; rows: (number | string | null)[][] } };

/** Where a property was worked out: the geometry (its key, `geometryKey`), and the conditions, where they apply. */
export type At = { geometry: string; kelvin?: number; atm?: number; solvent?: string };

/**
 * What worked a property out: the step and its run; the plugin and its
 * version; the program, method and basis, or the model and its version; and,
 * for a thermal quantity (a free energy), its thermal treatment as the
 * program states it - two programs' free energies differ in how they treat
 * low vibrations, even of one geometry at one temperature.
 */
export type By = { step?: string; run?: string; plugin?: string; version?: string; program?: string; method?: string; basis?: string; model?: string; treatment?: string };

/** Whether a property was worked out: computed, failed (why), or not applicable (why). */
export type PropertyStatus = "computed" | { failed: string } | { notApplicable: string };

export type Property = {
  value: PropertyValue;
  /** For each number in it, a unit from Meno's units table, or "none" where it has none (a count, a share). */
  unit: Unit | "none";
  at?: At;
  by?: By;
  status: PropertyStatus;
};

/**
 * A stereogenic element of an entry - a centre, a double bond, an axis, a
 * cumulene - by its atoms in the fixed numbering; specified where its
 * configuration is known (from 3D, every element the geometry fixes is),
 * unspecified where a 2D drawing leaves it open.
 */
export type StereoElement = { kind: "centre" | "double" | "axis" | "cumulene" | "other"; atoms: number[]; specified: boolean };

/**
 * An entry's configuration, as a plugin perceived it: its stereogenic
 * elements and a key of their configuration, and what perceived them - "no
 * stereo" is perceived, with no elements; or why it was not perceived.
 */
export type EntryStereo = { perceived: true; elements: StereoElement[]; key: string; by: By } | { perceived: false; why: string };

/**
 * An entry's configuration as one text, to compare two entries by: what
 * perceived it (its plugin and version - keys of different versions never
 * compare equal) and its key. None where it was not perceived, or where any
 * element is unspecified: such an entry's configuration is not known.
 */
export function stereoIdentity(stereo: EntryStereo | undefined): string | null {
  if (!stereo || !stereo.perceived || stereo.elements.some((e) => !e.specified)) return null;
  return `${stereo.by.plugin}@${stereo.by.version}:${stereo.key}`;
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
  species: Species;
  properties: Record<string, Property>;
  status: EntryStatus;
  /** Its configuration, once perceived (`EntryStereo`); absent until then. */
  stereo?: EntryStereo;
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
