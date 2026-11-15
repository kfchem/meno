import { describe, expect, it } from "vitest";
import type { SetEntry } from "./entries";
import { runMeno } from "./meno";

/**
 * Structures a saddle-point search may give, each with what its frequency
 * calculation found - Meno judges none of them: the chemist selects with
 * Filter, on how many imaginary frequencies each has and how large.
 */
const water = (number: number, extra: Partial<SetEntry>): SetEntry =>
  ({
    compound: 0,
    number,
    atoms: [{ el: "O" }, { el: "H" }, { el: "H" }],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    xyz: [0, 0, 0, 0.96, 0, 0, -0.24, 0.93 + 0.01 * number, 0],
    ...extra,
  }) as unknown as SetEntry;
/** Its vibrations worked out, as a table in cm-1 - the way a frequency calculation's come with an entry. */
const vibrations = (cm: number[]) => ({ vibrations: { value: { table: { columns: [{ name: "frequency", unit: "cm-1" as const }], rows: cm.map((f) => [f]) } }, unit: "none" as const, status: "computed" as const } });

// (one imaginary frequency; two, the second small - a flat mode; a minimum, none; and one whose frequencies were never worked out)
const ts = water(1, { imaginary: [-1020.4] });
const flat = water(2, { imaginary: [-30.2, -412.7] });
const minimum = water(3, { properties: vibrations([1595, 3657, 3756]) });
const unknown = water(4, {});
const all = [ts, flat, minimum, unknown];

const kept = (conditions: string) => {
  const o = runMeno("filter", all, "molecules", { conditions });
  if (!o.ok) throw new Error(o.said);
  return o.kept.map((e) => e.number);
};

describe("Filter on imaginary frequencies, the chemist's selection", () => {
  it("selects by how many - one, or none - never counting one whose frequencies were not worked out as having none", () => {
    expect(kept("imaginary = 1")).toEqual([1]);
    expect(kept("imaginary = 0")).toEqual([3]);
    expect(kept("imaginary ≥ 1")).toEqual([1, 2]);
  });

  it("selects by the size of the largest and of the next, in cm-1 - the largest first, whatever order the program printed them in", () => {
    expect(kept("imaginary.second < 50 cm-1")).toEqual([2]);
    expect(kept("imaginary.first > 1000 cm-1")).toEqual([1]);
    expect(kept("imaginary.first > 400 cm-1")).toEqual([1, 2]);
    // (one with a single imaginary frequency has no second: a bound on it keeps it only where asked "any")
    expect(runMeno("filter", all, "molecules", { conditions: "imaginary = 1; imaginary.second < 50 cm-1", match: "any" })).toMatchObject({ ok: true, kept: [ts, flat] });
  });
});
