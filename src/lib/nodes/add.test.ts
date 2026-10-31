import { describe, expect, it } from "vitest";
import { geometryKey, type Property } from "../entry";
import { add, partSaid, type GivenPart } from "./add";
import { workedOutUnlike } from "./base";
import { rank } from "./rank";
import { standardStateBy, standardStateTerm } from "./standardState";
import { entry } from "./testEntries";

/** The test geometry's key (testEntries' water). */
const HERE = geometryKey([0, 0, 0, 0.96, 0, 0, -0.24, 0.93, 0]);

/** A single point at the higher level, in the solvent. */
const sp = (value: number, geometry = HERE): Property => ({ value, unit: "Eh", at: { geometry, solvent: "SMD(chloroform)" }, by: { program: "Gaussian", method: "wB97X-D", basis: "6-311+G(d,p)" }, status: "computed" });
/** A thermal correction to G at the lower level, at 298.15 K and 1 atm, quasi-RRHO. */
const gcorr = (value: number, kelvin = 298.15, geometry = HERE): Property => ({ value, unit: "Eh", at: { geometry, kelvin, atm: 1 }, by: { program: "Gaussian", method: "wB97X-D", basis: "6-31G(d)", treatment: "quasi-RRHO" }, status: "computed" });
/** The standard-state term at T, as a Number gives it. */
const term = (kelvin = 298.15): GivenPart => ({ name: "standard state", value: standardStateTerm(kelvin)!, unit: "kcal/mol", by: standardStateBy(kelvin), kelvin });

