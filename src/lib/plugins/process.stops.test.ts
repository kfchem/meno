import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PythonPlugin } from "../calc/catalog";

type Handler = (e: { payload: string }) => void;
/** The app's events, as the test has them: who listens to each. */
const listeners = new Map<string, Set<Handler>>();
/** Every command the page sent, in order. */
const calls: { cmd: string; args: Record<string, unknown> }[] = [];
/** Sidecars the "app" has running. */
const alive = new Set<string>();
/** Exits the app has emitted that the page has not heard yet (an event comes when it comes). */
const exitsOnTheirWay: string[] = [];
let nextSidecar = 1;
let spawnFails = false;

const emit = (name: string, payload: unknown) => listeners.get(name)?.forEach((f) => f({ payload: JSON.stringify(payload) }));
const listening = () => [...listeners.values()].reduce((n, s) => n + s.size, 0);

vi.mock("@tauri-apps/api/event", () => ({
  listen: async (name: string, f: Handler) => {
    const set = listeners.get(name) ?? new Set<Handler>();
    set.add(f);
    listeners.set(name, set);
    return () => void set.delete(f);
  },
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args: Record<string, unknown>) => {
    calls.push({ cmd, args });
    if (cmd === "ext_spawn_sidecar") {
      if (spawnFails) throw "sidecar entry must be inside the app's Python environments";
      const id = `w${nextSidecar++}`;
      alive.add(id);
      return id;
    }
    if (cmd === "ext_kill") {
      // (lib.rs: reaped, and its exit emitted - heard by the page some time later)
      if (alive.delete(String(args.id))) exitsOnTheirWay.push(String(args.id));
      return undefined;
    }
    return undefined;
  },
}));
vi.mock("@tauri-apps/api/path", () => ({ resolveResource: async (p: string) => `/resources/${p}` }));
vi.mock("../pyEnv", () => ({
  pyEnvReady: async () => true,
  ensurePyEnv: async () => "/data/uv/plugin-demo/venv/bin/python",
  pluginFilesFolder: async () => null,
}));

const { workerOf, stopWorker, workerRunning } = await import("./process");

const demo = { id: "demo", name: "Demo", profile: "plugin-demo", worker: "resources/plugins/demo/worker.py" } as unknown as PythonPlugin;

/** Lets the page's promises run on (no timer moves). */
const ticks = async (n = 200) => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};
const spawned = () => calls.filter((c) => c.cmd === "ext_spawn_sidecar").length;
const killed = (id: string) => calls.some((c) => c.cmd === "ext_kill" && c.args.id === id);
/** A worker saying its first line. */
const ready = (id: string) => emit("ext:stdout", { id, line: JSON.stringify({ event: "ready", version: "1.0" }) });
/** The exits emitted so far, heard now. */
const hearExits = () => exitsOnTheirWay.splice(0).forEach((id) => emit("ext:exit", { id }));
/** A worker started and ready: the one asked for. */
async function started() {
  const asked = workerOf(demo);
  await ticks();
  ready(`w${nextSidecar - 1}`);
  return asked;
}

describe("a plugin's worker, stopped and started again", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    listeners.clear();
    calls.length = 0;
    alive.clear();
    exitsOnTheirWay.length = 0;
    nextSidecar = 1;
    spawnFails = false;
  });
  afterEach(async () => {
    // (whatever still waits, let run out; whatever runs, stopped)
    hearExits();
    await vi.advanceTimersByTimeAsync(300_000);
    await stopWorker("demo").catch(() => {});
    hearExits();
    vi.useRealTimers();
  });

  it("takes the exit of a worker stopped, heard late, for its own - not for that of the one started after it", async () => {
    await started();
    // (held on a question past its time, say: stopped - its exit on its way)
    const stopping = stopWorker("demo");
    await ticks();
    // asked again at once (the next file of several being read, say): a new worker
    const b = await started();
    expect(b.id).toBe("w2");
    // the first one's exit heard now
    hearExits();
    await stopping;
    await ticks();
    // the new one is still Meno's to stop, and asked again, it is the one asked
    expect(workerRunning("demo")).toBe(true);
    const again = workerOf(demo);
    await ticks();
    ready(`w${nextSidecar - 1}`);
    expect((await again).id).toBe("w2");
    expect(spawned()).toBe(2);
  });

  /** A worker that went of itself, a new one started after it, and the first one's client asked - as finishStep's loop over a step's jobs asks the client it took before the loop. */
  async function askedAfterItWent() {
    const a = await started();
    alive.delete(a.id);
    emit("ext:exit", { id: a.id });
    await ticks();
    const b = await started();
    let failed = false;
    a.reader.collect("energy", [], {}, {}, "", "done").catch(() => (failed = true));
    return { b, failed: () => failed };
  }

  it("fails a question asked of a worker that has gone at once, not when its 120 s are out", async () => {
    const { failed } = await askedAfterItWent();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(failed()).toBe(true);
  });

  it("... and does not stop the worker that runs now when its time would have run out", async () => {
    const { b } = await askedAfterItWent();
    await vi.advanceTimersByTimeAsync(130_000);
    expect(killed(b.id)).toBe(false);
  });

  it("fails the start of a worker that goes as it starts at once, saying why as it said - not when its 90 s are out", async () => {
    let said: string | null = null;
    workerOf(demo).catch((e: Error) => (said = e.message));
    await ticks();
    // it went before it said it was ready (an import failed, say)
    emit("ext:stderr", { id: "w1", line: "Traceback (most recent call last):" });
    emit("ext:stderr", { id: "w1", line: "ModuleNotFoundError: No module named 'demo'" });
    emit("ext:stderr", { id: "w9", line: "what another worker said" });
    alive.delete("w1");
    emit("ext:exit", { id: "w1" });
    await ticks();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(said).toBe("Demo stopped as it started: ModuleNotFoundError: No module named 'demo'");
    // (asked again: started afresh)
    expect(workerRunning("demo")).toBe(false);
  });

  it("leaves a question asked before the worker went failing with why, at once", async () => {
    const a = await started();
    let said: string | null = null;
    a.reader.probe("xyz", "a.xyz", "3").catch((e: Error) => (said = e.message));
    alive.delete(a.id);
    emit("ext:exit", { id: a.id });
    await ticks();
    expect(said).toBe("Demo stopped");
  });

  it("leaves nothing listening where a worker could not be started", async () => {
    spawnFails = true;
    await expect(workerOf(demo)).rejects.toBeTruthy();
    // (each failed start leaves its two listeners, the stdout one keeping every line of every worker for good)
    expect(listening()).toBe(0);
  });
});
