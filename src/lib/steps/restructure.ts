/**
 * What an entry's properties are once a step changes its bonding (*Re-bond*;
 * docs/STRUCTURE-STEPS.md), told apart by what each says of itself
 * (lib/entry `Property`):
 * - a value of a geometry (`at`) rides, still naming the geometry it was
 *   worked out at - a table shows it as of another geometry;
 * - a label - a Tag's ID (`label`), restraints - rides;
 * - a value of a structure (`of`) whose structure is the entry's rides, and
 *   one whose structure is no longer the entry's is kept, marked not
 *   applicable, saying why: never shown as current, never dropped unsaid;
 * - any other - one that says none of these - is not known to be of the
 *   entry's structure now, and is kept, marked not applicable likewise,
 *   saying so: what is not known to stand is never shown as standing.
 */
import type { Entry, Property } from "../entry";
import { identityKey } from "../chem/identity";
import { constitutionOf } from "../nodes/group";

/**
 * An entry's structure as a key (`Property.of`): its atoms, their isotopes
 * and charges, and its bonds, as Meno's identity reads them - however the
 * atoms are numbered. No stereochemistry, which the entry's record does not
 * hold.
 */
export const structureKey = (e: Pick<Entry, "structure">): string => identityKey(constitutionOf(e as Entry));

/** Whether a property rides a change of bonding as it is: a value of a geometry, a label, restraints, or a value of the structure `now`. */
const rides = (p: Property, now: string): boolean =>
  p.at != null || p.label === true || (typeof p.value === "object" && "restraints" in p.value) || p.of === now;

/**
 * `e`'s properties as they stand on its structure now, `step` having changed
 * its bonding: each value of another structure (`of`) marked not applicable,
 * saying so, and each not known to be of any (`unknown`) likewise; the rest
 * as they were. And their names, those so marked.
 */
export function restructured(e: Entry, step: string): { entry: Entry; stale: string[]; unknown: string[] } {
  const now = structureKey(e);
  const stale: string[] = [];
  const unknown: string[] = [];
  const properties: Record<string, Property> = {};
  for (const [name, p] of Object.entries(e.properties)) {
    if (rides(p, now)) {
      properties[name] = p;
      continue;
    }
    const why = p.of != null ? `worked out on the structure before ${step}` : `not known to be of the structure after ${step}: it names neither the geometry nor the structure it was worked out on`;
    (p.of != null ? stale : unknown).push(name);
    // (already failed or not applicable: as it was, its reason kept)
    properties[name] = p.status === "computed" ? { ...p, status: { notApplicable: why } } : p;
  }
  return { entry: { ...e, properties }, stale, unknown };
}
