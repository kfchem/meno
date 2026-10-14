import { afterEach, describe, expect, it, vi } from "vitest";

// What a plugin's worker is said to be doing as it is first asked for: its environment set up or not, as the test says.
let ready = true;
vi.mock("../pyEnv", () => ({ ensurePyEnv: async () => "", pyEnvReady: async () => ready }));
vi.mock("../plugins/process", () => ({
  onWorkerStopped: () => {},
  workerRunning: () => false,
  workerOf: async () => ({ version: "1", chem: {} }),
}));

const { pluginWorker, useChem } = await import("./worker");
const { PLUGINS } = await import("../calc/catalog");

async function statesStarting(id: string): Promise<string[]> {
  const seen: string[] = [];
  const stop = useChem.subscribe((s) => seen.push(s.state));
  await pluginWorker(PLUGINS.find((p) => p.id === id)!);
  stop();
  return seen;
}

describe("a plugin's worker, asked for the first time", () => {
  afterEach(() => {
    ready = true;
    useChem.setState({ state: "idle" });
  });

  it("is starting at once where its plugin is set up already - not said to be setting up, a moment, first", async () => {
    expect(await statesStarting("rdkit")).toEqual(["starting", "ready"]);
  });

  it("is setting up first where its plugin is not set up yet", async () => {
    ready = false;
    expect(await statesStarting("xtb")).toEqual(["setting-up", "starting", "ready"]);
  });
});
