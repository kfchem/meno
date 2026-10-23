/**
 * *Species* (docs/WORKFLOWS-FOUNDATION.md, *Meno's own nodes*, Structures):
 * each entry the same, its charge and multiplicity set as the chemist gives
 * them - by Meno's one rule (`speciesOf`), each said to be given. A charge
 * and multiplicity its electrons cannot have (`speciesProblem`) fail the
 * entry, with the reason; nothing is changed to fit. An entry without its
 * hydrogens (a skeleton: no species) fails too: its charge and spin are not
 * known until they are added (lib/chem/skeleton).
 */
import type { Entry } from "../entry";
import { speciesOf, speciesProblem } from "../io/writers";
import { skeletonWhy } from "../chem/skeleton";

/** What a *Species* step sets: a charge, a multiplicity, or both; what it leaves unset stays as the entry had it. */
export type SpeciesGiven = { charge?: number; multiplicity?: number };

/** The entry with its charge and multiplicity set, or failed with the reason they cannot be its. */
export function withSpecies(e: Entry, given: SpeciesGiven): Entry {
  if (!e.species) return { ...e, status: { failed: skeletonWhy() } };
  const written = { atoms: e.structure.atoms.map((a) => ({ ...a, x: 0, y: 0, z: 0 })), bonds: [] };
  const charge = given.charge ?? (e.species.from.charge === "given" ? e.species.charge : undefined);
  const multiplicity = given.multiplicity ?? (e.species.from.multiplicity === "given" ? e.species.multiplicity : undefined);
  // (of atoms alone, never a skeleton: always one)
  const species = speciesOf(written, { charge, multiplicity })!;
  const problem = speciesProblem(written, species.charge, species.multiplicity);
  return { ...e, species, status: problem ? { failed: problem } : e.status };
}
