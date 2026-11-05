import { afterAll, describe, expect, it } from "vitest";
import { anyPluginById, stoppedOf } from "../calc/catalog";
import { setInstalled } from "./known";
import { acceptManifest } from "./manifest";

// (the made-up test plugins, as src/test/pluginsInPlace puts them in place - here a few at a time, as a chemist gets them)
const manifests = import.meta.glob<string>("/src/test/plugins/*/manifest.json", { eager: true, query: "?raw", import: "default" });
const text = (id: string) => manifests[`/src/test/plugins/${id}/manifest.json`];
const inPlace = (...ids: string[]) =>
  setInstalled(ids.map((id) => ({ id, version: String((JSON.parse(text(id)) as { version: string }).version), dir: `/data/plugins/${id}`, manifest: text(id), grammars: {} })));

describe("a plugin that uses another not got yet", () => {
  afterAll(() => inPlace(...Object.keys(manifests).map((p) => p.split("/").slice(-2)[0])));

  it("is known, and runs, where it uses it for some of its work: Quanta before Tightbind, Densitool before Orbitron", () => {
    inPlace("quanta", "densitool");
    for (const id of ["quanta", "densitool"]) {
      const p = anyPluginById(id);
      expect(p, id).toBeDefined();
      expect(stoppedOf(p!, new Set(["quanta", "densitool"])), id).toBeNull();
    }
  });

  it("is known, stopped and saying which it needs, where it needs it: Lumen looks before Lumen", () => {
    inPlace("lumen-looks");
    const p = anyPluginById("lumen-looks");
    expect(p).toBeDefined();
    expect(stoppedOf(p!, new Set(["lumen-looks"]))).toBe("Needs lumen, which is not added");
  });

  it("takes the one it uses as any once that is got and added - read again, as Meno does on each one got", () => {
    inPlace("quanta", "tightbind", "lumen-looks", "lumen");
    expect(stoppedOf(anyPluginById("quanta")!, new Set(["quanta", "tightbind"]))).toBeNull();
    expect(stoppedOf(anyPluginById("lumen-looks")!, new Set(["lumen-looks", "lumen"]))).toBeNull();
  });

  it("is still not read where what it says it uses is not as a manifest must say it", () => {
    const raw = JSON.parse(text("quanta")) as { depends: { versions: string }[] };
    raw.depends[0].versions = "^0.2.0";
    expect(acceptManifest(raw)).toBeNull();
  });
});
