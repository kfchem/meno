import { afterEach, describe, expect, it, vi } from "vitest";

// What a plugin's worker is said to be doing as it is first asked for: its environment set up or not, as the test says.
let ready = true;
// (what the back end says where it will not start the worker: made-up text naming a file, as such text does)
let refused: string | null = null;
vi.mock("../pyEnv", () => ({ ensurePyEnv: async () => "", pyEnvReady: async () => ready }));
vi.mock("../plugins/process", () => ({
  onWorkerStopped: () => {},
  workerRunning: () => false,
  workerOf: async () => {
    if (refused) throw refused;
    return { version: "1", chem: {} };
  },
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
    refused = null;
    useChem.setState({ state: "idle" });
  });

  it("is starting at once where its plugin is set up already - not said to be setting up, a moment, first", async () => {
    expect(await statesStarting("sketchkit")).toEqual(["starting", "ready"]);
  });

  it("is setting up first where its plugin is not set up yet", async () => {
    ready = false;
    expect(await statesStarting("tightbind")).toEqual(["setting-up", "starting", "ready"]);
  });

  it("that cannot be started is said so in plain words, with what to do - what the back end said kept off the screen, for the log", async () => {
    refused = "forbidden path: /home/someone/data/uv/plugin-x/venv/bin/python";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const plugin = PLUGINS.find((p) => p.id === "sketchkit")!;
    const said = await pluginWorker(plugin).then(
      () => "started",
      (e: unknown) => (e instanceof Error ? e.message : String(e)),
    );
    expect(said).toBe(`${plugin.name} could not be started. Remove it and add it again in Settings, Plugins.`);
    expect(useChem.getState()).toMatchObject({ state: "failed", message: said });
    expect(warn).toHaveBeenCalledWith(expect.any(String), refused);
    warn.mockRestore();
  });
});
