import { afterEach, describe, expect, it, vi } from "vitest";

// (a set-up that fails as its download is declined, one that succeeds)
vi.mock("../lib/plugins/process", () => ({ stopWorker: async () => undefined, workerOf: async () => ({}) }));
vi.mock("../lib/pyEnv", () => ({
  ensurePyEnv: async (profile: string) => {
    if (profile === "plugin-fragswap") throw new Error("Setting up Fragswap needs the network, and was not allowed it.");
    return "";
  },
  pyEnvReady: async () => false,
  removePyEnv: async () => undefined,
}));

const { addPlugin, addedReaders, useReaders } = await import("../lib/calc/workers");
const { PLUGINS } = await import("../lib/calc/catalog");
const { useNotices } = await import("./notices");
const { sayFailedSetUps } = await import("./setUpSaid");

describe("a plugin's set-up that fails", () => {
  afterEach(() => {
    vi.useRealTimers();
    useReaders.setState({ state: {}, problem: {} });
    useNotices.setState({ notices: [] });
  });

  it("is said in a notice that stays until it is dismissed - told where it failed; one added, or one looked at afresh, says nothing", async () => {
    const stop = sayFailedSetUps();
    const fragswap = PLUGINS.find((p) => p.id === "fragswap")!;
    const picread = PLUGINS.find((p) => p.id === "picread")!;
    await addPlugin(fragswap).catch(() => undefined);
    await addPlugin(picread);
    await addedReaders([fragswap, picread]);
    expect(useNotices.getState().notices.map((n) => [n.title, n.text, n.stays])).toEqual([
      ["Plugin not added", "Fragswap was not added: Setting up Fragswap needs the network, and was not allowed it.", true],
    ]);
    vi.useFakeTimers();
    vi.advanceTimersByTime(60_000);
    expect(useNotices.getState().notices).toHaveLength(1);
    useNotices.getState().dismiss("set-up fragswap");
    expect(useNotices.getState().notices).toHaveLength(0);
    stop();
    // (no longer told: nothing said)
    await addPlugin(fragswap).catch(() => undefined);
    expect(useNotices.getState().notices).toHaveLength(0);
  });

  it("leaves other notices to go after their while", () => {
    vi.useFakeTimers();
    useNotices.getState().show({ id: "x", title: "t", text: "x" });
    vi.advanceTimersByTime(10_000);
    expect(useNotices.getState().notices).toHaveLength(0);
  });
});
