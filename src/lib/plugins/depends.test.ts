import { describe, expect, it } from "vitest";
import { compareVersions, declaredPrograms, dependencyOrder, dependentsOf, dependsRefused, inRange, rangeOf, rangeSaid, stoppedWhy, type DependDecl, type DependingManifest } from "./depends";

/** A plugin as the use of plugins sees it: made up, as no plugin Meno carries. */
function plugin(id: string, uses: [string, string, string[]?][] = [], programs: string[] = [id]): DependingManifest {
  const depends: DependDecl[] = uses.map(([p, versions, used]) => ({ plugin: p, versions, range: rangeOf(versions)!, programs: (used ?? []).map((program, i) => ({ program, env: `E${i}` })) }));
  return { id, name: id.toUpperCase(), version: "1.0.0", ...(depends.length ? { depends } : {}), steps: [{ programs }], roles: [], installed: [], downloads: [] };
}

describe("the versions a plugin works with, of another it uses", () => {
  it("are read only as `>=A` or `>=A <B`, each of three numbers, B after A", () => {
    expect(rangeOf(">=0.1.4 <0.2.0")).toEqual({ from: "0.1.4", before: "0.2.0" });
    expect(rangeOf(">=1.0.0")).toEqual({ from: "1.0.0" });
    for (const bad of ["^0.1.4", "0.1.4", ">=0.1", ">=0.2.0 <0.1.0", ">=0.1.0 <0.1.0", ">=0.1.0 || >=0.3.0", ">0.1.0", "", 1, undefined]) expect(rangeOf(bad), String(bad)).toBeNull();
  });

  it("take a version within them, by its numbers - never as text", () => {
    const r = rangeOf(">=0.1.4 <0.2.0")!;
    expect(["0.1.4", "0.1.10", "0.1.99"].map((v) => inRange(v, r))).toEqual([true, true, true]);
    expect(["0.1.3", "0.2.0", "1.0.0", "one", ""].map((v) => inRange(v, r))).toEqual([false, false, false, false, false]);
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(rangeSaid(r)).toBe("from 0.1.4 to before 0.2.0");
    expect(rangeSaid(rangeOf(">=2.0.0")!)).toBe("2.0.0 or later");
  });
});

describe("the plugins one uses", () => {
  it("may give only programs the plugin used declares: its steps', its roles', those installed separately and those Meno fetches for it", () => {
    const used = { ...plugin("tool", [], ["a"]), roles: [{ programs: ["b"] }], installed: [{ name: "c" }], downloads: [{ provides: "d" }, { program: "bin/e" }] };
    expect([...declaredPrograms(used)].sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("refuses one that uses a plugin Meno does not know, or a program that plugin does not declare - and, in turn, one that uses it", () => {
    const refused = dependsRefused([plugin("tool"), plugin("asks", [["tool", ">=1.0.0", ["other"]]]), plugin("lost", [["nowhere", ">=1.0.0"]]), plugin("after", [["lost", ">=1.0.0"]]), plugin("fine", [["tool", ">=1.0.0", ["tool"]]])]);
    expect(Object.fromEntries(refused)).toEqual({
      asks: "it uses TOOL's program other, which TOOL does not declare",
      lost: "it uses nowhere, a plugin Meno does not know",
      after: "it uses LOST, which is refused",
    });
  });

  it("refuses every plugin of a circle, naming it - none could be set up first - and none outside it", () => {
    const refused = dependsRefused([plugin("a", [["b", ">=1.0.0"]]), plugin("b", [["c", ">=1.0.0"]]), plugin("c", [["a", ">=1.0.0"]]), plugin("d", [["d2", ">=1.0.0"]]), plugin("d2")]);
    expect([...refused.keys()].sort()).toEqual(["a", "b", "c"]);
    expect(refused.get("a")).toBe("it uses plugins in a circle (A → B → C → A), so none of them can be set up first");
  });

  it("are set up in an order each comes before any that uses it, each once; and taken away the other way round", () => {
    const all = [plugin("top", [["mid", ">=1.0.0"], ["base", ">=1.0.0"]]), plugin("mid", [["base", ">=1.0.0"]]), plugin("base"), plugin("side", [["base", ">=1.0.0"]])];
    expect(dependencyOrder("top", all).map((m) => m.id)).toEqual(["base", "mid"]);
    expect(dependencyOrder("base", all)).toEqual([]);
    const away = dependentsOf("base", all).map((m) => m.id);
    expect(away.sort()).toEqual(["mid", "side", "top"]);
    // (one that uses another taken away before it)
    const order = dependentsOf("base", all).map((m) => m.id);
    expect(order.indexOf("top")).toBeLessThan(order.indexOf("mid"));
  });

  it("stop a plugin added where one it uses is not added, or added of another version, saying why", () => {
    const m = plugin("asks", [["tool", ">=1.0.0 <2.0.0", ["tool"]]]);
    const name = (id: string) => id.toUpperCase();
    expect(stoppedWhy(m, () => "1.4.0", name)).toBeNull();
    expect(stoppedWhy(m, () => undefined, name)).toBe("Needs TOOL, which is not added");
    expect(stoppedWhy(m, () => "2.0.0", name)).toBe("Needs TOOL from 1.0.0 to before 2.0.0; 2.0.0 is added");
    expect(stoppedWhy(plugin("alone"), () => undefined, name)).toBeNull();
  });
});
