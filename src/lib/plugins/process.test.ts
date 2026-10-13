import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The backend, as the test has it: the workers started, what each was sent, the jobs Meno knows of. */
const backend = {
  spawned: [] as string[],
  killed: [] as string[],
  sent: [] as { id: string; data: string }[],
  jobs: [] as { id: string; plugin: string; state: string }[],
  /** Each worker's answer to a question: at once, or held (none). */
  answering: true,
};
const listeners = new Map<string, Set<(e: { payload: string }) => void>>();
const emit = (event: string, payload: unknown) => listeners.get(event)?.forEach((f) => f({ payload: JSON.stringify(payload) }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args: { id?: string; data?: string }) => {
    if (cmd === "ext_spawn_sidecar") {
      const id = `w${backend.spawned.length + 1}`;
      backend.spawned.push(id);
      // (it says it is ready once started)
      setTimeout(() => emit("ext:stdout", { id, line: JSON.stringify({ event: "ready", version: "1" }) }), 10);
      return id;
    }
    if (cmd === "ext_stdin") {
      backend.sent.push({ id: args.id!, data: args.data! });
      const q = JSON.parse(args.data!);
      if (backend.answering) setTimeout(() => emit("ext:stdout", { id: args.id, line: JSON.stringify({ id: q.id, ok: true, result: { yes: true } }) }), 10);
      return undefined;
    }
    if (cmd === "ext_kill") {
      backend.killed.push(args.id!);
      emit("ext:exit", { id: args.id });
      return undefined;
    }
    if (cmd === "jobs_list") return backend.jobs;
    return undefined;
  },
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: async (event: string, f: (e: { payload: string }) => void) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(f);
    return () => listeners.get(event)!.delete(f);
  },
}));
vi.mock("@tauri-apps/api/path", () => ({ resolveResource: async (p: string) => `/app/${p}` }));
vi.mock("../pyEnv", () => ({
  pyEnvReady: async () => true,
  ensurePyEnv: async () => "/env/bin/python",
  pluginFilesFolder: async () => null,
}));

import type { PythonPlugin } from "../calc/catalog";
import { IDLE_MS } from "./idle";
import { onWorkerStopped, stopWorker, workerOf, workerRunning } from "./process";

const plugin = { id: "cclib", name: "cclib", profile: "plugin-cclib", worker: "resources/plugins/cclib/worker.py" } as unknown as PythonPlugin;

describe("a plugin's worker gone unused", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(backend, { spawned: [], killed: [], sent: [], jobs: [], answering: true });
  });
  afterEach(async () => {
    await stopWorker(plugin.id);
    vi.useRealTimers();
  });

  it("is stopped after 15 minutes - as no one's error - and started afresh by the next question", async () => {
    const stopped: string[] = [];
    const unhear = onWorkerStopped((p) => stopped.push(p));
    const w = workerOf(plugin);
    await vi.advanceTimersByTimeAsync(20);
    const first = await w;
    const answer = first.reader.probe("out", "a.out", "head");
    await vi.advanceTimersByTimeAsync(20);
    expect(await answer).toBe(true);
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1000);
    expect(backend.killed).toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(backend.killed).toEqual(["w1"]);
    expect(workerRunning(plugin.id)).toBe(false);
    expect(stopped).toEqual(["cclib"]);
    // (the next question: a worker started afresh, which answers it)
    const again = workerOf(plugin);
    await vi.advanceTimersByTimeAsync(20);
    const second = await again;
    expect(second.id).toBe("w2");
    const answered = second.reader.probe("out", "b.out", "head");
    await vi.advanceTimersByTimeAsync(20);
    expect(await answered).toBe(true);
    unhear();
  });

  it("is said to be stopped before it is killed, and a question on its old client goes to the worker started in its place", async () => {
    const heard: string[][] = [];
    const unhear = onWorkerStopped(() => heard.push([...backend.killed]));
    const w = workerOf(plugin);
    await vi.advanceTimersByTimeAsync(20);
    const first = await w;
    await vi.advanceTimersByTimeAsync(IDLE_MS);
    // (heard while it was still to be killed: what keeps it let go of it first)
    expect(heard).toEqual([[]]);
    expect(backend.killed).toEqual(["w1"]);
    // (asked of the client of the worker stopped unused: a worker started afresh answers)
    const answered = first.reader.probe("out", "late.out", "head");
    await vi.advanceTimersByTimeAsync(40);
    expect(await answered).toBe(true);
    expect(backend.spawned).toEqual(["w1", "w2"]);
    expect(backend.sent[backend.sent.length - 1].id).toBe("w2");
    unhear();
  });

  it("is kept while a question waits for its answer, and counted afresh from that answer", async () => {
    const w = workerOf(plugin);
    await vi.advanceTimersByTimeAsync(20);
    const first = await w;
    backend.answering = false;
    // (asked just before the clock is up, and answered a minute later)
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1000);
    const asked = first.reader.probe("out", "c.out", "head");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(backend.killed).toEqual([]);
    const q = JSON.parse(backend.sent[backend.sent.length - 1].data);
    emit("ext:stdout", { id: "w1", line: JSON.stringify({ id: q.id, ok: true, result: { yes: true } }) });
    expect(await asked).toBe(true);
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1000);
    expect(backend.killed).toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(backend.killed).toEqual(["w1"]);
  });

  it("is kept while a job of its plugin waits or runs, and stopped once none does", async () => {
    backend.jobs = [{ id: "j1", plugin: "cclib", state: "running" }, { id: "j2", plugin: "xtb", state: "done" }];
    const w = workerOf(plugin);
    await vi.advanceTimersByTimeAsync(20);
    await w;
    await vi.advanceTimersByTimeAsync(IDLE_MS * 2 + 1000);
    expect(backend.killed).toEqual([]);
    backend.jobs = [{ id: "j1", plugin: "cclib", state: "done" }];
    await vi.advanceTimersByTimeAsync(IDLE_MS);
    expect(backend.killed).toEqual(["w1"]);
  });
});
