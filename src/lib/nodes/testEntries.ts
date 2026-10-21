/**
 * Entries for the nodes' tests: a structure of no consequence, with the
 * properties a test gives it.
 */
import { geometryKey, type By, type Entry, type EntryStereo, type Property, type StereoElement } from "../entry";
import type { Unit } from "../units";

const XYZ = [0, 0, 0, 0.96, 0, 0, -0.24, 0.93, 0];

/** A configuration perceived: none to speak of (no stereogenic element), unless `key` and `elements` say otherwise - as a plugin gives it. */
export const perceived = (key = "", elements: StereoElement[] = []): EntryStereo => ({
  perceived: true,
  elements,
  key,
  by: { plugin: "stereo", version: "1" },
});

/** An entry `id`, in `group` where one is given, with `properties` - its configuration perceived, with no stereogenic element, unless `stereo` says otherwise (`null`: not perceived). */
export function entry(id: string, properties: Record<string, Property>, group?: string, stereo: EntryStereo | null = perceived()): Entry {
  return {
    id,
    from: [],
    structure: { atoms: [{ el: "O" }, { el: "H" }, { el: "H" }], bonds: [{ a1: 0, a2: 1, order: 1 }, { a1: 0, a2: 2, order: 1 }] },
    geometry: { kind: "3d", xyz: XYZ },
    species: { charge: 0, multiplicity: 1, from: { charge: "atoms", multiplicity: "atoms" } },
    properties: { ...properties, ...(group != null ? { group: { value: group, unit: "none", status: "computed" } } : {}) },
    status: "done",
    ...(stereo ? { stereo } : {}),
  };
}

/** A number worked out at the test geometry, in `unit`, by `by`, at `kelvin` where given. */
export function quantity(value: number, unit: Unit | "none", by?: By, at?: { kelvin?: number; atm?: number; solvent?: string }): Property {
  return { value, unit, at: { geometry: geometryKey(XYZ), ...(at ?? {}) }, ...(by ? { by } : {}), status: "computed" };
}
