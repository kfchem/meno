import { describe, expect, it } from "vitest";
import { axisLabel, chartOfTable, ticksOf } from "./chart";
import { moleculesAsTable, readTable } from "./table";
import { geometryKey, type Entry } from "./entry";

const SHIFTS = readTable("atom,shift calc (none),shift measured (none),assigned\nC1,128.4,128.5,yes\nC2,129.1,128.9,yes\nC3,126.0,n/a,no\nC4,137.6,137.8,yes\nC5,21.3,21.4,yes\n");

describe("a table charted", () => {
  it("is one column of numbers against another - its first two, none named - a point a row with both, the rest counted", () => {
    const c = chartOfTable(SHIFTS);
    if ("why" in c) throw new Error(c.why);
    expect([axisLabel(c.x), axisLabel(c.y)]).toEqual(["shift calc", "shift measured"]);
    expect(c.points).toEqual([
      { x: 128.4, y: 128.5, row: 0 },
      { x: 129.1, y: 128.9, row: 1 },
      { x: 137.6, y: 137.8, row: 3 },
      { x: 21.3, y: 21.4, row: 4 },
    ]);
    // (the row left named by its row, the table naming no entry)
    expect(c.left).toEqual([{ count: 1, why: "with no shift measured", rows: ["row 3"] }]);
  });

  it("charts the columns named, and says why not where it cannot", () => {
    const c = chartOfTable(SHIFTS, "shift measured", "shift calc");
    expect("why" in c ? null : [c.x.name, c.y.name, c.left]).toEqual(["shift measured", "shift calc", [{ count: 1, why: "with no shift measured", rows: ["row 3"] }]]);
    expect(chartOfTable(SHIFTS, "shift")).toEqual({ why: 'It has no column "shift"' });
    expect(chartOfTable(SHIFTS, "atom")).toEqual({ why: '"atom" is no column of numbers' });
    expect(chartOfTable(readTable("a,b (none)\nx,1\n"))).toEqual({ why: "It takes a table with two columns of numbers" });
  });

  it("carries each point's entry where the table has one - molecules seen as a table, with what worked their numbers out", () => {
    const water = (id: string, e: number, g: number): Entry => ({
      id,
      from: [],
      structure: { atoms: [{ el: "O" }], bonds: [] },
      // (worked out at its own geometry: one column each, named as the property is)
      geometry: { kind: "3d", xyz: [0, 0, 0] },
      species: { charge: 0, multiplicity: 1, from: { charge: "atoms", multiplicity: "atoms" } },
      properties: {
        energy: { value: e, unit: "Eh", by: { program: "p", method: "m" }, at: { geometry: geometryKey([0, 0, 0]) }, status: "computed" },
        gap: { value: g, unit: "eV", by: { program: "p", method: "m" }, at: { geometry: geometryKey([0, 0, 0]) }, status: "computed" },
      },
      status: "done",
    });
    const c = chartOfTable(moleculesAsTable([water("m1:0", -76.4, 7.1), water("m2:0", -76.3, 6.9)]));
    if ("why" in c) throw new Error(c.why);
    expect(c.points.map((p) => p.entry)).toEqual(["m1:0", "m2:0"]);
    expect([axisLabel(c.x), c.x.by, axisLabel(c.y)]).toEqual(["energy (Eh)", { program: "p", method: "m" }, "gap (eV)"]);
  });
});

describe("an axis's ticks", () => {
  it("are 1, 2 or 5 times a power of ten, about five, from below the least to above the greatest", () => {
    expect(ticksOf(0, 9.27)).toEqual({ from: 0, to: 10, ticks: [0, 2, 4, 6, 8, 10] });
    expect(ticksOf(126, 137.8)).toEqual({ from: 125, to: 140, ticks: [125, 130, 135, 140] });
    expect(ticksOf(-0.012, 0.031).ticks).toEqual([-0.02, -0.01, 0, 0.01, 0.02, 0.03, 0.04]);
    // (one value: widened by a tenth of it each way)
    expect(ticksOf(5, 5)).toEqual({ from: 4.4, to: 5.6, ticks: [4.4, 4.6, 4.8, 5, 5.2, 5.4, 5.6] });
  });
});
