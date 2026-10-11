import { create } from "zustand";
import { ensurePyEnv, pyEnvReady } from "../pyEnv";
import { pluginById, pluginsFilling, type PythonPlugin } from "../calc/catalog";
import { ROLES, type RoleId } from "../plugins/roles";
import { useAppSettings } from "../settings/appSettings";
import { onWorkerStopped, workerOf, workerRunning } from "../plugins/process";
import type { ChemClient } from "./client";

/**
 * The worker of the plugin that fills a role (lib/plugins/roles,
 * docs/PLUGINS.md): the plugin chosen for the role where it is used - else
 * the first that fills it - set up the first time a role it fills is
 * needed, asking before it downloads, and started once, then kept for the
 * session: the one process the plugin has (lib/plugins/process). One the
 * chemist took away in Settings, Plugins is not set up again of itself:
 * the role says to add it.
 */

export type ChemState =
  | { state: "idle" }
  | { state: "setting-up"; plugin: string }
  | { state: "starting"; plugin: string }
  | { state: "ready"; plugin: string; version: string }
  | { state: "failed"; message: string };

export const useChem = create<ChemState>(() => ({ state: "idle" }));

/** The plugin that fills a role: the one chosen, where it fills it; else the first that does. */
export function rolePlugin(role: RoleId): PythonPlugin | undefined {
  const can = pluginsFilling(role);
  const chosen = useAppSettings.getState().plugins.roles[role];
  return can.find((p) => p.id === chosen) ?? can[0];
}

/** A role asked of a plugin the chemist took away: not a failure of it - it says to add it. */
export class TakenAway extends Error {}

/** Whether the chemist took a plugin away, so that it is not set up again of itself. */
const takenAway = (p: PythonPlugin) => useAppSettings.getState().plugins.removed.includes(p.id);

const starting = new Map<string, Promise<ChemClient>>();

// (a worker that stops - taken away, or gone of itself - is said to be no more)
onWorkerStopped((id) => {
  starting.delete(id);
  const now = useChem.getState();
  // (another plugin's worker, running still, is left as it is said to be)
  if ("plugin" in now && now.plugin === pluginById(id)?.name) useChem.setState({ state: "idle" });
});

/** The worker of the plugin that fills `role`, started the first time it is asked for. */
export function chemWorker(role: RoleId = "checks"): Promise<ChemClient> {
  const plugin = rolePlugin(role);
  if (!plugin) return Promise.reject(new Error(`No plugin Meno knows of does this: ${ROLES[role].name}.`));
  return pluginWorker(plugin);
}

/** A plugin's worker, asked under the roles' contract - for a kind of step it fills, say - set up and started the first time it is asked for. */
export function pluginWorker(plugin: PythonPlugin): Promise<ChemClient> {
  // (started already - by a file it reads, a step it does: said to be ready, as asked for a role)
  if (workerRunning(plugin.id) && !starting.has(plugin.id))
    return workerOf(plugin).then((w) => {
      useChem.setState({ state: "ready", plugin: plugin.name, version: w.version });
      return w.chem;
    });
  let worker = starting.get(plugin.id);
  if (!worker) {
    worker = start(plugin).catch((e: unknown) => {
      starting.delete(plugin.id);
      const message = e instanceof Error ? e.message : String(e);
      useChem.setState(e instanceof TakenAway ? { state: "idle" } : { state: "failed", message });
      throw e;
    });
    starting.set(plugin.id, worker);
  }
  return worker;
}

/**
 * Whether what fills `role` can be had without asking anything: running, or
 * set up and only to be started. What runs by itself - the checks on a
 * structure - runs only then; setting a plugin up is always something the
 * user asked for.
 */
export async function chemAtHand(role: RoleId = "checks"): Promise<boolean> {
  const plugin = rolePlugin(role);
  if (!plugin) return false;
  return workerRunning(plugin.id) || (await pyEnvReady(plugin.profile));
}

async function start(plugin: PythonPlugin): Promise<ChemClient> {
  if (takenAway(plugin) && !(await pyEnvReady(plugin.profile))) {
    throw new TakenAway(`${plugin.name} was taken away: add it in Settings, Plugins.`);
  }
  useChem.setState({ state: "setting-up", plugin: plugin.name });
  await ensurePyEnv(plugin.profile);
  useChem.setState({ state: "starting", plugin: plugin.name });
  const worker = await workerOf(plugin);
  starting.delete(plugin.id);
  useChem.setState({ state: "ready", plugin: plugin.name, version: worker.version });
  return worker.chem;
}
