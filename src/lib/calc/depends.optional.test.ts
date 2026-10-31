import { beforeEach, describe, expect, it, vi } from "vitest";

// The ORCA interface as Meno carries it: xTB used only for some of its work (its xTB methods) - not set up with it, stopping
// nothing missing, and still never left behind unasked as xTB is taken away. The set-ups and the question stood in for.
const setUp: string[] = [];
const removed: string[] = [];
const questions: string[] = [];
vi.mock("../plugins/process", () => ({ stopWorker: async () => undefined, workerOf: async () => ({}) }));
vi.mock("../pyEnv", () => ({
  ensurePyEnv: async (profile: string) => void setUp.push(profile),
  setUpQuestions: async () => [],
  pyEnvReady: async () => false,
  removePyEnv: async (profile: string) => void removed.push(profile),
}));
vi.mock("../net/network", () => ({ askToConnectAll: async (title: string) => (questions.push(title), true) }));

const { addPlugin, removePlugin, useReaders } = await import("./workers");
const { neededWhy, pluginById, pluginsUsedBy, stoppedOf } = await import("./catalog");
const orca = pluginById("orca")!;
const xtb = pluginById("xtb")!;

describe("a plugin used only for some of another's work", () => {
  beforeEach(() => {
    setUp.length = 0;
    removed.length = 0;
    questions.length = 0;
    useReaders.setState({ state: {}, problem: {} });
  });

  it("is not set up with it: the ORCA interface alone, as before", async () => {
    expect(pluginsUsedBy("orca")).toEqual([]);
    await addPlugin(orca);
    expect(questions).toEqual([]);
    expect(setUp).toEqual([orca.profile]);
  });

  it("stops nothing, missing - only a job that needs its program is refused, saying so", () => {
    expect(stoppedOf(orca, new Set(["orca"]))).toBeNull();
    expect(neededWhy(orca, "xtb", new Set(["orca"]))).toBe("Needs xTB, which is not added");
    expect(neededWhy(orca, "xtb", new Set(["orca", "xtb"]))).toBeNull();
    expect(neededWhy(orca, "crest", new Set(["orca", "crest"]))).toBe("ORCA interface asked for crest's program, which it does not say it uses");
  });

  it("is still never taken away while one added uses it, but with it, asked", async () => {
    useReaders.setState({ state: { xtb: "added", orca: "added" }, problem: {} });
    await expect(removePlugin(xtb)).rejects.toThrow("uses it");
    await removePlugin(xtb, [], true);
    expect(removed).toEqual([orca.profile, xtb.profile]);
  });
});
