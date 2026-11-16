// While the first start's card sets its plugin up, a failure of another plugin - one the chemist adds in Settings meanwhile - is said in a
// notice as ever (found in review): only the card's own plugin's failure is said on the card alone.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/plugins/process", () => ({ stopWorker: async () => undefined, workerOf: async () => ({}), onWorkerStopped: () => () => undefined }));
vi.mock("../lib/pyEnv", () => ({
  ensurePyEnv: async (profile: string) => {
    if (profile === "plugin-fragswap") throw new Error("Setting up Fragswap needs the network, and was not allowed it.");
    return "";
  },
  pyEnvReady: async () => false,
  removePyEnv: async () => undefined,
}));

const { addPlugin, useReaders } = await import("../lib/calc/workers");
const { PLUGINS } = await import("../lib/calc/catalog");
const { useNotices } = await import("./notices");
const { sayFailedSetUps } = await import("./setUpSaid");
const { useFirstSetUp } = await import("../lib/plugins/firstSetUp");

describe("a plugin's set-up that fails while the first start's card sets another plugin up", () => {
  afterEach(() => {
    useReaders.setState({ state: {}, problem: {} });
    useNotices.setState({ notices: [] });
    useFirstSetUp.setState({ phase: "none" }, true);
  });

  it("is said in its notice: the card says its own plugin's failure, not this one's", async () => {
    const stop = sayFailedSetUps();
    useFirstSetUp.setState({ phase: "going", step: "environment", plugin: { id: "chem", name: "Chem", licence: "MIT", size: "1 MB" } }, true);
    await addPlugin(PLUGINS.find((p) => p.id === "fragswap")!).catch(() => undefined);
    expect(useNotices.getState().notices.map((n) => n.title)).toEqual(["Plugin not added"]);
    stop();
  });
});
