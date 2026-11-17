/** Options from a property on a step Meno runs (docs/WORKFLOWS.md, *Options from a property*): Torsion restraints' strength `= k`, entry by entry. */
import { describe, expect, it } from "vitest";
import type { Property } from "../../../../lib/entry";
import { ONE_EXIT, torsionsHow, torsionsNeeds } from "./kinds";
import { torsionsSet } from "./structureSteps";
import { readWorkflow } from "./saved";
import type { SetEntry } from "./entries";

const molecule = (start: string, properties: Record<string, Property> = {}): SetEntry =>
  ({
    compound: 0,
    number: 1,
    atoms: Array.from({ length: 6 }, () => ({ el: "C" })),
    bonds: [],
    // (a zigzag chain, no three atoms on a line: its torsions have an angle)
    xyz: [0, 0, 0, 1.5, 0, 0, 2, 1.4, 0, 3.5, 1.4, 0.5, 4, 2.8, 0, 5.5, 2.8, 0],
    properties: { start: { value: start, unit: "none", status: "computed", label: true }, ...properties },
  }) as unknown as SetEntry;
const k = (value: number, unit: Property["unit"] = "kcal/mol/rad2"): Record<string, Property> => ({ k: { value, unit, status: "computed" } });
const TYPED = { on: "start", torsions: "typed", atoms: "1-2-3-4", target: "180", hold: "strength", strength: "50" };

/** The strength cells of a Torsion restraints table, row by row. */
function strengths(o: ReturnType<typeof torsionsSet>): string[] {
  if (!o.ok) throw new Error(o.said);
  const t = o.tables?.[ONE_EXIT];
  if (!t) throw new Error("no table made");
  const col = t.columns.findIndex((c) => /strength/i.test(c.name));
  return t.rows.map((r) => String(r[col]));
}

describe("Torsion restraints with its strength = k", () => {
  it("holds each entry's torsions at its own k: entries with k = 50 and 100 give rows of 50 and 100", () => {
    const o = torsionsSet([molecule("p1", k(50)), molecule("p2", k(100))], null, "molecules", TYPED, { strength: "k" });
    expect(strengths(o)).toEqual(["50 kcal/mol/rad²", "100 kcal/mol/rad²"]);
  });

  it("converts a k in kJ/mol/rad² to the strength's unit", () => {
    expect(strengths(torsionsSet([molecule("p1", k(418.4, "kJ/mol/rad2"))], null, "molecules", TYPED, { strength: "k" }))).toEqual(["100 kcal/mol/rad²"]);
  });

  it("sends an entry whose k is in kcal/mol, or missing, or not above 0, out of Failed with why; the others are held", () => {
    const o = torsionsSet([molecule("p1", k(50, "kcal/mol")), molecule("p2"), molecule("p3", k(0)), molecule("p4", k(150))], null, "molecules", TYPED, { strength: "k" });
    if (!o.ok) throw new Error(o.said);
    expect(o.aside.map((e) => e.failed?.why)).toEqual([
      "Its k is in kcal/mol; its strength is in kcal/mol/rad²",
      "It has no k to take its strength from",
      "Its k, 0 kcal/mol/rad², is no strength: it must be above 0",
    ]);
    expect(strengths(o)).toEqual(["150 kcal/mol/rad²"]);
  });

  it("is said on its line as = k, and needs no strength of its own; held exactly, k is not asked", () => {
    expect(torsionsHow({ ...TYPED, strength: "" }, { strength: "k" })).toBe("1 torsion at 180°, = k kcal/mol/rad²; for each start");
    expect(torsionsNeeds({ ...TYPED, strength: "" }, { strength: "k" })).toBeUndefined();
    expect(torsionsNeeds({ ...TYPED, strength: "" })).toBe("Set the strength");
    expect(strengths(torsionsSet([molecule("p1")], null, "molecules", { ...TYPED, hold: "exact" }, { strength: "k" }))).toEqual(["exact"]);
  });
});

describe("a step's options taken from a property, saved and opened again", () => {
  it("are kept, each option by the property's name; a name that is no text, or blank, left out", () => {
    const saved = readWorkflow({ sets: [], wires: [], steps: [{ id: 1, kind: "torsion-restraints", x: 0, y: 0, options: { strength: "50" }, bound: { strength: "k", hold: 3, target: " " } }] });
    expect(saved?.steps[0].bound).toEqual({ strength: "k" });
    expect(saved?.steps[0].options).toEqual({ strength: "50" });
  });
});

