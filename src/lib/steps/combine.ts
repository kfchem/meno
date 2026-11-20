/**
 * *Combine* (docs/WORKFLOWS-FOUNDATION.md, *Meno's own nodes*, Structures):
 * the entries that come in as one entry holding them all - a complex -
 * numbered in their order, the first's atoms first. Each part stays where it
 * stands; none is moved.
 *
 * - **Geometry.** All in 3D, or all drawn in 2D, or all without places; a
 *   part with frames, or parts of mixed kinds, are not combined, and the
 *   reason is said.
 * - **Species.** The charges add. The multiplicity is one more than all the
 *   parts' unpaired electrons together: with two or more parts open-shell
 *   that is their high-spin coupling, and it is said, as another coupling
 *   is the chemist's to set (*Species*). A part without its hydrogens (a
 *   skeleton, no species) makes the complex one too: none.
 * - **Properties that name atoms** are carried, renumbered as the complex
 *   numbers them - a part's atom k is the complex's k plus the atoms of the
 *   parts before it:
 *   - its restraints, where they are in its own numbering (`oneNumbering`),
 *     those of one name from every part as one list - where every part held
 *     them first somewhere (`start`), that too, part after part;
 *   - its measures (./measure), where each was measured at the geometry the
 *     part has: no part is moved, so each is the complex's too, at its
 *     geometry, and is named by its atoms as the complex numbers them.
 *   Each is said, part by part.
 * - **Other properties** are not carried: each was worked out on its part
 *   alone, not on the complex - a list per atom too, of the part's own
 *   calculation - and so is a restraint in another numbering, or a measure
 *   at another geometry or not made: what names atoms is never carried onto
 *   other atoms. Where the parts had any, it is said. The parts stay as its
 *   lineage.
 */
import { geometryKey, type Entry, type EntryBond, type Geometry, type Property, type Restraint } from "../entry";
import { speciesOf } from "../io/writers";
import { isMeasurementName, measurementAtoms, measurementName } from "./measure";
import { NUMBERING, OWN_NUMBERING, oneNumbering } from "./restraints";

/** A property's restraints, where it holds them. */
const restraintsIn = (p: Property): { restraints: Restraint[]; start?: number[]; numbering?: string } | null =>
  typeof p.value === "object" && p.value !== null && "restraints" in p.value ? p.value : null;

/** The numbering a part's atoms are in: an Atom map's (its `NUMBERING` label), else its own. */
function numberingOfPart(p: Entry): string {
  const n = p.properties[NUMBERING];
  return n?.status === "computed" && typeof n.value === "string" ? n.value : OWN_NUMBERING;
}

/** What of a part is carried into the complex - each property renumbered, by its name there - and what is said of what is and is not, by kind: "restraints", "2 measures", "energy". */
type PartCarried = { measures: [string, Property][]; restraints: [string, Restraint[], number[] | undefined][]; carried: string[]; not: string[] };

/** Of part `p`, its atoms from `offset` in the complex: what is carried, renumbered, and what is not - `geometry`, the complex's, a measure's then. */
function partCarried(p: Entry, offset: number, geometry: Geometry): PartCarried {
  const n = p.structure.atoms.length;
  const xyz = p.geometry.kind === "3d" ? p.geometry.xyz : null;
  const out: PartCarried = { measures: [], restraints: [], carried: [], not: [] };
  const count = (k: number, one: string, many: string) => (k ? [`${k} ${k === 1 ? one : many}`] : []);
  let measuresNot = 0;
  // (restraints not carried, by why: one naming an atom the part has not, or in a numbering not the part's)
  let restraintsOff = false;
  let restraintsElsewhere = false;
  const others: string[] = [];
  for (const [name, prop] of Object.entries(p.properties)) {
    const held = restraintsIn(prop);
    if (held) {
      // (in its own numbering, every atom one of its own: each as the complex numbers it)
      const inRange = held.restraints.every((r) => r.atoms.every((a) => Number.isInteger(a) && a >= 0 && a < n));
      const own = oneNumbering(held.numbering ?? OWN_NUMBERING, numberingOfPart(p));
      if (inRange && own) {
        const start = held.start && held.start.length === 3 * n ? held.start : undefined;
        out.restraints.push([name, held.restraints.map((r) => ({ ...r, atoms: r.atoms.map((a) => a + offset) })), start]);
      } else if (!own) restraintsElsewhere = true;
      else restraintsOff = true;
      continue;
    }
    if (isMeasurementName(name)) {
      // (measured at the geometry the part has, which the complex keeps: as true of it, at its geometry)
      const atoms = measurementAtoms(name);
      const at = xyz && prop.status === "computed" && typeof prop.value === "number" && prop.at?.geometry === geometryKey(xyz) && atoms.every((a) => a < n);
      if (at && geometry.kind === "3d") out.measures.push([measurementName(atoms.map((a) => a + offset)), { ...prop, at: { ...prop.at!, geometry: geometryKey(geometry.xyz) } }]);
      else measuresNot++;
      continue;
    }
    // (anything else - the label of an Atom map's numbering among them: the complex is in its own)
    others.push(name);
  }
  out.carried = [...(out.restraints.length ? ["restraints"] : []), ...count(out.measures.length, "measure", "measures")];
  out.not = [...(restraintsElsewhere ? ["restraints in another numbering"] : []), ...(restraintsOff ? ["restraints on atoms it has not"] : []), ...count(measuresNot, "measure not made at its geometry", "measures not made at its geometry"), ...others];
  return out;
}

