import { describe, expect, it } from "vitest";
import type { Property } from "../entry";
import { ensemble } from "./ensemble";
import { entry, quantity } from "./testEntries";

const by = { program: "Gaussian", method: "wB97X-D", basis: "6-31G(d)", treatment: "quasi-RRHO" };
const g = (v: number, kelvin: number | null = 298.15) => quantity(v, "kcal/mol", by, kelvin == null ? {} : { kelvin, atm: 1 });
const degeneracy = (n: number): Property => ({ value: n, unit: "none", status: "computed" });
const aside = (es: { id: string; status: unknown }[]) => es.map((x) => [x.id, (x.status as { aside: string }).aside]);

describe("Ensemble energy", () => {
  it("is G_min - RT ln Σ g exp(-(G - G_min)/RT) over each group, standing on its lowest - by hand", () => {
    // (298.15 K: RT = 8.314462618 × 298.15 / 4184 = 0.5924849 kcal/mol. G 0 and 1: Σ = 1 + e^(-1/0.5924849) = 1.1849247;
    //  -RT ln 1.1849247 = -0.1005324 kcal/mol. The second twice degenerate: Σ = 1.3698494, -0.1864555)
    const out = ensemble([entry("a1", { g: g(1) }, "a"), entry("a2", { g: g(0) }, "a"), entry("b1", { g: g(0) }, "b"), entry("b2", { g: g(1), degeneracy: degeneracy(2) }, "b")], { property: "g", within: "each group", as: "g-ens" });
    if (!out.ok) throw new Error(out.said);
    expect(out.exits.done.map((e) => e.id)).toEqual(["a2", "b1"]);
    expect(out.exits.done[0].properties["g-ens"].value as number).toBeCloseTo(-0.1005324, 6);
    expect(out.exits.done[1].properties["g-ens"].value as number).toBeCloseTo(-0.1864555, 6);
    expect(aside(out.exits.rest)).toEqual([
      ["a1", "in the ensemble of a2"],
      ["b2", "in the ensemble of b1"],
    ]);
    expect(out.said).toBe("2 ensembles of 4 entries · rest 2 (1: in the ensemble of a2; 1: in the ensemble of b1)");
  });

  it("says what it is: over how many, at what temperature, each member's value as it was", () => {
    const out = ensemble([entry("x", { g: g(0) }), entry("y", { g: g(0.5) })], { property: "g", within: "all", as: "G" });
    if (!out.ok) throw new Error(out.said);
    const p = out.exits.done[0].properties.G;
    expect(p.ensemble).toEqual({ of: 2 });
    expect(p.at).toMatchObject({ kelvin: 298.15, atm: 1 });
    expect(p.by).toEqual({ treatment: "ensemble over 2 at 298.15 K: -R T ln Σ g exp(-g/R T)" });
    expect(p.parts).toEqual([
      { property: "g", value: 0, unit: "kcal/mol", at: g(0).at, by },
      { property: "g", value: 0.5, unit: "kcal/mol", at: g(0.5).at, by },
    ]);
  });

  it("keeps an Add's own parts in each member's, one level down", () => {
    const sum: Property = { ...g(0), parts: [{ property: "energy", value: -1, unit: "Eh" }, { property: "thermo.g-correction", value: 0.1, unit: "Eh" }] };
    const out = ensemble([entry("x", { G: sum })], { property: "G", within: "all", as: "G-ens" });
    expect(out.ok && out.exits.done[0].properties["G-ens"].parts?.[0].parts).toEqual(sum.parts);
  });

  it("assumes no temperature: a group whose values say none, or differ in it, is set aside whole, saying so", () => {
    const none = ensemble([entry("x", { g: g(0, null) }), entry("y", { g: g(1, null) })], { property: "g", within: "all", as: "G" });
    expect(none.ok && aside(none.exits.rest)).toEqual([
      ["x", "its group's g values do not all say their temperature"],
      ["y", "its group's g values do not all say their temperature"],
    ]);
    const two = ensemble([entry("x", { g: g(0, 298.15) }), entry("y", { g: g(1, 310) })], { property: "g", within: "all", as: "G" });
    expect(two.ok && aside(two.exits.rest)[0][1]).toBe("its group's g values differ in temperature: 298.15 K (x) and 310 K (y), and are not taken together");
    const one = ensemble([entry("x", { g: g(0, null) }), entry("y", { g: g(1) })], { property: "g", within: "all", as: "G" });
    expect(one.ok && aside(one.exits.rest)[0][1]).toBe("its group's g values differ in temperature: not stated (x) and 298.15 K (y), and are not taken together");
  });

  it("never takes together values worked out differently", () => {
    const other = quantity(1, "kcal/mol", { ...by, method: "B3LYP" }, { kelvin: 298.15, atm: 1 });
    const out = ensemble([entry("x", { g: g(0) }), entry("y", { g: other })], { property: "g", within: "all", as: "G" });
    expect(out.ok && aside(out.exits.rest)[0][1]).toBe("its group's g values differ in method: wB97X-D (x) and B3LYP (y), and are not taken together");
  });
});
