import { describe, expect, it } from "vitest";
import { relative } from "./relative";
import { entry, quantity } from "./testEntries";

const by = { program: "P", method: "M" };
const e = (id: string, eh: number | null, group?: string, who = by) => entry(id, eh == null ? {} : { energy: quantity(eh, "Eh", who, { kelvin: 298.15 }) }, group);
const rel = (x: { properties: Record<string, { value: unknown }> }) => x.properties["relative energy"].value as number;

describe("Relative", () => {
  it("takes the lowest in each group from each: 0.0015936014 Eh above it is 1.000000 kcal/mol (CODATA 2018)", () => {
    // (1 Eh = 627.5094740631 kcal/mol: the hartree, 4.3597447222071e-18 J (CODATA 2018), times the Avogadro
    // constant, 6.02214076e23 /mol (exact), over 4184 J/kcal (the thermochemical calorie, exact))
    const out = relative([e("a1", -100.0015936014, "a"), e("a2", -100, "a"), e("b1", -50, "b")], { property: "energy", name: "relative energy", to: "lowest in group", unit: "kcal/mol" });
    if (!out.ok) throw new Error(out.said);
    const [a1, a2, b1] = out.exits.done;
    expect(rel(a1)).toBe(0);
    expect(rel(a2)).toBeCloseTo(1.0, 6);
    expect(rel(b1)).toBe(0);
    // (it keeps what worked out the energies it was made from, and their temperature)
    expect(a2.properties["relative energy"]).toMatchObject({ unit: "kcal/mol", by, at: { kelvin: 298.15 } });
    expect(out.said).toBe("relative energy: energy less the lowest in each group, in kcal/mol · 3 of 3 entries");
  });

  it("takes a reference given with its unit, converted: 627.5094740631 kcal/mol less 1 Eh is 0", () => {
    const out = relative([entry("x", { e: quantity(627.5094740631, "kcal/mol") })], { property: "e", name: "less", to: { value: 1, unit: "Eh" }, unit: "kcal/mol" });
    expect(out.ok && (out.exits.done[0].properties.less.value as number)).toBeCloseTo(0, 9);
  });

  it("never takes values worked out differently from one another, nor works without a value: each set aside, saying so", () => {
    const out = relative([e("p", -1, "a"), e("q", -2, "a", { program: "P", method: "N" }), e("r", null, "a")], { property: "energy", name: "relative energy", to: "lowest in group", unit: "kcal/mol" });
    if (!out.ok) throw new Error(out.said);
    expect(out.exits.done).toEqual([]);
    expect(out.exits.rest.map((x) => x.status)).toEqual([
      { aside: "its group's energy values differ in method: M (p) and N (q), and are not taken from one another" },
      { aside: "its group's energy values differ in method: M (p) and N (q), and are not taken from one another" },
      { aside: "it has no energy" },
    ]);
  });

  it("never overwrites a property, nor takes a reference of another dimension", () => {
    const has = entry("x", { energy: quantity(1, "Eh"), "relative energy": quantity(0, "kcal/mol") }, "a");
    expect(relative([has], { property: "energy", name: "relative energy", to: "lowest in group", unit: "kcal/mol" })).toEqual({ ok: false, said: "1 entry already has relative energy: give the new property another name" });
    expect(relative([has], { property: "energy", name: "r", to: { value: 300, unit: "K" }, unit: "kcal/mol" })).toEqual({ ok: false, said: "The reference must be a number in energy, as kcal/mol is" });
  });
});
