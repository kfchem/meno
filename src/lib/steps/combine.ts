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
 *   is the chemist's to set (*Species*).
 * - **Properties.** None is carried: each was worked out on its part alone,
 *   not on the complex. Where the parts had any, it is said. The parts stay
 *   as its lineage.
 */
import type { Entry, EntryBond, Geometry } from "../entry";
import { speciesOf } from "../io/writers";

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
  const charge = parts.reduce((n, p) => n + p.species.charge, 0);
  const unpaired = parts.reduce((n, p) => n + (p.species.multiplicity - 1), 0);
  const open = parts.filter((p) => p.species.multiplicity > 1).length;
  const given = { charge: parts.some((p) => p.species.from.charge === "given"), multiplicity: parts.some((p) => p.species.from.multiplicity === "given") };
  const species = speciesOf(
    { atoms: atoms.map((a) => ({ ...a, x: 0, y: 0, z: 0 })), bonds: [] },
    { charge: given.charge ? charge : undefined, multiplicity: given.multiplicity || open > 1 ? unpaired + 1 : undefined },
  );
  const said: string[] = [];
  if (open > 1) said.push(`${open} parts are open-shell: taken as high spin, multiplicity ${unpaired + 1}. Set another with Species.`);
  if (parts.some((p) => Object.keys(p.properties).length)) said.push("The parts' properties are not carried over: they were worked out on each part alone.");
  return { entry: { id, from: parts.map((p) => p.id), structure: { atoms, bonds }, geometry, species, properties: {}, status: "done" }, said };
}
