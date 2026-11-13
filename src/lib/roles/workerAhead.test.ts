import { afterEach, describe, expect, it, vi } from "vitest";

// A plugin's environment set up or not, its worker running or not, and whether it starts: as each test says.
const env = { ready: true, running: false, fails: false, setUp: 0, started: 0 };
vi.mock("../pyEnv", () => ({
  ensurePyEnv: async () => {
    env.setUp++;
    return "";
  },
  pyEnvReady: async () => env.ready,
}));
vi.mock("../plugins/process", () => ({
  onWorkerStopped: () => {},
  workerRunning: () => env.running,
  workerOf: async () => {
    env.started++;
    if (env.fails) throw new Error("the worker did not start");
    return { version: "1", chem: {} };
  },
}));

const { rolePlugin, roleUndecided, startAhead, useChem, useRoleOffer } = await import("./worker");
const { useAppSettings } = await import("../settings/appSettings");
const { useReaders } = await import("../calc/workers");

const takenAway = (ids: string[]) => useAppSettings.setState((s) => ({ plugins: { ...s.plugins, removed: ids } }));

describe("what reads a SMILES, started before a SMILES is typed", () => {
  afterEach(() => {
    Object.assign(env, { ready: true, running: false, fails: false, setUp: 0, started: 0 });
    takenAway([]);
    useReaders.setState({ state: {} });
    useChem.setState({ state: "idle" });
    useRoleOffer.setState({ role: null });
  });

  it("is started where its plugin is set up: said to be starting, then ready, nothing set up", async () => {
    expect(rolePlugin("smiles")).toBeDefined();
    const seen: string[] = [];
    const stop = useChem.subscribe((s) => seen.push(s.state));
    await startAhead("smiles");
    stop();
    expect(env.started).toBe(1);
    expect(env.setUp).toBe(1);
    expect(seen).toEqual(["starting", "ready"]);
  });

  it("is not set up, where its plugin is not: nothing asked, nothing said", async () => {
    env.ready = false;
    await startAhead("smiles");
    expect(env.setUp).toBe(0);
    expect(env.started).toBe(0);
    expect(useChem.getState().state).toBe("idle");
  });

  it("is not started where the chemist took its plugin away, though its files are still there", async () => {
    takenAway([rolePlugin("smiles")!.id]);
    await startAhead("smiles");
    expect(env.started).toBe(0);
    expect(useChem.getState().state).toBe("idle");
  });

  it("offers nothing where no plugin here fills the role, or several do and none is chosen", async () => {
    // (a role two plugins fill, neither added nor chosen: undecided)
    expect(roleUndecided("pictures").length).toBeGreaterThan(1);
    await expect(startAhead("pictures")).resolves.toBeUndefined();
    expect(env.started).toBe(0);
    expect(useRoleOffer.getState().role).toBeNull();
  });

  it("lets a start that fails go quietly here: the failure is the worker's state, and a SMILES asked for later starts it again", async () => {
    env.fails = true;
    await expect(startAhead("smiles")).resolves.toBeUndefined();
    expect(useChem.getState().state).toBe("failed");
    env.fails = false;
    await startAhead("smiles");
    expect(env.started).toBe(2);
    expect(useChem.getState().state).toBe("ready");
  });
});
