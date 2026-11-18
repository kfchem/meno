// An option's value from a property: its least held, and entries grouped by every bound option (found in review).
import { describe, expect, it } from "vitest";
import type { Property } from "./entry";
import type { Option } from "./options";
import { boundGroups, boundValue } from "./boundOptions";

const STRENGTH: Option = { id: "strength", label: "Strength, kcal/mol/rad²", type: "text", default: "50", unit: "kcal/mol/rad²", fromProperty: true };
const CHARGE: Option = { id: "charge", label: "Charge", type: "number", default: 0, whole: true, min: -10, max: 10 };
const k = (value: number, unit: Property["unit"] = "kcal/mol/rad2"): Property => ({ value, unit, status: "computed" });

describe("an option's value from a property: its least", () => {
  it("is held as its most is: a value below it is refused with why", () => {
    expect(boundValue(CHARGE, "q", k(-11, "none"))).toEqual({ why: "Its q, -11, is below its charge's least, -10" });
    expect(boundValue(CHARGE, "q", k(-10, "none"))).toEqual({ value: -10 });
  });
});

describe("entries grouped by two bound options", () => {
  it("are one group for each pair of values: the option that sorts last tells apart what the first does not", () => {
    // (bound options are keyed in the order of their ids: `charge` before `strength`; the entries agree in the first and differ in the second)
    const props: Record<string, Property>[] = [
      { k: k(50), q: k(1, "none") },
      { k: k(100), q: k(1, "none") },
      { k: k(50), q: k(1, "none") },
    ];
    const g = boundGroups([STRENGTH, CHARGE], { strength: "50", charge: 0 }, { strength: "k", charge: "q" }, (i) => props[i], [0, 1, 2]);
    expect(g.groups).toEqual([
      { values: { strength: "50", charge: 1 }, entries: [0, 2] },
      { values: { strength: "100", charge: 1 }, entries: [1] },
    ]);
    expect(g.refused).toEqual([]);
  });
});