describe("Add", () => {
  it("sums a single point's energy, a thermal correction of another level and a standard-state term - G at the higher level [F42]", () => {
    const e = entry("ts", { energy: sp(-500.1), "thermo.g-correction": gcorr(0.12) });
    const out = add([e], { parts: ["energy", "thermo.g-correction"], given: [term()], as: "G-DFT" });
    if (!out.ok) throw new Error(out.said);
    const g = out.exits.done[0].properties["G-DFT"];
    // (-500.1 + 0.12 Eh, and 1.89434 kcal/mol in hartrees: / 627.509474 = 0.0030188 Eh)
    expect(g.value as number).toBeCloseTo(-500.1 + 0.12 + 1.89434 / 627.509474, 7);
    expect(g.unit).toBe("Eh");
    // (where: its geometry, the thermal part's temperature and pressure, the energy's solvent)
    expect(g.at).toEqual({ geometry: HERE, kelvin: 298.15, atm: 1, solvent: "SMD(chloroform)" });
    // (each part as it was - never one level for the sum)
    expect(g.parts).toEqual([
      { property: "energy", value: -500.1, unit: "Eh", at: sp(0).at, by: sp(0).by },
      { property: "thermo.g-correction", value: 0.12, unit: "Eh", at: gcorr(0).at, by: gcorr(0).by },
      { property: "standard state", value: standardStateTerm(298.15), unit: "kcal/mol", by: standardStateBy(298.15) },
    ]);
    expect(g.by?.method).toBeUndefined();
    expect(g.by?.treatment).toBe(
      "sum: energy (wB97X-D/6-311+G(d,p), Gaussian, SMD(chloroform)) + thermo.g-correction (wB97X-D/6-31G(d), Gaussian, solvation not stated, 298.15 K, 1 atm, quasi-RRHO) + standard state (" + standardStateBy(298.15).treatment + ")",
    );
    expect(out.said).toBe("1 of 1 entry given G-DFT = energy + thermo.g-correction + standard state");
    // (a number wired in, of no geometry, has no solvation to state - one that says nothing of itself, nothing at all)
    const bare = add([e], { parts: ["energy", "thermo.g-correction"], given: [{ name: "the number", value: 1, unit: "kcal/mol" }], as: "G-DFT" });
    if (!bare.ok) throw new Error(bare.said);
    expect(bare.exits.done[0].properties["G-DFT"].by?.treatment).toMatch(/ \+ the number$/);
    expect(partSaid({ property: "the number", value: 1.5, unit: "kcal/mol" })).toBe("the number");
    expect(partSaid({ property: "the number", value: 1.5, unit: "kcal/mol", by: { method: "user" } })).toBe("the number (user)");
  });

  it("says the solvent where the parts that say one agree, and none where two differ - each part keeps its own", () => {
    const gasCorr: Property = { ...gcorr(0.12), at: { ...gcorr(0.12).at!, solvent: "none" } };
    const out = add([entry("x", { energy: sp(-1), "thermo.g-correction": gasCorr })], { parts: ["energy", "thermo.g-correction"], as: "G" });
    const g = out.ok ? out.exits.done[0].properties.G : undefined;
    expect(g?.at?.solvent).toBeUndefined();
    expect(g?.parts?.map((p) => p.at?.solvent)).toEqual(["SMD(chloroform)", "none"]);
  });

  it("sums only values of the entry's own geometry: one of another, or of none, sets it aside", () => {
    const other = entry("x", { energy: sp(-1), "thermo.g-correction": gcorr(0.1, 298.15, "elsewhere") });
    const none = entry("y", { energy: sp(-1), "thermo.g-correction": { value: 0.1, unit: "Eh", status: "computed" } });
    const out = add([other, none], { parts: ["energy", "thermo.g-correction"], as: "G" });
    if (!out.ok) throw new Error(out.said);
    expect(out.exits.rest.map((e) => (e.status as { aside: string }).aside)).toEqual([
      "its thermo.g-correction was worked out at another geometry than its own",
      "its thermo.g-correction is of no geometry: only values of its own geometry are summed",
    ]);
  });

  it("sets aside one whose parts are of different temperatures - the standard-state term's among them", () => {
    const e = entry("x", { energy: sp(-1), "thermo.g-correction": gcorr(0.1, 298.15) });
    const out = add([e], { parts: ["energy", "thermo.g-correction"], given: [term(310)], as: "G" });
    expect(out.ok && (out.exits.rest[0].status as { aside: string }).aside).toBe("its parts are of different temperatures: thermo.g-correction at 298.15 K and standard state at 310 K");
  });

  it("sets aside one missing a part, or with its own value under the name, and refuses a number that does not convert", () => {
    const out = add([entry("a", { energy: sp(-1) }), entry("b", { energy: sp(-1), "thermo.g-correction": gcorr(0.1), G: sp(0) })], { parts: ["energy", "thermo.g-correction"], as: "G" });
    expect(out.ok && out.exits.rest.map((e) => (e.status as { aside: string }).aside)).toEqual(["it has no thermo.g-correction", "it has its own G already"]);
    const bad = add([entry("c", { energy: sp(-1), "thermo.g-correction": gcorr(0.1) })], { parts: ["energy", "thermo.g-correction"], given: [{ name: "length", value: 1, unit: "Å" }], as: "G" });
    expect(bad).toEqual({ ok: false, said: "length is in Å, which does not convert to Eh" });
  });

  it("says why, and makes nothing, with fewer than two parts or no name for the sum", () => {
    expect(add([], { parts: ["energy"], as: "G" })).toEqual({ ok: false, said: "Name two parts or more to add" });
    expect(add([], { parts: ["energy", "x"], as: " " })).toEqual({ ok: false, said: "Name what the sum is written as" });
    expect(add([], { parts: ["energy", "energy"], as: "G" })).toEqual({ ok: false, said: "A property is named twice" });
  });

  it("gives sums whose parts' method and basis differ in case alone that are worked out alike - each part as read - and still tells another method apart", () => {
    const named = (method: string, basis: string): Property => ({ ...sp(-500.1), by: { program: "Gaussian", method, basis } });
    const sums = (a: Property, b: Property) => {
      const out = add([entry("x", { energy: a, "thermo.g-correction": gcorr(0.12) }, "g"), entry("y", { energy: b, "thermo.g-correction": gcorr(0.11) }, "g")], { parts: ["energy", "thermo.g-correction"], as: "G" });
      if (!out.ok) throw new Error(out.said);
      return out.exits.done;
    };
    const alike = sums(named("wB97X-D", "6-311+G(d,p)"), named("WB97X-D", "6-311+g(d,p)"));
    expect(alike[1].properties.G.parts![0].by).toMatchObject({ method: "WB97X-D", basis: "6-311+g(d,p)" });
    expect(workedOutUnlike(alike, "G")).toBeNull();
    const ranked = rank(alike, { property: "G", order: "lowest first", keep: 1, within: "each group" });
    expect(ranked.ok && ranked.exits.kept.map((e) => e.id)).toEqual(["y"]);
    // (another method, or a basis by another name - only case is passed over)
    expect(workedOutUnlike(sums(named("wB97X-D", "6-311+G(d,p)"), named("M06-2X", "6-311+G(d,p)")), "G")).toMatch(/^differ in thermal treatment: sum: energy \(wB97X-D\/6-311\+G\(d,p\), /);
    expect(workedOutUnlike(sums(named("B3LYP", "6-31G*"), named("B3LYP", "6-31G(d)")), "G")).toMatch(/^differ in thermal treatment: /);
    // (every other part is compared as written: a solvent or a program in another case is told apart)
    const values = (a: Property, b: Property) => [entry("x", { energy: a }), entry("y", { energy: b })];
    expect(workedOutUnlike(values(sp(-500.1), { ...sp(-500.1), at: { ...sp(0).at!, solvent: "SMD(Chloroform)" } }), "energy")).toBe("differ in solvent: SMD(chloroform) (x) and SMD(Chloroform) (y)");
    expect(workedOutUnlike(values(sp(-500.1), { ...sp(-500.1), by: { ...sp(0).by, program: "gaussian" } }), "energy")).toBe("differ in program: Gaussian (x) and gaussian (y)");
  });
});
