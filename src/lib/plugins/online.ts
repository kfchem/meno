/**
 * The plugins online, as Settings lists them and gets one (docs/PLUGINS.md,
 * *Plugins online*): the catalogue, as Meno's backend last checked it -
 * fetched at most once a launch where the network was allowed for it, and
 * whenever the chemist asks; else the one kept from before, offline too -
 * and a plugin's files got from it. A plugin got is only files in their
 * folder: it is added after, set up and asked of as any plugin is
 * (lib/calc/workers `addPlugin`).
 */
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { askToConnect, useNetwork, type ConsentRequest } from "../net/network";
import { acceptCatalogue, CATALOGUE_HOSTS, CATALOGUE_PURPOSE, type Catalogue, type CatalogueEntry } from "./catalogue";
import { acceptManifest } from "./manifest";

/**
 * The catalogue as Settings shows it:
 * - `unlisted`: none here yet, and none fetched (the network not allowed for it);
 * - `listing`: being fetched;
 * - `listed`: here - fetched now or kept from before (`kept` says why the newer one is not);
 * - `failed`: none here, and why (`problem`).
 */
export type Online = {
  state: "unlisted" | "listing" | "listed" | "failed";
  catalogue?: Catalogue;
  /** When it was fetched. */
  fetchedAt?: string;
  /** Why the one shown is the one kept from before, not one fetched now: offline, or the fetch failed. */
  kept?: string;
  problem?: string;
};

export const useOnline = create<Online>(() => ({ state: "unlisted" }));

/** What listing the plugins online asks, as any first use of the network is asked. */
export const CATALOGUE_REQUEST: ConsentRequest = {
  purpose: CATALOGUE_PURPOSE,
  title: "List the plugins online?",
  detail: "Meno fetches the list of the plugins it can get - each one's name, version, licence and size - and, when you add one, its files. Nothing is got until you add it.",
  sources: ["The list and the plugins' files: github.com"],
  hosts: CATALOGUE_HOSTS,
};

/** What the backend gives (`catalogue_get`): the catalogue it checked, when it was fetched, and why it is the one kept, where it is. */
type Got = { catalogue: unknown; fetchedAt?: string; kept?: string };

let fetched = false;

const said = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Lists the plugins online. Asked for (`again`), it fetches - asking first,
 * where the network was not allowed for it yet. Else, as Settings opens, it
 * fetches once a launch where the network was allowed for it, and shows the
 * one kept from before otherwise: nothing asked, nothing fetched.
 */
export async function listOnline(again = false, ask: typeof invoke = invoke): Promise<void> {
  if (useOnline.getState().state === "listing") return;
  const allowed = useNetwork.getState().granted.includes(CATALOGUE_PURPOSE);
  const fetch = again || (allowed && !fetched);
  if (fetch) {
    fetched = true;
    useOnline.setState({ state: "listing", problem: undefined });
    if (!(await askToConnect(CATALOGUE_REQUEST))) {
      useOnline.setState((s) => (s.catalogue ? { state: "listed", kept: "Meno is offline, or the network was not allowed" } : { state: "failed", problem: "Listing them needs the network: Meno is offline, or the network was not allowed for it." }));
      return;
    }
  }
  let got: Got | null;
  try {
    got = (await ask("catalogue_get", { fetch })) as Got | null;
  } catch (e) {
    useOnline.setState((s) => (s.catalogue ? { state: "listed", kept: said(e) } : { state: "failed", problem: `The plugins online could not be listed: ${said(e)}.` }));
    return;
  }
  // (none kept, and none fetched: nothing to show yet)
  if (!got) return useOnline.setState({ state: "unlisted" });
  const read = acceptCatalogue(got.catalogue);
  if ("why" in read) return useOnline.setState({ state: "failed", catalogue: undefined, problem: `The list of plugins online could not be read: ${read.why}.` });
  useOnline.setState({ state: "listed", catalogue: read.catalogue, fetchedAt: got.fetchedAt, kept: got.kept, problem: undefined });
}

/**
 * A plugin's files, as Meno's backend handles them: staged - fetched,
 * checked against the catalogue's fingerprint and size, and unpacked apart
 * from the plugins in use - then taken into use, or thrown away; and the
 * plugins in use read again once one is.
 */
export type PluginFiles = {
  stage(id: string, version: string): Promise<{ stage: string; manifest: string }>;
  commit(stage: string): Promise<void>;
  discard(stage: string): Promise<void>;
  reload(): Promise<void>;
};

/** The backend's own (`plugin_stage`, `plugin_commit`, `plugin_discard`). */
export const PLUGIN_FILES: PluginFiles = {
  stage: (id, version) => invoke("plugin_stage", { id, version }),
  commit: (stage) => invoke("plugin_commit", { stage }),
  discard: (stage) => invoke("plugin_discard", { stage }),
  // (the plugins in use read again: Meno's own list of them, once it is read from their folders)
  reload: async () => {},
};

/**
 * Gets a plugin's files from the catalogue: staged, its manifest read as
 * any plugin's is and checked to be the plugin and version the catalogue
 * offered - else thrown away, nothing of it used - then taken into use.
 * Nothing of it runs before all that; it is added after, by the caller, as
 * any plugin is.
 */
export async function getPlugin(entry: CatalogueEntry, files: PluginFiles = PLUGIN_FILES): Promise<void> {
  if (!(await askToConnect(CATALOGUE_REQUEST))) throw new Error(`${entry.name} was not got: it needs the network, and Meno is offline or the network was not allowed.`);
  const { stage, manifest } = await files.stage(entry.id, entry.version);
  let m: ReturnType<typeof acceptManifest> = null;
  try {
    m = acceptManifest(JSON.parse(manifest));
  } catch {
    m = null;
  }
  if (!m || m.id !== entry.id || m.version !== entry.version) {
    await files.discard(stage).catch(() => {});
    throw new Error(`${entry.name} was not got: its files are not the plugin the list offered.`);
  }
  await files.commit(stage);
  await files.reload();
}
