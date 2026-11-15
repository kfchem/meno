import { beforeEach, describe, expect, it, vi } from "vitest";

// A preset plugin added and taken away with the plugin it brings presets to (docs/PLUGINS.md, *Presets*): what is offered,
// what is set up, asked how - the set-ups and the question stood in for, nothing fetched.
const setUp: string[] = [];
const removed: string[] = [];
const questions: { title: string; detail: string }[] = [];
vi.mock("../plugins/process", () => ({ stopWorker: async () => undefined, workerOf: async () => ({}) }));
vi.mock("../pyEnv", () => ({
  ensurePyEnv: async (profile: string) => void setUp.push(profile),
  setUpQuestions: async (profile: string) => [{ purpose: `python-env:${profile}`, title: "", detail: profile, sources: [], hosts: [] }],
  pyEnvReady: async () => false,
  removePyEnv: async (profile: string) => void removed.push(profile),
}));
vi.mock("../net/network", () => ({
  askToConnectAll: async (title: string, detail: string) => {
    questions.push({ title, detail });
    return true;
  },
}));
// (the renderer Meno carries, declaring an interface besides its own; and a made-up plugin that brings it presets through it)
vi.mock("../plugins/known", async (importOriginal) => {
  const known = await importOriginal<typeof import("../plugins/known")>();
  const { acceptManifest } = await import("../plugins/manifest");
  const renderer = known.MANIFESTS.find((m) => m.roles.some((r) => r.role === "render"))!;
  const looks = acceptManifest({
    id: "test-looks",
    name: "Test looks",
    version: "1.0.0",
    depends: [{ plugin: renderer.id, versions: `>=${renderer.version} <100.0.0`, interfaces: [{ id: "styling", versions: ">=1.0.0 <2.0.0" }] }],
    presets: { interface: "styling", looks: [{ id: "chalk", label: "Chalk", file: "chalk.py" }], studios: [{ id: "attic", label: "Attic", file: "attic.py" }] },
  })!;
  return { ...known, MANIFESTS: [...known.MANIFESTS.map((m) => (m.id === renderer.id ? { ...m, interfaces: [...(m.interfaces ?? []), { id: "styling", version: "1.2.0" }] } : m)), looks] };
});

const { addPlugin, removePlugin, useReaders } = await import("./workers");
const { DEPENDS_REFUSED, anyPluginById, pluginsFilling, pluginsUsing, presetsFor, stoppedOf } = await import("./catalog");

const renderer = pluginsFilling("render")[0];
const looks = anyPluginById("test-looks")!;

describe("a plugin that brings another presets", () => {
  beforeEach(() => {
    setUp.length = 0;
    removed.length = 0;
    questions.length = 0;
    useReaders.setState({ state: {}, problem: {} });
  });

  it("is refused for nothing, runs nothing, and is used by the plugin it brings them to", () => {
    expect([...DEPENDS_REFUSED]).toEqual([]);
    expect("data" in looks).toBe(true);
    expect(pluginsUsing(renderer.id).map((p) => p.id)).toContain("test-looks");
  });

  it("offers them only where it and that plugin are added, neither stopped", () => {
    expect(presetsFor(renderer, new Set([renderer.id]))).toEqual([]);
    expect(presetsFor(renderer, new Set(["test-looks"]))).toEqual([]);
    expect(presetsFor(renderer, new Set([renderer.id, "test-looks"])).map((o) => [o.from.id, o.presets.looks.map((l) => l.id)])).toEqual([["test-looks", ["chalk"]]]);
    expect(stoppedOf(looks, new Set(["test-looks"]))).toBe(`Needs ${renderer.name}, which is not added`);
  });

  it("sets that plugin up first as it is added - asked once - and is added itself at once", async () => {
    await addPlugin(looks);
    expect(questions).toEqual([{ title: `Add Test looks, with ${renderer.installed.length ? `the ${renderer.name}` : renderer.name}?`, detail: `It uses ${renderer.name}, which is set up first.` }]);
    expect(setUp).toEqual([renderer.profile]);
    expect(useReaders.getState().state).toMatchObject({ [renderer.id]: "added", "test-looks": "added" });
  });

  it("is taken away with that plugin, where the chemist said it may go too", async () => {
    useReaders.setState({ state: { [renderer.id]: "added", "test-looks": "added" }, problem: {} });
    await expect(removePlugin(renderer)).rejects.toThrow(`${renderer.name} was not removed: Test looks uses it.`);
    await removePlugin(renderer, [], true);
    expect(useReaders.getState().state).toMatchObject({ [renderer.id]: "absent", "test-looks": "absent" });
    expect(removed).toEqual([renderer.profile]);
  });
});
