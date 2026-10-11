/**
 * A plugin's worker, one process for the session (docs/PLUGINS.md, *When
 * plugins run*): started the first time anything asks it - a role it fills
 * (lib/roles/worker), a file it reads or writes, a step it fills
 * (lib/calc/workers) - and asked by all of them, each through a client of
 * its own whose questions' ids it shares; kept until the plugin is taken
 * away or Meno quits, and started again if it stops. The plugin must be set
 * up: setting it up - asking first for the network - is for whoever asks
 * to do. A worker has no business on the network; the app keeps it off it.
 *
 * It says it is ready, and its version - that of what it brings, as it
 * runs - in its first line: `{"event": "ready", "version": ...}`.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { resolveResource } from "@tauri-apps/api/path";
import { ensurePyEnv, pyEnvReady } from "../pyEnv";
import type { PythonPlugin } from "../calc/catalog";
import { counter, ReaderClient } from "../calc/client";
import { ChemClient } from "../roles/client";

/** A plugin's worker, running: its clients - for files and steps, and for the roles it fills - its process, and its version. */
export type PluginWorker = { reader: ReaderClient; chem: ChemClient; id: string; version: string };

/** How long a worker's first import may take: a cold start is slow. */
const READY_MS = 90_000;

const running = new Map<string, Promise<PluginWorker>>();
const whenStopped = new Set<(plugin: string) => void>();

/** Hears each plugin whose worker stops - taken away, or gone of itself; the function returned stops hearing. */
export function onWorkerStopped(f: (plugin: string) => void): () => void {
  whenStopped.add(f);
  return () => whenStopped.delete(f);
}

/** Whether a plugin's worker is running, or starting. */
export const workerRunning = (plugin: string): boolean => running.has(plugin);

/** A plugin's worker, started the first time it is asked for; the plugin must be set up. */
export function workerOf(p: PythonPlugin): Promise<PluginWorker> {
  let worker = running.get(p.id);
  if (!worker) {
    worker = start(p);
    running.set(p.id, worker);
    worker.catch(() => {
      if (running.get(p.id) === worker) running.delete(p.id);
    });
  }
  return worker;
}

/** Stops a plugin's worker, where it runs: as the plugin is taken away. */
export async function stopWorker(plugin: string): Promise<void> {
  const worker = running.get(plugin);
  if (!worker) return;
  running.delete(plugin);
  const w = await worker.catch(() => null);
  if (!w) return;
  w.reader.close(`${plugin} was taken away`);
  w.chem.close(`${plugin} was taken away`);
  await invoke("ext_kill", { id: w.id }).catch(() => undefined);
  whenStopped.forEach((f) => f(plugin));
}

type Line = { id: string; line: string };

async function start(p: PythonPlugin): Promise<PluginWorker> {
  if (!(await pyEnvReady(p.profile))) throw new Error(`${p.name} is not added: add it in Settings, Plugins.`);
  const python = await ensurePyEnv(p.profile);
  const script = await resolveResource(p.worker);
  // (heard from before the worker's id is known, so that nothing it says
  // first is missed; kept to its own lines once it is)
  let id: string | null = null;
  const early: Line[] = [];
  const onLine = new Set<(line: string) => void>();
  const hear = (m: Line) => {
    if (id === null) early.push(m);
    else if (m.id === id) onLine.forEach((f) => f(m.line));
  };
  const transport = {
    send: (line: string) => {
      if (id !== null) void invoke("ext_stdin", { id, data: line + "\n" });
    },
    listen: (f: (line: string) => void) => {
      onLine.add(f);
      return () => onLine.delete(f);
    },
  };
  const ids = counter();
  const reader = new ReaderClient(p.name, transport, undefined, ids);
  const chem = new ChemClient(transport, undefined, p.name, ids);
  const stopOut = await listen<string>("ext:stdout", (e) => hear(JSON.parse(e.payload)));
  const stopExit = await listen<string>("ext:exit", (e) => {
    if (JSON.parse(e.payload).id !== id) return;
    reader.close(`${p.name} stopped`);
    chem.close(`${p.name} stopped`);
    stopOut();
    stopExit();
    // (gone of itself: started again when next asked)
    if (running.has(p.id)) {
      running.delete(p.id);
      whenStopped.forEach((f) => f(p.id));
    }
  });
  id = await invoke<string>("ext_spawn_sidecar", { payload: { entry: python, args: ["-u", script] } });
  const worker = id;
  for (const m of early.splice(0)) if (m.id === worker) onLine.forEach((f) => f(m.line));
  try {
    const version = await Promise.race([
      reader.ready,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${p.name} did not start in time`)), READY_MS)),
    ]);
    return { reader, chem, id: worker, version };
  } catch (e) {
    void invoke("ext_kill", { id: worker }).catch(() => undefined);
    throw e;
  }
}
