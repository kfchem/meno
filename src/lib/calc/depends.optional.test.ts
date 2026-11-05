import { beforeEach, describe, expect, it, vi } from "vitest";

// The Quanta interface, a made-up plugin: Tightbind used only for some of its work (its tight-binding methods) - not set up with it, stopping
// nothing missing, and still never left behind unasked as Tightbind is taken away. The set-ups and the question stood in for.
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
const quanta = pluginById("quanta")!;
const tightbind = pluginById("tightbind")!;

describe("a plugin used only for some of another's work", () => {
  beforeEach(() => {
    setUp.length = 0;
    removed.length = 0;
    questions.length = 0;
    useReaders.setState({ state: {}, problem: {} });
  });

  it("is not set up with it: the Quanta interface alone, as before", async () => {
    expect(pluginsUsedBy("quanta")).toEqual([]);
    await addPlugin(quanta);
    expect(questions).toEqual([]);
    expect(setUp).toEqual([quanta.profile]);
  });

  it("stops nothing, missing - only a job that needs its program is refused, saying so", () => {
    expect(stoppedOf(quanta, new Set(["quanta"]))).toBeNull();
    expect(neededWhy(quanta, "tightbind", new Set(["quanta"]))).toBe("Needs Tightbind, which is not added");
    expect(neededWhy(quanta, "tightbind", new Set(["quanta", "tightbind"]))).toBeNull();
    expect(neededWhy(quanta, "confsweep", new Set(["quanta", "confsweep"]))).toBe("Quanta interface asked for confsweep's program, which it does not say it uses");
  });

  it("is still never taken away while one added uses it, but with it, asked", async () => {
    useReaders.setState({ state: { tightbind: "added", quanta: "added" }, problem: {} });
    await expect(removePlugin(tightbind)).rejects.toThrow("uses it");
    await removePlugin(tightbind, [], true);
    expect(removed).toEqual([quanta.profile, tightbind.profile]);
  });
});
