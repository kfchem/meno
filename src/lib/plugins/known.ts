/**
 * The plugins Meno knows of: those in place in Meno's local data folder -
 * each `plugins/<id>/<version>/`, the version in use named by
 * `plugins/<id>/current` (src-tauri/src/installed.rs) - each read as data
 * (./manifest). Only Meno's backend puts them there, from the plugins
 * online (lib/plugins/online; catalogue.rs). Meno carries none, and names
 * none of them.
 *
 * The page is given them as it starts, before anything reads them
 * (`refreshPlugins`, main.tsx), and again after one is put in place or
 * taken away. `MANIFESTS` is read as it is now wherever it is read (a live
 * binding); what is worked out from it is worked out again
 * (`onPluginsChanged`: lib/calc/catalog).
 */
import { create } from "zustand";
import { acceptManifest, type Manifest } from "./manifest";

/** Where the plugins' folders are, in Meno's local data folder: a plugin's file is `plugins/<id>/<version>/<file>`. */
export const PLUGINS_ROOT = "plugins";

/** A plugin in place, as Meno's backend gives it (installed.rs `InstalledPlugin`): its manifest as written, its grammars by file name. */
export type InstalledPlugin = { id: string; version: string; dir: string; manifest: string; grammars: Record<string, string> };

/** Each plugin Meno knows of: its version in use, its folder (absolute), and its grammars. */
let places = new Map<string, { version: string; dir: string; grammars: Record<string, string> }>();

/** The manifests of the plugins Meno knows of, in their ids' order: each in place, of its folder's id and version. */
export let MANIFESTS: readonly Manifest[] = [];

const listeners = new Set<() => void>();

/** The names the list of plugins online gives, by id (lib/plugins/online): a plugin's name where it is not here yet. */
let listed = new Map<string, string>();

/** The list of plugins online read: the names it gives taken (lib/plugins/online). */
export function setListedNames(entries: readonly { id: string; name: string }[]): void {
  listed = new Map(entries.map((e) => [e.id, e.name]));
}

/** A plugin's name as the list of plugins online gives it; none, where the list holds none of that id or is not here. */
export const listedName = (id: string): string | undefined => listed.get(id);

/**
 * How many times the plugins Meno knows of were taken anew: what a page
 * listing them draws again by (Settings, Plugins) - one whose files were
 * taken away gone from it at once, not drawn on from a manifest no longer
 * here, its kinds named by their ids.
 */
export const usePluginsHere = create<{ taken: number }>(() => ({ taken: 0 }));

/** Called each time the plugins Meno knows of are taken anew; what it gives takes the call away. */
export function onPluginsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/**
 * The plugins in place taken as those Meno knows of: each whose manifest Meno
 * takes, of the id and version its folder says - one that is not, left out.
 */
export function setInstalled(list: readonly InstalledPlugin[]): void {
  const taken: Manifest[] = [];
  const next = new Map<string, { version: string; dir: string; grammars: Record<string, string> }>();
  for (const p of list) {
    let raw: unknown;
    try {
      raw = JSON.parse(p.manifest);
    } catch {
      continue;
    }
    const m = acceptManifest(raw);
    if (!m || m.id !== p.id || m.version !== p.version || next.has(m.id)) continue;
    taken.push(m);
    next.set(m.id, { version: m.version, dir: p.dir, grammars: p.grammars });
  }
  MANIFESTS = taken.sort((a, b) => a.id.localeCompare(b.id));
  places = next;
  for (const listener of listeners) listener();
  // (after what is worked out from them is worked out again: lib/calc/catalog)
  usePluginsHere.setState((s) => ({ taken: s.taken + 1 }));
}

/** Where plugin `id` is in place: its version in use and its folder - none where Meno knows of no such plugin. */
export function placeOf(id: string): { version: string; dir: string } | undefined {
  const place = places.get(id);
  return place && { version: place.version, dir: place.dir };
}

/** The plugins in place taken anew from Meno's backend (installed.rs `plugins_installed`). */
export async function refreshPlugins(): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  setInstalled(await invoke<InstalledPlugin[]>("plugins_installed"));
}

/** A grammar in the folder of a plugin Meno knows of (lib/plugins/manifest `GrammarDecl`): its text, or none where the folder holds no such file. */
export function grammarText(plugin: string, file: string): string | undefined {
  return places.get(plugin)?.grammars[file];
}
