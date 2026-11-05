import type { CatalogueEntry } from "../plugins/catalogue";
import { getPlugin } from "../plugins/online";
import { anyPluginById, type Plugin } from "./catalog";
import { addPlugin } from "./workers";

/** What getting and adding a plugin on offer takes, step by step: Meno's own, unless a test gives its own. */
export type AddSteps = { get: (entry: CatalogueEntry) => Promise<void>; find: (id: string) => Plugin | undefined; add: (p: Plugin) => Promise<void> };

/**
 * Gets a plugin on offer online - its files checked, as any got are
 * (lib/plugins/online `getPlugin`) - then finds it among the plugins in
 * place, and adds it, as any plugin is. A step that fails stops it, and
 * says why.
 */
export async function addOnline(entry: CatalogueEntry, steps: AddSteps = { get: getPlugin, find: anyPluginById, add: addPlugin }): Promise<void> {
  // (Meno's own steps taken as it is called, never as it is read: a page that never adds one asks nothing of them)
  await steps.get(entry);
  const p = steps.find(entry.id);
  if (!p) throw new Error(`${entry.name} was got, but Meno could not read it.`);
  await steps.add(p);
}
