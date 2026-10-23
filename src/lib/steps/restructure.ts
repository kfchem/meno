/**
 * What an entry's properties are once a step changes its bonding (*Re-bond*;
 * docs/STRUCTURE-STEPS.md): three kinds, told apart by what each says of
 * itself (lib/entry `Property`):
 * - a value of a geometry (`at`) rides, still naming the geometry it was
 *   worked out at - a table shows it as of another geometry;
 * - a label - a Tag's ID, restraints - names neither, and rides;
 * - a value of a structure (`of`) - a descriptor's - whose structure is no
 *   longer the entry's is kept, marked not applicable, saying why: never
 *   shown as current, never dropped unsaid.
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

/**
 * `e`'s properties as they stand on its structure now, `step` having changed
 * its bonding: each value of another structure (`of`) marked not applicable,
 * saying so; the rest as they were. And their names, those so marked.
 */
export function restructured(e: Entry, step: string): { entry: Entry; stale: string[] } {
  const now = structureKey(e);
  const stale: string[] = [];
  const properties: Record<string, Property> = {};
  for (const [name, p] of Object.entries(e.properties)) {
    if (p.of == null || p.of === now) {
      properties[name] = p;
      continue;
    }
    stale.push(name);
    // (already failed or not applicable: as it was, its reason kept)
    properties[name] = p.status === "computed" ? { ...p, status: { notApplicable: `worked out on the structure before ${step}` } } : p;
  }
  return { entry: { ...e, properties }, stale };
}
