import { beforeEach, describe, expect, it, vi } from "vitest";

// A plugin added whose needed plugin is not got yet (docs/PLUGINS.md, *Depends*): that one got first from the list of
// plugins online, of a version it works with, then set up with it - on the made-up test plugins, a few in place at a time,
// as a chemist gets them. The set-ups, the questions and the getting stood in for; nothing fetched.
const setUp: string[] = [];
const got: string[] = [];
const questions: string[] = [];
let offered: { id: string; name: string; version: string }[] = [];
let gettingFails: string | null = null;
vi.mock("../plugins/process", () => ({ stopWorker: async () => undefined, workerOf: async () => ({}) }));
vi.mock("../pyEnv", () => ({
  ensurePyEnv: async (profile: string) => void setUp.push(profile),
  setUpQuestions: async (profile: string) => [{ purpose: `python-env:${profile}`, title: "", detail: profile, sources: [], hosts: [] }],
  pyEnvReady: async () => false,
  removePyEnv: async () => undefined,
}));
vi.mock("../net/network", () => ({
  askToConnectAll: async (title: string) => {
    questions.push(title);
    return true;
  },
}));
const manifests = import.meta.glob<string>("/src/test/plugins/*/manifest.json", { eager: true, query: "?raw", import: "default" });
// (and two made up here, files only, to make a chain: chain-top needs chain-mid, which needs Lumen looks and motions)
const CHAIN: Record<string, string> = {
  "chain-top": JSON.stringify({ id: "chain-top", name: "Chain top", version: "1.0.0", depends: [{ plugin: "chain-mid", versions: ">=1.0.0 <2.0.0" }], kinds: [{ id: "chain-top-notes", name: "Top notes", extensions: [".ctn"], grammar: { file: "notes.grammar", tones: { Keyword: "keyword" } } }] }),
  "chain-mid": JSON.stringify({ id: "chain-mid", name: "Chain middle", version: "1.0.0", depends: [{ plugin: "lumen-looks", versions: ">=1.0.0 <2.0.0" }], kinds: [{ id: "chain-mid-notes", name: "Middle notes", extensions: [".cmn"], grammar: { file: "notes.grammar", tones: { Keyword: "keyword" } } }] }),
};
const text = (id: string) => CHAIN[id] ?? manifests[`/src/test/plugins/${id}/manifest.json`];
vi.mock("../plugins/online", async (importOriginal) => {
  const online = await importOriginal<typeof import("../plugins/online")>();
  return {
    ...online,
    onlineEntry: (id: string) => offered.find((e) => e.id === id),
    // (its files got: the plugins in place read again, that one among them)
    getPlugin: async (entry: { id: string; name: string }) => {
      if (gettingFails) throw new Error(`${entry.name} was not got: ${gettingFails}`);
      got.push(entry.id);
      inPlace(...ids(), entry.id);
    },
  };
});

const { setInstalled, setListedNames } = await import("../plugins/known");
// (the plugins in place now, by id: as each is got, it is put in place beside them)
let here: string[] = [];
const ids = () => here;
function inPlace(...these: string[]) {
  here = [...new Set(these)];
  setInstalled([...new Set(these)].map((id) => ({ id, version: String((JSON.parse(text(id)) as { version: string }).version), dir: `/data/plugins/${id}`, manifest: text(id), grammars: {} })));
}
const { addPlugin, useReaders } = await import("./workers");
const { anyPluginById, pluginName, stoppedOf } = await import("./catalog");

describe("a plugin added whose needed plugin is not got yet", () => {
  beforeEach(() => {
    setUp.length = 0;
    got.length = 0;
    questions.length = 0;
    offered = [{ id: "lumen", name: "Lumen", version: "0.5.0" }];
    gettingFails = null;
    useReaders.setState({ state: {}, problem: {} });
    setListedNames([]);
  });

  it("gets that one first from the plugins online, then sets it up with it - asked once - and adds itself", async () => {
    inPlace("lumen-looks");
    await addPlugin(anyPluginById("lumen-looks")!);
    expect(got).toEqual(["lumen"]);
    expect(questions).toEqual(["Add Lumen looks and motions, with Lumen?"]);
    expect(setUp).toEqual([(anyPluginById("lumen") as { profile: string }).profile]);
    expect(useReaders.getState().state).toMatchObject({ lumen: "added", "lumen-looks": "added" });
  });

  it("is not added, saying why, where the plugins online do not offer that one, or not of a version it works with", async () => {
    inPlace("lumen-looks");
    offered = [];
    await expect(addPlugin(anyPluginById("lumen-looks")!)).rejects.toThrow("Lumen looks and motions was not added: it needs lumen, which is neither here nor among the plugins online.");
    offered = [{ id: "lumen", name: "Lumen", version: "0.7.0" }];
    await expect(addPlugin(anyPluginById("lumen-looks")!)).rejects.toThrow("Lumen looks and motions was not added: it needs Lumen from 0.5.0 to before 0.6.0, and the plugins online offer 0.7.0.");
    expect(got).toEqual([]);
    expect(useReaders.getState().state["lumen-looks"]).toBe("absent");
  });

  it("is not added, saying why, where that one could not be got - nothing set up", async () => {
    inPlace("lumen-looks");
    gettingFails = "the network was not allowed";
    await expect(addPlugin(anyPluginById("lumen-looks")!)).rejects.toThrow("Lumen was not got: the network was not allowed");
    expect(useReaders.getState().problem["lumen-looks"]).toBe("Lumen looks and motions was not added: Lumen was not got: the network was not allowed");
    expect(useReaders.getState().state["lumen-looks"]).toBe("absent");
    expect([got, setUp, questions]).toEqual([[], [], []]);
  });

  it("gets, along a chain, each plugin needed by one got: Chain top needs Chain middle, which needs the looks, which need Lumen", async () => {
    inPlace("chain-top");
    offered = [
      { id: "chain-mid", name: "Chain middle", version: "1.0.0" },
      { id: "lumen-looks", name: "Lumen looks and motions", version: "1.0.0" },
      { id: "lumen", name: "Lumen", version: "0.5.0" },
    ];
    await addPlugin(anyPluginById("chain-top")!);
    expect(got).toEqual(["chain-mid", "lumen-looks", "lumen"]);
    expect(useReaders.getState().state).toMatchObject({ "chain-top": "added", "chain-mid": "added", "lumen-looks": "added", lumen: "added" });
  });

  it("gets none where it uses that one only for some of its work: Quanta added alone, before Tightbind", async () => {
    inPlace("quanta");
    offered = [{ id: "tightbind", name: "Tightbind", version: "0.2.0" }];
    await addPlugin(anyPluginById("quanta")!);
    expect(got).toEqual([]);
    expect(useReaders.getState().state).toMatchObject({ quanta: "added" });
  });

  it("names one not got yet as the plugins online name it, else by its id", () => {
    inPlace("lumen-looks");
    expect(pluginName("lumen")).toBe("lumen");
    setListedNames([{ id: "lumen", name: "Lumen" }]);
    expect(pluginName("lumen")).toBe("Lumen");
    expect(stoppedOf(anyPluginById("lumen-looks")!, new Set(["lumen-looks"]))).toBe("Needs Lumen, which is not added");
    // (one in place named as it names itself, whatever the list says)
    inPlace("lumen-looks", "lumen");
    setListedNames([{ id: "lumen", name: "Lumen, as listed" }]);
    expect(pluginName("lumen")).toBe("Lumen");
  });
});
