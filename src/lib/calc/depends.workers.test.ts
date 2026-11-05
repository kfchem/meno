import { beforeEach, describe, expect, it, vi } from "vitest";

// Plugins added and taken away with the plugins they use (docs/PLUGINS.md, *Depends*): what is set up, in what order, asked
// how often - the set-ups and the question stood in for, nothing fetched.
const setUp: { profile: string; asked: boolean }[] = [];
const removed: string[] = [];
const questions: { title: string; detail: string; asks: { name: string }[] }[] = [];
let answer = true;
vi.mock("../plugins/process", () => ({ stopWorker: async () => undefined, workerOf: async () => ({}) }));
vi.mock("../pyEnv", () => ({
  ensurePyEnv: async (profile: string, opts?: { asked?: boolean }) => {
    setUp.push({ profile, asked: !!opts?.asked });
    return "";
  },
  setUpQuestions: async (profile: string) => [{ purpose: `python-env:${profile}`, title: "", detail: profile, sources: [], hosts: [] }],
  pyEnvReady: async () => false,
  removePyEnv: async (profile: string) => void removed.push(profile),
}));
// (the Quanta interface as needing Tightbind for all its work, not only for some: how a plugin that needs another is added and taken away)
vi.mock("../plugins/known", async (importOriginal) => {
  const known = await importOriginal<typeof import("../plugins/known")>();
  return { ...known, MANIFESTS: known.MANIFESTS.map((m) => (m.id === "quanta" ? { ...m, depends: m.depends?.map(({ optional: _, ...d }) => d) } : m)) };
});
vi.mock("../net/network", () => ({
  askToConnectAll: async (title: string, detail: string, asks: { name: string }[]) => {
    questions.push({ title, detail, asks });
    return answer;
  },
}));

const { addPlugin, addedUsing, removePlugin, useReaders } = await import("./workers");
const { DEPENDS_REFUSED, pluginById, pluginsUsedBy, pluginsUsing, stoppedOf } = await import("./catalog");

// (a plugin that uses another: the Quanta interface, Tightbind's tightbind)
const quanta = pluginById("quanta")!;
const tightbind = pluginById("tightbind")!;

describe("the plugins Meno knows of, and those they use", () => {
  it("are none of them refused, and the Quanta interface uses Tightbind alone", () => {
    expect([...DEPENDS_REFUSED]).toEqual([]);
    expect(pluginsUsedBy("quanta").map((p) => p.id)).toEqual(["tightbind"]);
    expect(pluginsUsing("tightbind").map((p) => p.id)).toEqual(["quanta"]);
  });
});

describe("a plugin added with the plugins it uses", () => {
  beforeEach(() => {
    setUp.length = 0;
    removed.length = 0;
    questions.length = 0;
    answer = true;
    useReaders.setState({ state: {}, problem: {} });
  });

  it("sets up those it uses first, all asked of the network in one question, none asked again", async () => {
    await addPlugin(quanta);
    expect(questions).toEqual([
      {
        title: "Set up the Quanta interface, with Tightbind?",
        detail: "It uses Tightbind, which is set up first.",
        asks: [expect.objectContaining({ name: "Tightbind" }), expect.objectContaining({ name: "Quanta interface" })],
      },
    ]);
    expect(setUp).toEqual([
      { profile: tightbind.profile, asked: true },
      { profile: quanta.profile, asked: true },
    ]);
    expect(useReaders.getState().state).toMatchObject({ tightbind: "added", quanta: "added" });
  });

  it("sets none up where the question is declined, saying so on the plugin", async () => {
    answer = false;
    await expect(addPlugin(quanta)).rejects.toThrow("was not allowed it");
    expect(setUp).toEqual([]);
    expect(useReaders.getState().problem.quanta).toMatch(/^Quanta interface was not added: it needs the network/);
  });

  it("asks nothing more of those added already: it alone is set up, as a plugin that uses none is", async () => {
    useReaders.setState({ state: { tightbind: "added" }, problem: {} });
    await addPlugin(quanta);
    expect(questions).toEqual([]);
    expect(setUp).toEqual([{ profile: quanta.profile, asked: false }]);
  });
});

describe("a plugin taken away that another added uses", () => {
  beforeEach(() => {
    removed.length = 0;
    useReaders.setState({ state: {}, problem: {} });
  });

  it("is never taken away alone, nor are those that use it taken away unasked: none is, saying why", async () => {
    useReaders.setState({ state: { tightbind: "added", quanta: "added" }, problem: {} });
    expect(addedUsing("tightbind").map((p) => p.id)).toEqual(["quanta"]);
    await expect(removePlugin(tightbind)).rejects.toThrow("Tightbind was not removed: Quanta interface uses it.");
    expect(removed).toEqual([]);
    expect(useReaders.getState().state).toMatchObject({ tightbind: "added", quanta: "added" });
  });

  it("is taken away with those that use it, where the chemist said they may go too - they first", async () => {
    useReaders.setState({ state: { tightbind: "added", quanta: "added" }, problem: {} });
    await removePlugin(tightbind, [], true);
    expect(removed).toEqual([quanta.profile, tightbind.profile]);
    expect(useReaders.getState().state).toMatchObject({ tightbind: "absent", quanta: "absent" });
  });

  it("takes none other away where none added uses it", async () => {
    useReaders.setState({ state: { tightbind: "added" }, problem: {} });
    await removePlugin(tightbind);
    expect(removed).toEqual([tightbind.profile]);
  });
});

describe("a plugin added whose plugin is not there", () => {
  it("is stopped, saying why - and runs again once it is", () => {
    expect(stoppedOf(quanta, new Set(["quanta"]))).toBe("Needs Tightbind, which is not added");
    expect(stoppedOf(quanta, new Set(["quanta", "tightbind"]))).toBeNull();
    expect(stoppedOf(tightbind, new Set(["tightbind"]))).toBeNull();
  });
});