export type Combined = { entry: Entry; said: string[] } | { failed: string };

export function combined(parts: readonly Entry[], id: string): Combined {
  if (!parts.length) return { failed: "Nothing came in to combine." };
  const kinds = new Set(parts.map((p) => p.geometry.kind));
  if (kinds.has("frames")) return { failed: "A part holds frames: take one frame of it first (Take frames)." };
  if (kinds.size > 1) return { failed: `The parts' places are of different kinds (${[...kinds].join(", ")}): combine parts all in 3D, or all drawn.` };
  const kind = parts[0].geometry.kind as "3d" | "2d" | "none";
  const atoms = parts.flatMap((p) => p.structure.atoms);
  const bonds: EntryBond[] = [];
  let offset = 0;
  for (const p of parts) {
    for (const b of p.structure.bonds) bonds.push({ ...b, a1: b.a1 + offset, a2: b.a2 + offset });
    offset += p.structure.atoms.length;
  }
  const geometry: Geometry =
    kind === "3d"
      ? { kind: "3d", xyz: parts.flatMap((p) => (p.geometry as { xyz: number[] }).xyz) }
      : kind === "2d"
        ? { kind: "2d", xy: parts.flatMap((p) => (p.geometry as { xy: number[] }).xy) }
        : { kind: "none" };
  const known = parts.every((p) => p.species) ? parts.map((p) => p.species!) : null;
  const charge = known?.reduce((n, s) => n + s.charge, 0) ?? 0;
  const unpaired = known?.reduce((n, s) => n + (s.multiplicity - 1), 0) ?? 0;
  const open = known?.filter((s) => s.multiplicity > 1).length ?? 0;
  const given = { charge: !!known?.some((s) => s.from.charge === "given"), multiplicity: !!known?.some((s) => s.from.multiplicity === "given") };
  const species = known
    ? speciesOf(
        { atoms: atoms.map((a) => ({ ...a, x: 0, y: 0, z: 0 })), bonds: [] },
        { charge: given.charge ? charge : undefined, multiplicity: given.multiplicity || open > 1 ? unpaired + 1 : undefined },
      )
    : null;
  const said: string[] = [];
  if (!known) said.push("A part has no hydrogens, so the complex's charge and spin are not known either.");
  if (open > 1) said.push(`${open} parts are open-shell: taken as high spin, multiplicity ${unpaired + 1}. Set another with Species.`);
  // (each part's: what names its atoms, renumbered as the complex numbers them; the rest not carried - each worked out on its part alone)
  const offsets = parts.map((_, i) => parts.slice(0, i).reduce((k, p) => k + p.structure.atoms.length, 0));
  const each = parts.map((p, i) => partCarried(p, offsets[i], geometry));
  const properties: Record<string, Property> = {};
  for (const c of each) for (const [name, prop] of c.measures) properties[name] = prop;
  // (restraints of one name from every part as one list, the part's property as it was but for its rows - where each part held
  //  them first somewhere, that too, part after part: else none, as a minimisation then starts from where the complex stands)
  const names = [...new Set(each.flatMap((c) => c.restraints.map(([name]) => name)))];
  for (const name of names) {
    const rows = each.flatMap((c) => c.restraints.filter(([k]) => k === name).flatMap(([, r]) => r));
    const starts = each.map((c) => c.restraints.find(([k]) => k === name)?.[2]);
    const first = parts.find((p) => p.properties[name] && restraintsIn(p.properties[name]))!.properties[name];
    properties[name] = { ...first, value: { restraints: rows, ...(starts.every((x) => x) ? { start: starts.flatMap((x) => x!) } : {}) } };
  }
  const carried = each.flatMap((c, i) => (c.carried.length ? [`part ${i + 1}${offsets[i] ? ` (its atoms from ${offsets[i] + 1})` : ""}: ${c.carried.join(", ")}`] : []));
  const notCarried = each.flatMap((c, i) => (c.not.length ? [`part ${i + 1}: ${c.not.join(", ")}`] : []));
  if (carried.length) said.push(`Carried over, its atoms numbered as in the complex - ${carried.join("; ")}.`);
  if (notCarried.length) said.push(`Not carried over, as each was worked out on its part alone - ${notCarried.join("; ")}.`);
  return { entry: { id, from: parts.map((p) => p.id), structure: { atoms, bonds }, geometry, species, properties, status: "done" }, said };
}
