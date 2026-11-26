/**
 * A name looked up through the plugin filling the names role, as the
 * chemist chose to look it up (./nameLookup; docs/EDITOR-2D.md, *Quick
 * Add*): the person asked first, the first time, whether names may go to its
 * hosts - a no sends nothing - and its worker, started before that yes,
 * started again so that it may go out. Nothing is kept on disk: the same
 * name looked up twice goes out twice.
 */
import type { PythonPlugin } from "../../../../lib/calc/catalog";
import { askToConnect, useNetwork, type ConsentRequest } from "../../../../lib/net/network";
import { stopWorker, workerOf, workerRunning, type PluginWorker } from "../../../../lib/plugins/process";
import { pyEnvReady } from "../../../../lib/pyEnv";
import { foundOf, lookupConsentOf, lookupHosts, lookupPurpose, MOST_NAMED, NAME_MOST, type NameFound } from "./nameLookup";

/**
 * How long a lookup may take, whole: two requests to the service, each
 * given at most 30 s by its plugin and one more try where the service is
 * busy - so 90 s, and the plugin gives up within it, in words.
 */
export const LOOKUP_MS = 90_000;

/** What a lookup is made of, Meno's own unless a test gives its own. */
export type LookupSteps = {
  ask: (request: ConsentRequest) => Promise<boolean>;
  allowed: (purpose: string) => boolean;
  offline: () => boolean;
  /** Whether the plugin can run now - added, its environment set up - with nothing asked or downloaded. */
  ready: (p: PythonPlugin) => Promise<boolean>;
  worker: (p: PythonPlugin) => Promise<PluginWorker>;
  running: (plugin: string) => boolean;
  stop: (plugin: string, why: string) => Promise<void>;
};

/** Where Meno is offline: what the lookup row says, before anything is asked. */
export const offlineSaid = (p: PythonPlugin) => `${p.name} needs the network; Meno is offline`;

/** Where the plugin is not added (taken away, or its set-up not done): what the lookup row says, before anything is asked. */
export const notAddedSaid = (p: PythonPlugin) => `${p.name} is not added: add it in Settings, Plugins`;

/**
 * `name` looked up through `p`: what it found, none, or why not, in words -
 * never sent where the person has not allowed it, nor where Meno is
 * offline, nor where the name is longer than any is sent.
 */
export async function lookUpName(p: PythonPlugin, name: string, steps: LookupSteps = MENO_STEPS): Promise<NameFound> {
  const asked = name.trim();
  if (!asked || asked.length > NAME_MOST) return { error: `A name of 1 to ${NAME_MOST} characters is looked up` };
  if (steps.offline()) return { error: offlineSaid(p) };
  // (a plugin that cannot run is not asked about: the chemist is never asked to allow what then does not happen)
  if (!(await steps.ready(p))) return { error: `${notAddedSaid(p)}.` };
  const hosts = lookupHosts(p);
  const before = steps.allowed(lookupPurpose(p.id, hosts));
  if (!(await steps.ask(lookupConsentOf(p)))) return { error: `Nothing was sent: looking names up at ${hosts.join(", ")} was not allowed.` };
  // (its worker started before it was allowed goes out nowhere: started again, now it may - the backend begins its task as it starts)
  if (!before && steps.running(p.id)) await steps.stop(p.id, `${p.name} was started again: it may now look names up`);
  const worker = await steps.worker(p);
  return foundOf(await worker.chem.request("find_name", { name: asked, most: MOST_NAMED }, LOOKUP_MS), MOST_NAMED, hosts);
}

const MENO_STEPS: LookupSteps = {
  ask: askToConnect,
  allowed: (purpose) => useNetwork.getState().granted.includes(purpose),
  offline: () => useNetwork.getState().offline,
  ready: async (p) => workerRunning(p.id) || (await pyEnvReady(p.profile)),
  worker: workerOf,
  running: workerRunning,
  stop: stopWorker,
};
