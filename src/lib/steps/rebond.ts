/**
 * *Re-bond* (docs/WORKFLOWS-FOUNDATION.md, *Meno's own nodes*, Structures):
 * one entry's geometry with another's bonds and charges - a conformer of the
 * reactant given the product's bonding, as the start of a restrained
 * minimisation towards the product. The two must hold the same atoms in one
 * numbering (an *Atom map* step writes its products in the reactants'), atom
 * by atom; where they do not, nothing is made, and the first atom that
 * differs is said.
 *
 * - **Structure and species**: the bonding entry's - its atoms' charges,
 *   radicals and isotopes, its bonds, its charge and multiplicity.
 * - **Geometry**: the geometry entry's, as it is: one 3D structure. Frames
 *   are taken one at a time first (*Take frames*).
 * - **Properties**: both entries', the geometry entry's where both have one
 *   of a name, each still saying the geometry it was worked out at. A
 *   value of a structure (a descriptor's) that is no longer the entry's is
 *   marked not applicable, and said (./restructure).
 * - **Restraints** (`restraints`, ./restraints) are the bonding entry's
 *   alone: they hold its bonds - its coordination bonds, the torsions
 *   across its double bonds - and the entry is bonded as it is. The
 *   geometry entry's, of the bonding it had, are dropped, and said.
 * - **Group**: *a → b*, the geometry entry's group and the bonding entry's
 *   (each its own id where it has none).
 * - **Lineage**: both entries.
 */
import type { Entry } from "../entry";
import { restructured } from "./restructure";

export type Rebonded = { entry: Entry; said: string[] } | { failed: string };

const groupOf = (e: Entry): string => {
  const g = e.properties.group?.value;
  return typeof g === "string" || typeof g === "number" ? String(g) : e.id;
};

export function rebonded(geometry: Entry, bonding: Entry, id: string): Rebonded {
  const g = geometry.geometry;
  if (g.kind === "frames") return { failed: "The geometry holds frames: take one frame of it first (Take frames)." };
  if (g.kind !== "3d") return { failed: `The geometry entry has no 3D places (${g.kind === "2d" ? "it is drawn" : "it has none"}).` };
  const ga = geometry.structure.atoms;
  const ba = bonding.structure.atoms;
  if (ga.length !== ba.length)
    return { failed: `The geometry has ${ga.length} atoms and the bonding ${ba.length}: both must hold the same atoms in one numbering.` };
  const i = ga.findIndex((a, k) => a.el !== ba[k].el);
  if (i >= 0)
    return {
      failed: `Atom ${i + 1} is ${ga[i].el} in the geometry and ${ba[i].el} in the bonding: both must hold the same atoms in one numbering (an Atom map step writes its products in the reactants').`,
    };
  // (the bonding a skeleton, its hydrogens not there: no charge or spin to give the entry, as Combine says of a part)
  const said = bonding.species ? [] : ["The bonding has no hydrogens, so the entry's charge and spin are not known either."];
  const made: Entry = {
    id,
    from: [geometry.id, bonding.id],
    structure: { atoms: ba.map((a) => ({ ...a })), bonds: bonding.structure.bonds.map((b) => ({ ...b })) },
    geometry: { kind: "3d", xyz: [...g.xyz] },
    // (the bonding's - none where it is a skeleton, its hydrogens not there)
    species: bonding.species ? { ...bonding.species, from: { ...bonding.species.from } } : null,
    properties: {
      ...Object.fromEntries(Object.entries(bonding.properties).map(([k, p]) => [k, { ...p }])),
      ...Object.fromEntries(Object.entries(geometry.properties).flatMap(([k, p]) => (k === "restraints" ? [] : [[k, { ...p }]]))),
      ...(bonding.properties.restraints ? { restraints: { ...bonding.properties.restraints } } : {}),
      group: { value: `${groupOf(geometry)} → ${groupOf(bonding)}`, unit: "none", status: "computed" },
    },
    status: "done",
  };
  // (restraints of the bonding the geometry had: not the entry's bonds now)
  if (geometry.properties.restraints)
    said.push(`The geometry's restraints were dropped: restraints hold a bonding's bonds, and the entry takes ${bonding.properties.restraints ? "the bonding's" : "the bonding's, which has none"}.`);
  // (values of the structure either was, now another: kept, marked, and said - never shown as current)
  const { entry, stale } = restructured(made, "Re-bond");
  if (stale.length) said.push(`${stale.join(", ")} ${stale.length === 1 ? "was" : "were"} worked out on another structure, so ${stale.length === 1 ? "it is" : "they are"} marked not applicable.`);
  return { entry, said };
}
