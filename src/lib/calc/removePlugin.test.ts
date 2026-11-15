import { beforeEach, describe, expect, it, vi } from "vitest";

// What taking a plugin away does, in order: its jobs stopped and ended, its worker stopped, its environment removed.
const done: string[] = [];
vi.mock("../jobs", async (actual) => ({
  ...(await actual<typeof import("../jobs")>()),
  stopJobsAndWait: async (ids: readonly string[]) => void done.push(`jobs ${ids.join(",")}`),
}));
vi.mock("../plugins/process", () => ({ stopWorker: async (id: string) => void done.push(`worker ${id}`), workerOf: async () => ({}) }));
vi.mock("../pyEnv", () => ({
  ensurePyEnv: async () => "",
  pyEnvReady: async () => true,
  removePyEnv: async (profile: string) => void done.push(`environment ${profile}`),
}));

const { removePlugin, useReaders } = await import("./workers");
const { PLUGINS } = await import("./catalog");

describe("taking a plugin away while its jobs run", () => {
  beforeEach(() => {
    done.length = 0;
  });
  const tightbind = PLUGINS.find((p) => p.id === "tightbind")!;

  it("stops the jobs it was told it may, and waits for them, before its worker and its environment go", async () => {
    await removePlugin(tightbind, ["j1", "j2"]);
    expect(done).toEqual(["jobs j1,j2", "worker tightbind", "environment plugin-tightbind"]);
    expect(useReaders.getState().state.tightbind).toBe("absent");
  });

  it("stops none where none was named", async () => {
    await removePlugin(tightbind);
    expect(done).toEqual(["worker tightbind", "environment plugin-tightbind"]);
  });
});
