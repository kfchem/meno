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
// (the ORCA interface as needing xTB for all its work, not only for some: how a plugin that needs another is added and taken away)
vi.mock("../plugins/known", async (importOriginal) => {
  const known = await importOriginal<typeof import("../plugins/known")>();
  return { ...known, MANIFESTS: known.MANIFESTS.map((m) => (m.id === "orca" ? { ...m, depends: m.depends?.map(({ optional: _, ...d }) => d) } : m)) };
});
vi.mock("../net/network", () => ({
  askToConnectAll: async (title: string, detail: string, asks: { name: string }[]) => {
    questions.push({ title, detail, asks });
    return answer;
  },
}));

const { addPlugin, addedUsing, removePlugin, useReaders } = await import("./workers");
const { DEPENDS_REFUSED, pluginById, pluginsUsedBy, pluginsUsing, stoppedOf } = await import("./catalog");

// (the one plugin Meno carries that uses another: the ORCA interface, xTB's xtb)
const orca = pluginById("orca")!;
const xtb = pluginById("xtb")!;

describe("the plugins Meno carries, and those they use", () => {
  it("are none of them refused, and the ORCA interface uses xTB alone", () => {
    expect([...DEPENDS_REFUSED]).toEqual([]);
    expect(pluginsUsedBy("orca").map((p) => p.id)).toEqual(["xtb"]);
    expect(pluginsUsing("xtb").map((p) => p.id)).toEqual(["orca"]);
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
    await addPlugin(orca);
    expect(questions).toEqual([
      {
        title: "Set up the ORCA interface, with xTB?",
        detail: "It uses xTB, which is set up first.",
        asks: [expect.objectContaining({ name: "xTB" }), expect.objectContaining({ name: "ORCA interface" })],
      },
    ]);
    expect(setUp).toEqual([
      { profile: xtb.profile, asked: true },
      { profile: orca.profile, asked: true },
    ]);
    expect(useReaders.getState().state).toMatchObject({ xtb: "added", orca: "added" });
  });

  it("sets none up where the question is declined, saying so on the plugin", async () => {
    answer = false;
    await expect(addPlugin(orca)).rejects.toThrow("was not allowed it");
    expect(setUp).toEqual([]);
    expect(useReaders.getState().problem.orca).toMatch(/^ORCA interface was not added: it needs the network/);
  });

  it("asks nothing more of those added already: it alone is set up, as a plugin that uses none is", async () => {
    useReaders.setState({ state: { xtb: "added" }, problem: {} });
    await addPlugin(orca);
    expect(questions).toEqual([]);
    expect(setUp).toEqual([{ profile: orca.profile, asked: false }]);
  });
});

describe("a plugin taken away that another added uses", () => {
  beforeEach(() => {
    removed.length = 0;
    useReaders.setState({ state: {}, problem: {} });
  });

  it("is never taken away alone, nor are those that use it taken away unasked: none is, saying why", async () => {
    useReaders.setState({ state: { xtb: "added", orca: "added" }, problem: {} });
    expect(addedUsing("xtb").map((p) => p.id)).toEqual(["orca"]);
    await expect(removePlugin(xtb)).rejects.toThrow("xTB was not removed: ORCA interface uses it.");
    expect(removed).toEqual([]);
    expect(useReaders.getState().state).toMatchObject({ xtb: "added", orca: "added" });
  });

  it("is taken away with those that use it, where the chemist said they may go too - they first", async () => {
    useReaders.setState({ state: { xtb: "added", orca: "added" }, problem: {} });
    await removePlugin(xtb, [], true);
    expect(removed).toEqual([orca.profile, xtb.profile]);
    expect(useReaders.getState().state).toMatchObject({ xtb: "absent", orca: "absent" });
  });

  it("takes none other away where none added uses it", async () => {
    useReaders.setState({ state: { xtb: "added" }, problem: {} });
    await removePlugin(xtb);
    expect(removed).toEqual([xtb.profile]);
  });
});

describe("a plugin added whose plugin is not there", () => {
  it("is stopped, saying why - and runs again once it is", () => {
    expect(stoppedOf(orca, new Set(["orca"]))).toBe("Needs xTB, which is not added");
    expect(stoppedOf(orca, new Set(["orca", "xtb"]))).toBeNull();
    expect(stoppedOf(xtb, new Set(["xtb"]))).toBeNull();
  });
});
