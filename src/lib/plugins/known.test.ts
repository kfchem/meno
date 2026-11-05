import { afterAll, describe, expect, it } from "vitest";
import { grammarText, MANIFESTS, onPluginsChanged, placeOf, setInstalled, type InstalledPlugin } from "./known";
import { ALL_PLUGINS, manifestOf, READERS } from "../calc/catalog";

/** A plugin in place, as Meno's backend gives it: its manifest written as JSON. */
const placed = (id: string, version: string, more: Record<string, unknown> = {}, grammars: Record<string, string> = {}): InstalledPlugin => ({
  id,
  version,
  dir: `/data/plugins/${id}/${version}`,
  manifest: JSON.stringify({ id, name: id.toUpperCase(), version, description: "A plugin.", licence: "MIT", homepage: "https://example.org", environment: "uv", steps: [{ kinds: ["energy"] }], ...more }),
  grammars,
});

describe("the plugins Meno knows of", () => {
  const before = MANIFESTS;
  afterAll(() => {
    // (the plugins the other tests take as in place, back as they were: src/test/pluginsInPlace)
    setInstalled(before.map((m) => ({ id: m.id, version: m.version, dir: `/data/plugins/${m.id}/${m.version}`, manifest: JSON.stringify(m), grammars: {} })));
  });

  it("are those in place whose manifest Meno takes, of the id and version their folder says, in their ids' order", () => {
    setInstalled([
      placed("zeta", "1.0.0"),
      placed("alpha", "0.2.0", {}, { "alpha.grammar": "@top Doc" }),
      // (another id, or another version, than its folder's; a manifest that is no JSON; one Meno refuses; one twice)
      { ...placed("beta", "1.0.0"), id: "gamma" },
      { ...placed("delta", "1.0.0"), version: "2.0.0" },
      { ...placed("epsilon", "1.0.0"), manifest: "{ not json" },
      placed("eta", "1.0.0", { contract: 9 }),
      placed("zeta", "9.9.9"),
    ]);
    expect(MANIFESTS.map((m) => [m.id, m.version])).toEqual([
      ["alpha", "0.2.0"],
      ["zeta", "1.0.0"],
    ]);
    expect(placeOf("alpha")).toEqual({ version: "0.2.0", dir: "/data/plugins/alpha/0.2.0" });
    expect(placeOf("gamma")).toBeUndefined();
    expect(grammarText("alpha", "alpha.grammar")).toBe("@top Doc");
    expect(grammarText("zeta", "alpha.grammar")).toBeUndefined();
  });

  it("are worked out again wherever they are read, each time they are taken anew: the plugins, the readers", () => {
    const heard: number[] = [];
    const stop = onPluginsChanged(() => heard.push(MANIFESTS.length));
    setInstalled([placed("alpha", "0.2.0")]);
    expect(ALL_PLUGINS.map((p) => p.id)).toEqual(["alpha"]);
    expect(manifestOf("alpha")?.version).toBe("0.2.0");
    setInstalled([]);
    expect([ALL_PLUGINS, manifestOf("alpha")]).toEqual([[], undefined]);
    expect(READERS.map((r) => r.id)).toEqual(["meno"]);
    stop();
    setInstalled([placed("alpha", "0.2.0")]);
    expect(heard).toEqual([1, 0]);
  });

  it("each a lock and a worker in the folder of its version in use, in Meno's local data folder", () => {
    setInstalled([placed("alpha", "0.2.0")]);
    const [p] = ALL_PLUGINS;
    expect(p && "lock" in p && [p.lock, p.worker]).toEqual(["plugins/alpha/0.2.0/requirements.lock", "plugins/alpha/0.2.0/worker.py"]);
  });
});
