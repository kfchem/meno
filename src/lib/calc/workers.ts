import { create } from "zustand";
import { ensurePyEnv, pyEnvReady, removePyEnv } from "../pyEnv";
import { manifestOf, READERS, runs, type Plugin, type PythonPlugin, type ReaderPlugin } from "./catalog";
import { registerKinds } from "../io/kinds";
import type { Manifest } from "../plugins/manifest";
import type { ReaderClient, Reader } from "./client";
import { menoReader } from "./builtin";
import { stopWorker, workerOf } from "../plugins/process";
import { useAppSettings } from "../settings/appSettings";
import { forThisSystem } from "../plugins/here";

/**
 * The plugins on this computer, and the readers' workers: a plugin is added
 * - its environment set up, asking first for the network - in Settings,
 * *Plugins*, and taken away there; a plugin that fills a role is set up as
 * well the first time the role is needed, unless it was taken away
 * (lib/roles/worker). Its worker is started the first time it is asked to
 * read, write or do a step - or fill a role - then kept for the session, one
 * for all of these (lib/plugins/process). Meno's own reading is always
 * there, and runs in the app (./builtin). The kinds a plugin brings are
 * registered while it is added, and only then (lib/io/kinds).
 */
export type ReaderState = "absent" | "adding" | "added" | "removing";

export const useReaders = create<{
  /** Each reader's, by id; unknown until looked at. */
  state: Record<string, ReaderState>;
  /** What went wrong last, for a reader, in words. */
  problem: Record<string, string>;
}>(() => ({ state: {}, problem: {} }));

const setState = (id: string, state: ReaderState, problem?: string) => {
  useReaders.setState((s) => ({
    state: { ...s.state, [id]: state },
    problem: problem ? { ...s.problem, [id]: problem } : Object.fromEntries(Object.entries(s.problem).filter(([k]) => k !== id)),
  }));
  // (the kinds of the plugins added - until one is taken away - registered with Meno's own)
  const now = useReaders.getState().state;
  registerKinds(
    Object.keys(now)
      .filter((p) => now[p] === "added" || now[p] === "removing")
      .map(manifestOf)
      .filter((m): m is Manifest => m != null),
  );
};

let meno: Reader | null = null;

/** The readers - and plugins - added on this computer, looked at afresh: Meno's own always; one that runs nothing unless taken away. */
export async function addedReaders(plugins: readonly (ReaderPlugin | Plugin)[] = READERS): Promise<Set<string>> {
  const added = new Set<string>();
  for (const p of plugins) {
    if (p.builtin) {
      setState(p.id, "added");
      added.add(p.id);
      continue;
    }
    const here = useReaders.getState().state[p.id];
    if (here === "adding" || here === "removing") continue;
    const ready = runs(p) ? await pyEnvReady(p.profile) : !useAppSettings.getState().plugins.removed.includes(p.id);
    setState(p.id, ready ? "added" : "absent");
    if (ready) added.add(p.id);
  }
  return added;
}

/** Whether the chemist took a plugin away, or brought it back: what sets it up again of itself (lib/roles/worker). */
function markTakenAway(p: Plugin, away: boolean) {
  const settings = useAppSettings.getState();
  const removed = settings.plugins.removed.filter((id) => id !== p.id);
  settings.setPlugins({ ...settings.plugins, removed: away ? [...removed, p.id] : removed });
}

/** Adds a plugin: sets its environment up, asking first whether it may download - one that runs nothing, at once. */
export async function addPlugin(p: Plugin): Promise<void> {
  if (!forThisSystem(p)) throw new Error(`${p.name} is not made for this system.`);
  if (!runs(p)) {
    markTakenAway(p, false);
    setState(p.id, "added");
    return;
  }
  setState(p.id, "adding");
  try {
    await ensurePyEnv(p.profile);
    markTakenAway(p, false);
    setState(p.id, "added");
  } catch (e) {
    setState(p.id, "absent", e instanceof Error ? e.message : String(e));
    throw e;
  }
}

/** Takes a plugin away: its worker stopped, its environment removed - and, where it fills a role, not set up again of itself; one that runs nothing, at once. */
export async function removePlugin(p: Plugin): Promise<void> {
  if (!runs(p)) {
    markTakenAway(p, true);
    setState(p.id, "absent");
    return;
  }
  setState(p.id, "removing");
  try {
    await stopWorker(p.id);
    await removePyEnv(p.profile);
    markTakenAway(p, true);
    setState(p.id, "absent");
  } catch (e) {
    setState(p.id, "added", e instanceof Error ? e.message : String(e));
    throw e;
  }
}

/** A reader's worker, started the first time it is asked for; the reader must be added. */
export function readerClient(p: ReaderPlugin): Promise<Reader> {
  if (p.builtin) return Promise.resolve((meno ??= menoReader()));
  return workerOf(p).then((w) => w.reader);
}

/** A plugin's worker, as its client: what a step it fills is asked of (`prepare`, `collect`); the plugin must be added. */
export function pluginClient(p: PythonPlugin): Promise<ReaderClient> {
  return workerOf(p).then((w) => w.reader);
}
