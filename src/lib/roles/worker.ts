import { create } from "zustand";
import { ensurePyEnv, pyEnvReady } from "../pyEnv";
import { pluginById, pluginsFilling, type PythonPlugin } from "../calc/catalog";
import { ROLES, type RoleId } from "../plugins/roles";
import { useAppSettings } from "../settings/appSettings";
import { onWorkerStopped, workerOf, workerRunning } from "../plugins/process";
import { useReaders } from "../calc/workers";
import type { ChemClient } from "./client";

/**
 * The worker of the plugin that fills a role (lib/plugins/roles,
 * docs/PLUGINS.md): the plugin chosen for the role where it is used - else
 * the first that fills it - set up the first time a role it fills is
 * needed, asking before it downloads, and started, then kept while it is
 * used: the one process the plugin has (lib/plugins/process). One the
 * chemist took away in Settings, Plugins is not set up again of itself:
 * the role says to add it.
 */

export type ChemState =
  | { state: "idle" }
  | { state: "setting-up"; plugin: string; id: string }
  | { state: "starting"; plugin: string }
  | { state: "ready"; plugin: string; version: string }
  | { state: "failed"; message: string };

export const useChem = create<ChemState>(() => ({ state: "idle" }));

/**
 * The plugin that fills a role: the one chosen, where it fills it - unless
 * the chemist took it away and another that fills it is added (the
 * maintainer, 2026-10-12); else the one added that does - the one the
 * chemist added, of two that read pictures; else the one that does. None,
 * where several are added, or none is and several could be, and nothing says
 * which (`roleUndecided`): the chemist chooses, in Settings, never the first
 * by its name (the maintainer, 2026-11-02).
 */
export function rolePlugin(role: RoleId): PythonPlugin | undefined {
  const can = pluginsFilling(role);
  const { roles, removed } = useAppSettings.getState().plugins;
  const picked = can.find((p) => p.id === roles[role]);
  const added = addedFilling(role);
  if (picked && removed.includes(picked.id) && added.length === 1) return added[0];
  return picked ?? (added.length ? (added.length === 1 ? added[0] : undefined) : can.length === 1 ? can[0] : undefined);
}

/** The plugins that could fill a role where nothing says which does (`rolePlugin` none): those added, or, none added, all that fill it. None, where it is decided or nothing fills it. */
export function roleUndecided(role: RoleId): PythonPlugin[] {
  if (rolePlugin(role)) return [];
  const can = pluginsFilling(role);
  const added = addedFilling(role);
  return added.length > 1 ? added : can.length > 1 ? can : [];
}

/** The plugins added that fill a role, none the chemist took away: what fills it where none is chosen. */
function addedFilling(role: RoleId): PythonPlugin[] {
  const { removed } = useAppSettings.getState().plugins;
  const state = useReaders.getState().state;
  return pluginsFilling(role).filter((p) => state[p.id] === "added" && !removed.includes(p.id));
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
  const undecided = plugin ? [] : roleUndecided(role);
  if (undecided.length) return Promise.reject(new Error(`${undecided.map((p) => p.name).join(" and ")} each do this: ${ROLES[role].name} - choose which in Settings.`));
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
  // (said to be setting up only where there is something to set up: one set up already is starting at once)
  if (!(await pyEnvReady(plugin.profile))) useChem.setState({ state: "setting-up", plugin: plugin.name, id: plugin.id });
  await ensurePyEnv(plugin.profile);
  useChem.setState({ state: "starting", plugin: plugin.name });
  const worker = await workerOf(plugin);
  starting.delete(plugin.id);
  useChem.setState({ state: "ready", plugin: plugin.name, version: worker.version });
  return worker.chem;
}
