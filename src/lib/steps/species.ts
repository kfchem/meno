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

/**
 * A charge or multiplicity as typed on a Species step's card: a whole
 * number - a multiplicity at least 1 - or blank, kept as each entry has it;
 * or why it is neither.
 */
export function speciesTyped(charge: string, multiplicity: string): { given: SpeciesGiven } | { why: string } {
  const whole = (t: string) => (/^[+-]?\d+$/.test(t.trim()) ? Number(t.trim()) : null);
  const given: SpeciesGiven = {};
  if (charge.trim()) {
    const c = whole(charge);
    if (c == null) return { why: `The charge "${charge.trim()}" is not a whole number` };
    given.charge = c;
  }
  if (multiplicity.trim()) {
    const m = whole(multiplicity);
    if (m == null || m < 1) return { why: `The multiplicity "${multiplicity.trim()}" is not a whole number of 1 or more` };
    given.multiplicity = m;
  }
  return { given };
}

/**
 * What a Species step still needs before it can run, its charge and
 * multiplicity as typed - one that does not read, or neither given - or
 * nothing, where it can: what its card says where it would say *Ready*,
 * and why its run is refused.
 */
export function speciesNeeds(charge: string, multiplicity: string): string | undefined {
  const typed = speciesTyped(charge, multiplicity);
  if ("why" in typed) return typed.why;
  if (typed.given.charge == null && typed.given.multiplicity == null) return "Give a charge, a multiplicity, or both";
  return undefined;
}
