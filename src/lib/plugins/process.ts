/**
 * A plugin's worker, one process at a time (docs/PLUGINS.md, *When
 * plugins run*): started the first time anything asks it - a role it fills
 * (lib/roles/worker), a file it reads or writes, a step it fills
 * (lib/calc/workers) - and asked by all of them, each through a client of
 * its own whose questions' ids it shares; kept while it is used - stopped
 * once unused for 15 minutes with no job of its plugin waiting or running
 * (./idle), as when the plugin is taken away or Meno quits - and started
 * again when next asked, as if it stops of itself. The plugin must be set
 * up: setting it up - asking first for the network - is for whoever asks
 * to do. A worker has no business on the network; the app keeps it off it.
 * A worker held on a question past its time - the one it was on, none
 * asked before it still waiting (./queue) - is stopped, and started afresh
 * when next asked: what else was waiting on it fails, saying so.
 *
 * It says it is ready, and its version - that of what it brings, as it
 * runs - in its first line: `{"event": "ready", "version": ...}`. A plugin
 * that downloads files besides its environment is given the folder they
 * are kept in as its one argument.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { resolveResource } from "@tauri-apps/api/path";
import { ensurePyEnv, pluginFilesFolder, pyEnvReady } from "../pyEnv";
import type { PythonPlugin } from "../calc/catalog";
import { counter, ReaderClient } from "../calc/client";
import { workerQueue } from "./queue";
import { idleWatch, watchAll } from "./idle";
import { liveJobsOf } from "../jobs";
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
    // (whether this worker is the plugin's still: not once stopped, nor once another is started in its place)
    const mine = () => running.get(p.id) === worker;
    worker = start(p, mine);
    running.set(p.id, worker);
    worker.catch(() => {
      if (running.get(p.id) === worker) running.delete(p.id);
    });
  }
  return worker;
}

/** Stops a plugin's worker, where it runs: as the plugin is taken away - or, held on a question past its time, to be started afresh (`reason` says which to what was waiting on it). */
export async function stopWorker(plugin: string, reason = `${plugin} was taken away`): Promise<void> {
  const worker = running.get(plugin);
  if (!worker) return;
  running.delete(plugin);
  // (said at once, before anything is waited for: what keeps it - roles/worker's - lets it go now, not after the kill)
  whenStopped.forEach((f) => f(plugin));
  const w = await worker.catch(() => null);
  if (!w) return;
  w.reader.close(reason);
  w.chem.close(reason);
  await invoke("ext_kill", { id: w.id }).catch(() => undefined);
}

type Line = { id: string; line: string };

/** How many of the last lines a worker wrote to its standard error are kept: the last says why one that stopped as it started did. */
const ERR_LINES = 5;

async function start(p: PythonPlugin, mine: () => boolean): Promise<PluginWorker> {
  if (!(await pyEnvReady(p.profile))) throw new Error(`${p.name} is not added: add it in Settings, Plugins.`);
  const python = await ensurePyEnv(p.profile);
  const script = await resolveResource(p.worker);
  const files = await pluginFilesFolder(p);
  // (heard from before the worker's id is known, so that nothing it says
  // first is missed; kept to its own lines once it is)
  let id: string | null = null;
  const early: Line[] = [];
  const onLine = new Set<(line: string) => void>();
  const hear = (m: Line) => {
    if (id === null) early.push(m);
    else if (m.id === id) {
      idle.heard();
      onLine.forEach((f) => f(m.line));
    }
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
  // (held on a question past its time: stopped, and started afresh when next asked - this one only, not one started since)
  const held = workerQueue(() => {
    if (mine()) void stopWorker(p.id, `${p.name} was started again: it did not finish what it was asked before in time`);
  });
  // (unused long enough: stopped, and started afresh when next asked)
  // (stopped unused, its clients hand what they are asked after to the worker started in its place - once each)
  const handOver = () => {
    reader.handOver(async () => (await workerOf(p)).reader);
    chem.handOver(async () => (await workerOf(p)).chem);
  };
  const idle = idleWatch(() => stopIfUnused(p, mine, idle, handOver));
  const queue = watchAll(held, idle);
  const reader = new ReaderClient(p.name, transport, undefined, ids, queue);
  const chem = new ChemClient(transport, undefined, p.name, ids, queue);
  const errs: Line[] = [];
  const stopErr = await listen<string>("ext:stderr", (e) => {
    const m: Line = JSON.parse(e.payload);
    if (id === null || m.id === id) errs.push(m);
    if (errs.length > ERR_LINES * 4) errs.splice(0, errs.length - ERR_LINES * 4);
  });
  const stopOut = await listen<string>("ext:stdout", (e) => hear(JSON.parse(e.payload)));
  const unhear = () => {
    stopOut();
    stopExit();
    stopErr();
  };
  let wasReady = false;
  const stopExit = await listen<string>("ext:exit", (e) => {
    if (JSON.parse(e.payload).id !== id) return;
    idle.end();
    // (gone as it started: why, as it said - a module it could not import, say)
    const told = errs.filter((m) => m.id === id && m.line.trim());
    const why = told.length ? told[told.length - 1].line.trim() : null;
    const said = wasReady ? `${p.name} stopped` : `${p.name} stopped as it started${why ? `: ${why}` : ""}`;
    reader.close(said);
    chem.close(said);
    unhear();
    // (gone of itself: started again when next asked - unless stopped already, or another is started in its place)
    if (mine()) {
      running.delete(p.id);
      whenStopped.forEach((f) => f(p.id));
    }
  });
  try {
    id = await invoke<string>("ext_spawn_sidecar", { payload: { entry: python, args: ["-u", script, ...(files ? [files] : [])] } });
  } catch (e) {
    // (not started: nothing left listening)
    idle.end();
    unhear();
    throw e;
  }
  const worker = id;
  for (const m of early.splice(0)) if (m.id === worker) onLine.forEach((f) => f(m.line));
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const version = await Promise.race([
      reader.ready,
      new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`${p.name} did not start in time`)), READY_MS))),
    ]).finally(() => clearTimeout(timer));
    wasReady = true;
    return { reader, chem, id: worker, version };
  } catch (e) {
    idle.end();
    void invoke("ext_kill", { id: worker }).catch(() => undefined);
    throw e;
  }
}

/**
 * A worker gone unused (./idle) stopped - unless a job of its plugin waits
 * or runs, or it is asked something meanwhile: kept. Nothing waits on it,
 * so its stopping is no one's error; the next question starts it afresh,
 * saying so as a first start does. True where it is stopped, or gone.
 */
async function stopIfUnused(p: PythonPlugin, mine: () => boolean, idle: { busy(): boolean }, handOver: () => void): Promise<boolean> {
  if (!mine()) return true;
  // (jobs not known: kept, to be looked at again)
  const live = await liveJobsOf(p.id).catch(() => null);
  if (!mine()) return true;
  if (!live || live.length || idle.busy()) return false;
  handOver();
  await stopWorker(p.id, `${p.name} was stopped, unused`);
  return true;
}
