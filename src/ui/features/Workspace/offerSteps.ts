/** The steps of the line offering the plugins online that fill a role (./RoleOffer): plain, to be tested without a page. */
import { addOnline } from "../../../lib/calc/addOnline";
import { ALL_PLUGINS } from "../../../lib/calc/catalog";
import { offeredFor, offersOf, type Catalogue, type CatalogueEntry } from "../../../lib/plugins/catalogue";
import { systemHere } from "../../../lib/plugins/here";
import type { System } from "../../../lib/plugins/manifest";
import { listOnline } from "../../../lib/plugins/online";
import type { RoleId } from "../../../lib/plugins/roles";

/** The plugins online offered for a role: those of the list that fill it, made for this system and this Meno, and not here already (lib/plugins/catalogue `offersOf`). */
export function offeredHere(role: RoleId, catalogue: Catalogue, system: System | null = systemHere()): CatalogueEntry[] {
  return offeredFor(role, offersOf(catalogue, new Map(ALL_PLUGINS.map((p) => [p.id, p.version])), system));
}

/**
 * The list, as the line appears: the one kept from before - fetched, once a
 * launch, only where the network was allowed for it already, as Settings
 * does - never asked for. Only the person's click asks (`listOnline(true)`).
 */
export const listShown = (list: typeof listOnline = listOnline) => list(false);

/** A plugin offered, added: got and added (lib/calc/addOnline), then `done`; or why not, `problem`, and no `done`. */
export async function addOffered(entry: CatalogueEntry, done: () => void, problem: (why: string) => void, add: (entry: CatalogueEntry) => Promise<void> = addOnline): Promise<void> {
  try {
    await add(entry);
  } catch (e) {
    return problem(e instanceof Error ? e.message : String(e));
  }
  done();
}
