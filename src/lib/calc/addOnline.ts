import type { CatalogueEntry } from "../plugins/catalogue";
import { getPlugin } from "../plugins/online";
import { anyPluginById, type Plugin } from "./catalog";
import { addPlugin } from "./workers";
import { newerHere } from "../plugins/known";

/** What getting and adding a plugin on offer takes, step by step: Meno's own, unless a test gives its own. */
export type AddSteps = { get: (entry: CatalogueEntry) => Promise<void>; find: (id: string) => Plugin | undefined; add: (p: Plugin) => Promise<void> };

/**
 * Gets a plugin on offer online - its files checked, as any got are
 * (lib/plugins/online `getPlugin`) - then finds it among the plugins in
 * place, and adds it, as any plugin is. A step that fails stops it, and
 * says why.
 */
export async function addOnline(entry: CatalogueEntry, steps: AddSteps = { get: getPlugin, find: anyPluginById, add: addPlugin }, newer: (id: string) => { why: string } | undefined = newerHere): Promise<void> {
  // (one the list says is a newer Meno's: never got)
  if (entry.newer) throw new Error(`${entry.name} is for a newer Meno: update Meno, then add it.`);
  // (Meno's own steps taken as it is called, never as it is read: a page that never adds one asks nothing of them)
  await steps.get(entry);
  const p = steps.find(entry.id);
  // (its manifest a newer Meno's - though the list did not say so: said, not "could not read")
  if (!p && newer(entry.id)) throw new Error(`${entry.name} is for a newer Meno: update Meno, then add it.`);
  if (!p) throw new Error(`${entry.name} was got, but Meno could not read it.`);
  await steps.add(p);
}
