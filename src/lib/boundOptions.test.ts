import { describe, expect, it } from "vitest";
import type { Property } from "./entry";
import type { Option } from "./options";
import { bindable, boundGroups, boundValue, boundValues } from "./boundOptions";

const STRENGTH: Option = { id: "strength", label: "Strength, kcal/mol/rad²", type: "text", default: "50", unit: "kcal/mol/rad²", fromProperty: true };
const CHARGE: Option = { id: "charge", label: "Charge", type: "number", default: 0, whole: true, min: -10, max: 10 };
const LABEL: Option = { id: "title", label: "Title", type: "text", default: "" };
const k = (value: number, unit: Property["unit"] = "kcal/mol/rad2"): Property => ({ value, unit, status: "computed" });

describe("an option's value from a property", () => {
  it("takes the entry's value in the option's unit, converted within its dimension", () => {
    expect(boundValue(STRENGTH, "k", k(100))).toEqual({ value: "100" });
    expect(boundValue(STRENGTH, "k", k(418.4, "kJ/mol/rad2"))).toEqual({ value: "100" });
    expect(boundValue(CHARGE, "q", k(-1, "none"))).toEqual({ value: -1 });
    expect(boundValue(LABEL, "id", { value: "start-1", unit: "none", status: "computed", label: true })).toEqual({ value: "start-1" });
  });

  it("says why, and takes nothing, where the property is missing, not worked out, of another dimension or with no unit", () => {
    expect(boundValue(STRENGTH, "k", undefined)).toEqual({ why: "It has no k to take its strength from" });
    expect(boundValue(STRENGTH, "k", { value: 0, unit: "kcal/mol/rad2", status: { failed: "no reference" } })).toEqual({ why: "Its k was not worked out: no reference" });
    expect(boundValue(STRENGTH, "k", k(50, "kcal/mol"))).toEqual({ why: "Its k is in kcal/mol; its strength is in kcal/mol/rad²" });
    expect(boundValue(STRENGTH, "k", k(50, "none"))).toEqual({ why: "Its k has no unit; its strength is in kcal/mol/rad²" });
    expect(boundValue(CHARGE, "q", k(1, "Eh"))).toEqual({ why: "Its q is in Eh; its charge takes a number with no unit" });
    expect(boundValue(CHARGE, "q", { value: "one", unit: "none", status: "computed" })).toEqual({ why: "Its q is no number" });
  });

  it("holds a number option's range and wholeness", () => {
    expect(boundValue(CHARGE, "q", k(11, "none"))).toEqual({ why: "Its q, 11, is above its charge's most, 10" });
    expect(boundValue(CHARGE, "q", k(0.5, "none"))).toEqual({ why: "Its q, 0.5, is no whole number" });
  });

  it("is offered on a plugin's number and text options, and on Meno's only where marked", () => {
    expect([bindable(STRENGTH, true), bindable(CHARGE, true), bindable(CHARGE, false), bindable(LABEL, false)]).toEqual([true, false, true, true]);
    expect(bindable({ id: "c", label: "Charge", type: "number", default: 0, from: "charge" }, false)).toBe(false);
    expect(bindable({ id: "s", label: "S", type: "switch", default: true }, false)).toBe(false);
  });
});

describe("a step's values, entry by entry", () => {
  it("are the step's own where nothing is bound, and each bound one from the entry", () => {
    expect(boundValues([STRENGTH, CHARGE], { strength: "50", charge: 0 }, undefined, {})).toEqual({ values: { strength: "50", charge: 0 } });
    expect(boundValues([STRENGTH, CHARGE], { strength: "50", charge: 0 }, { strength: "k" }, { k: k(150) })).toEqual({ values: { strength: "150", charge: 0 } });
  });

  it("group the entries by the values they take, each refused alone with why", () => {
    const props: Record<string, Property>[] = [{ k: k(50) }, { k: k(100) }, {}, { k: k(50) }];
    const g = boundGroups([STRENGTH], { strength: "50" }, { strength: "k" }, (i) => props[i], [0, 1, 2, 3]);
    expect(g.groups).toEqual([
      { values: { strength: "50" }, entries: [0, 3] },
      { values: { strength: "100" }, entries: [1] },
    ]);
    expect(g.refused).toEqual([{ entry: 2, why: "It has no k to take its strength from" }]);
    expect(boundGroups([STRENGTH], { strength: "50" }, undefined, () => ({}), [0, 1])).toEqual({ groups: [{ values: { strength: "50" }, entries: [0, 1] }], refused: [] });
  });
});
