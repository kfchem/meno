/**
 * The plugins set up here before Meno got its plugins online (docs/PLUGINS.md,
 * *Plugins used before*). A Meno that carried its plugins set each up where it
 * was asked for, and kept its environment's stamp (lib/pyEnv); a Meno that
 * carries none starts with none in place. As it first starts, it offers to get
 * those again - each by its stamp, none the chemist took away, none in place
 * already - from the plugins online, and gets and adds each as Settings does.
 * An environment whose lock is the same is kept, nothing of it fetched again;
 * one whose lock changed is set up as any plugin's is, asking first.
 *
 * Two questions at most:
 * - where the network is not allowed for the list yet, whether to look them up
 *   online, naming them as they were set up - a no asked again as Meno next
 *   starts, unless the chemist says not to;
 * - with the list fetched, whether to get them, each by its name and the size
 *   of its files - a no kept.
 *
 * A yes once all are got, a no to the second, or nothing to get: never asked
 * again. Offline, the list not fetched, or one not got: said, and asked again
 * as Meno next starts.
 */
import { invoke } from "@tauri-apps/api/core";
import { askToConnect, formatBytes, useNetwork, type ConsentRequest } from "../net/network";
import { useAppSettings } from "../settings/appSettings";
import { anyPluginById } from "../calc/catalog";
import { addPlugin } from "../calc/workers";
import { CATALOGUE_HOSTS, CATALOGUE_PURPOSE, offersOf, type CatalogueEntry } from "./catalogue";
import { systemHere } from "./here";
import { placeOf, refreshPlugins } from "./known";
import { CATALOGUE_REQUEST, getPlugin, listOnline, useOnline } from "./online";

/** What getting them again uses, each given in a test. */
export type UsedBeforeDeps = {
  /** The plugins whose environments were set up here, by id (installed.rs `set_up_before`). */
  setUpBefore(): Promise<string[]>;
  /** A question, asked as any use of the network is (lib/net/network `askToConnect`). */
  ask(request: ConsentRequest): Promise<boolean>;
  /** The plugins online listed, fetched now (lib/plugins/online `listOnline`). */
  list(): Promise<void>;
  /** A plugin's files got, and the plugin added (Settings' own way: lib/plugins/online `getPlugin`, lib/calc/workers `addPlugin`). */
  getAndAdd(entry: CatalogueEntry): Promise<void>;
};

/**
 * Where it is said what was not done: in the corner of the window (ui/notices, given by the app) - kept until
 * dismissed; or, with `dontAskAgain`, for a while, with a button that stops it being asked again.
 */
export type Say = (title: string, text: string, dontAskAgain?: () => void) => void;

const TITLE = "Plugins used before";

/** A list in words: "a", "a and b", "a, b and c". */
const listSaid = (names: readonly string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

const setUpHere = (names: readonly string[]) => `${names.length === 1 ? "One was" : `${names.length} were`} set up here: ${listSaid(names)}.`;

/** Answered: never asked again. */
function answered() {
  const settings = useAppSettings.getState();
  settings.setPlugins({ ...settings.plugins, usedBeforeAsked: true });
}

/**
 * Offers once, as Meno starts, to get again the plugins set up here before -
 * and gets and adds those asked for. See the module's own words for when it
 * is asked again.
 */
export async function getUsedBefore(say: Say, deps: UsedBeforeDeps = DEPS): Promise<void> {
  const plugins = useAppSettings.getState().plugins;
  if (plugins.usedBeforeAsked) return;
  const ids = (await deps.setUpBefore()).filter((id) => !plugins.removed.includes(id) && !placeOf(id));
  // (none to get - none set up before, or all in place: nothing to ask, ever)
  if (!ids.length) return answered();
  if (useNetwork.getState().offline) {
    say(TITLE, "Meno now gets its plugins online, and is offline: it asks again as it next starts, or add them in Settings, Plugins.");
    return;
  }
  // (1: the list fetched only where the network is allowed for it - else asked first, naming them as they were set up)
  if (!useNetwork.getState().granted.includes(CATALOGUE_PURPOSE)) {
    const lookUp: ConsentRequest = {
      ...CATALOGUE_REQUEST,
      title: "Meno now gets its plugins online. Look them up?",
      detail: `${setUpHere(ids)} Meno fetches the list of plugins online, then asks before it gets any of them.`,
      again: true,
    };
    if (!(await deps.ask(lookUp))) {
      // (a no, or gone offline as it was asked: asked again next time - unless the chemist says not to)
      if (!useNetwork.getState().offline) say(TITLE, "Not looked up: Meno asks again as it next starts, or add them in Settings, Plugins.", answered);
      return;
    }
  }
  await deps.list();
  const online = useOnline.getState();
  if (online.state !== "listed" || !online.catalogue) {
    say(TITLE, `${online.problem ?? "The list of plugins online could not be fetched."} Meno asks again as it next starts.`);
    return;
  }
  // (each set up before that is offered here; one no longer offered, or not for this system or this Meno, passed over)
  const entries = offersOf(online.catalogue, new Map(), systemHere())
    .filter((o) => o.offer === "add" && ids.includes(o.entry.id))
    .map((o) => o.entry);
  if (!entries.length) return answered();
  // (2: whether to get them, each by its name and its files' size - their environments' said as each is set up, where one is fetched)
  const get: ConsentRequest = {
    purpose: CATALOGUE_PURPOSE,
    title: `Get ${entries.length === 1 ? "it" : `these ${entries.length}`} again?`,
    detail: `${setUpHere(entries.map((e) => e.name))} Where a plugin's environment is the one it needs, it is kept, nothing of it fetched again. No, and you can add them in Settings, Plugins.`,
    sources: CATALOGUE_REQUEST.sources,
    hosts: CATALOGUE_HOSTS,
    again: true,
    parts: entries.map((e) => ({ name: e.name, detail: `Its files: ${formatBytes(e.source.bytes)}.`, sources: [] })),
  };
  if (!(await deps.ask(get))) {
    if (!useNetwork.getState().offline) answered();
    return;
  }
  // (one after another, as Settings adds them: one that fails said, and the rest got all the same)
  const failed: string[] = [];
  for (const e of entries) {
    try {
      await deps.getAndAdd(e);
    } catch (err) {
      failed.push(`${e.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (!failed.length) return answered();
  say(TITLE, `Not all were got: ${failed.join(" ")} Meno asks again, for those not here, as it next starts.`);
}

const DEPS: UsedBeforeDeps = {
  setUpBefore: () => invoke<string[]>("plugins_set_up_before"),
  ask: askToConnect,
  list: () => listOnline(true),
  getAndAdd: async (entry) => {
    await getPlugin(entry);
    // (the plugins in place read again, so that the one got is known at once)
    await refreshPlugins();
    const p = anyPluginById(entry.id);
    if (!p) throw new Error(`${entry.name} was got, but Meno could not read it.`);
    await addPlugin(p);
  },
};
