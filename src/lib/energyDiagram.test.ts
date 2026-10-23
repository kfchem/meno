import { describe, expect, it } from "vitest";
import { diagramOf, diagramSaid, type DiagramValue } from "./energyDiagram";
import { readTable, type Table } from "./table";
import { factor } from "./units";

const KCAL = factor("Eh", "kcal/mol");
const BY = { program: "prog", method: "GFN2-xTB" };

/** Molecules seen as a table: a reactant, a saddle point of two conformers (#2 the lower), a product - energies in hartrees. */
function levels(rows: [string, number, number | null][], columns: Table["columns"] = []): Table {
  return {
    columns: [{ name: "id", kind: "entry" }, { name: "title", kind: "text" }, { name: "number", kind: "number", unit: "none" }, { name: "energy", kind: "number", unit: "Eh", by: BY, at: { geometry: "own" } }, ...columns],
    rows: rows.map(([title, number, e], i) => [`molecule:${i + 1}#0`, title, number, e]),
    unread: [],
    left: [],
  };
}
const RTP = levels([
  ["R", 1, -76.4],
  ["TS", 1, -76.375],
  ["TS", 2, -76.38],
  ["P", 1, -76.42],
]);

const ok = (d: DiagramValue | { why: string }): DiagramValue => {
  if ("why" in d) throw new Error(d.why);
  return d;
};

describe("an energy diagram", () => {
  it("stands each level at its lowest, relative to the first, in kcal/mol - each joined to the next - its axis the quantity, worked out how", () => {
    const d = ok(diagramOf(RTP));
    expect(d.levels.map((l) => [l.name, Number(l.value.toFixed(4)), l.lowestOf, l.lowest.number, l.lowest.entry])).toEqual([
      ["R", 0, 1, 1, "molecule:1#0"],
      // (0.02 hartree above: 0.02 x 627.509 kcal/mol; the lower of its two conformers, #2)
      ["TS", Number((0.02 * KCAL).toFixed(4)), 2, 2, "molecule:3#0"],
      ["P", Number((-0.02 * KCAL).toFixed(4)), 1, 1, "molecule:4#0"],
    ]);
    expect(Number((0.02 * KCAL).toFixed(3))).toBe(12.55);
    expect([d.axis, d.reference, d.links, d.left]).toEqual([{ name: "\u0394E", unit: "kcal/mol", by: BY, at: { geometry: "own" } }, "R", [[0, 1], [1, 2]], []]);
    expect(diagramSaid(d)).toBe("3 levels \u00b7 relative to R");
  });

  it("is relative to the level named, and joins the levels as a table of what connects says - a line naming no level counted", () => {
    const connects = readTable("from,to\nR,TS\nTS,P\nR,Q\nP,P\n");
    const d = ok(diagramOf(RTP, { reference: "P" }, connects));
    expect([d.reference, d.levels.map((l) => Number(l.value.toFixed(3))), d.links, d.left]).toEqual([
      "P",
      [Number((0.02 * KCAL).toFixed(3)), Number((0.04 * KCAL).toFixed(3)), 0],
      [[0, 1], [1, 2]],
      [{ count: 2, why: "lines naming no other level (Q)", rows: ["Connects, row 3", "Connects, row 4"] }],
    ]);
    expect(diagramOf(RTP, {}, readTable("a,b\nR,P\n"))).toEqual({ why: 'Connects takes a table with columns "from" and "to"' });
  });

  it("says which level has not the quantity - and how it has one, where it does - and makes none", () => {
    const missing = levels([
      ["R", 1, -76.4],
      ["P", 1, null],
    ]);
    expect(diagramOf(missing)).toEqual({ why: '"P" has no energy' });
    // (the same property worked out two ways: a column for each, which levels have which said)
    const two: Table = {
      columns: [{ name: "id", kind: "entry" }, { name: "title", kind: "text" }, { name: "energy \u00b7 A", kind: "number", unit: "Eh" }, { name: "energy \u00b7 B", kind: "number", unit: "Eh" }],
      rows: [
        ["m1", "R", -76.4, null],
        ["m2", "TS", -76.38, null],
        ["m3", "P", null, -76.6],
      ],
      unread: [],
      left: [],
    };
    expect(diagramOf(two)).toEqual({ why: 'Its levels\' energy was not worked out one way: "energy \u00b7 A" for R, TS; "energy \u00b7 B" for P' });
    expect(diagramOf(two, { quantity: "energy \u00b7 A" })).toEqual({ why: '"P" has no energy \u00b7 A - it has "energy \u00b7 B"' });
    expect(diagramOf(RTP, { quantity: "number" })).toEqual({ why: '"number" is no energy' });
    expect(diagramOf(RTP, { quantity: "G" })).toEqual({ why: 'It has no column "G"' });
    expect(diagramOf(RTP, { reference: "Q" })).toEqual({ why: 'There is no level "Q"' });
    expect(diagramOf(levels([["R", 1, -76.4]]))).toEqual({ why: "It takes two levels at least" });
  });

  it("counts a conformer of a level with no value, where the level has others", () => {
    const d = ok(
      diagramOf(
        levels([
          ["R", 1, -76.4],
          ["TS", 1, null],
          ["TS", 2, -76.38],
        ]),
      ),
    );
    // (named by its entry, as a chart names a row it leaves)
    expect([d.levels[1].lowestOf, d.left]).toEqual([1, [{ count: 1, why: 'of "TS" with no energy', rows: ["molecule:2#0"] }]]);
  });

  it("names a level by its title, else its name, else its group", () => {
    const t: Table = {
      columns: [{ name: "id", kind: "entry" }, { name: "group", kind: "text" }, { name: "name", kind: "text" }, { name: "energy", kind: "number", unit: "kcal/mol" }],
      rows: [
        ["m1", "A", "r.xyz", 0],
        ["m2", "B", null, 5],
      ],
      unread: [],
      left: [],
    };
    expect(ok(diagramOf(t)).levels.map((l) => [l.name, l.value])).toEqual([
      ["r.xyz", 0],
      ["B", 5],
    ]);
  });
});
