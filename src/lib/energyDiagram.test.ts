import { describe, expect, it } from "vitest";
import { deltaOf, diagramIn, diagramOf, diagramQuantities, diagramSaid, levelsTyped, withoutExtension, type DiagramValue } from "./energyDiagram";
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

  it("names a free energy's axis and card line by its symbol, G, and an enthalpy's H - a correction as it is named", () => {
    const g = levels([
      ["R", 1, -76.4],
      ["P", 1, -76.42],
    ]);
    g.columns[3] = { ...g.columns[3], name: "thermo.free-energy" };
    expect(ok(diagramOf(g, { quantity: "thermo.free-energy" })).axis.name).toBe("\u0394G");
    expect([deltaOf("thermo.free-energy"), deltaOf("thermo.enthalpy"), deltaOf("energy"), deltaOf("thermo.zpve")]).toEqual(["\u0394G", "\u0394H", "\u0394E", "\u0394thermo.zpve"]);
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
    // (a quantity with a symbol said by it: E)
    expect(diagramOf(missing)).toEqual({ why: '"P" has no E' });
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
    expect(diagramOf(two)).toEqual({ why: 'Its levels\' E was not worked out one way: "energy \u00b7 A" for R, TS; "energy \u00b7 B" for P' });
    // (one with no symbol: by its name, in quotes)
    expect(diagramOf(two, { quantity: "energy \u00b7 A" })).toEqual({ why: '"P" has no "energy \u00b7 A" - it has "energy \u00b7 B"' });
    expect(diagramOf(RTP, { quantity: "number" })).toEqual({ why: '"number" is no energy' });
    expect(diagramOf(RTP, { quantity: "thermo.free-energy" })).toEqual({ why: "It has no G" });
    expect(diagramOf(RTP, { quantity: "G" })).toEqual({ why: 'It has no "G"' });
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
    expect([d.levels[1].lowestOf, d.left]).toEqual([1, [{ count: 1, why: 'of "TS" with no E', rows: ["molecule:2#0"] }]]);
  });

  it("names a level by its title, else its name - the file it came from, without its extension - else its group", () => {
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
      ["r", 0],
      ["B", 5],
    ]);
    // (an extension begins with a letter: a number after a point is part of the name)
    expect(["R.out", "ts.log", "TS 1.2", "2.5", ".out", "a.b.xyz"].map(withoutExtension)).toEqual(["R", "ts", "TS 1.2", "2.5", ".out", "a.b"]);
  });
});

describe("an energy diagram's levels as Levels lists them", () => {
  // HCN, its isomerisation's saddle point and HNC as ORCA 6.1.1 gave them (r2SCAN-3c, Opt Freq), opened in the order P, R, TS:
  // each FINAL SINGLE POINT ENERGY, in hartrees
  const opened = levels([
    ["P", 1, -93.375824209007],
    ["R", 1, -93.399651434575],
    ["TS", 1, -93.324592691836],
  ]);

  it("draws them in the order listed, relative to the one named - R, TS, P relative to R: P 15.0, TS 47.1 kcal/mol above", () => {
    const d = ok(diagramOf(opened, { levels: "R\nTS\nP", reference: "R" }));
    expect(d.levels.map((l) => [l.name, Number(l.value.toFixed(2))])).toEqual([
      ["R", 0],
      ["TS", 47.1],
      ["P", 14.95],
    ]);
    // (by hand: (-93.324592691836 + 93.399651434575) x 627.509; (-93.375824209007 + 93.399651434575) x 627.509)
    expect([((-93.324592691836 + 93.399651434575) * KCAL).toFixed(2), ((-93.375824209007 + 93.399651434575) * KCAL).toFixed(2)]).toEqual(["47.10", "14.95"]);
    expect([d.reference, d.links]).toEqual(["R", [[0, 1], [1, 2]]]);
    expect(diagramSaid(d)).toBe("3 levels \u00b7 relative to R");
    // (none listed: as they came, relative to the first)
    expect(ok(diagramOf(opened)).levels.map((l) => l.name)).toEqual(["P", "R", "TS"]);
  });

  it("shows each by the name its line gives, and takes the reference and the lines of Connects by either name", () => {
    const d = ok(diagramOf(opened, { levels: "R = HCN\nTS\nP = HNC", reference: "HCN" }, readTable("from,to\nR,TS\nTS,HNC\n")));
    expect(d.levels.map((l) => [l.name, l.of])).toEqual([
      ["HCN", "R"],
      ["TS", undefined],
      ["HNC", "P"],
    ]);
    expect([d.reference, d.links, d.left]).toEqual(["HCN", [[0, 1], [1, 2]], []]);
    expect(ok(diagramOf(opened, { levels: "R = HCN", reference: "R" })).reference).toBe("HCN");
    // (kept with the workspace, its other name with it)
    expect(diagramIn(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it("leaves none out: those not listed after the rest, as they came; a line naming no level, or one listed already, counted", () => {
    const d = ok(diagramOf(opened, { levels: "TS\n\nQ\nTS\nR" }));
    expect(d.levels.map((l) => l.name)).toEqual(["TS", "R", "P"]);
    expect(d.left).toEqual([
      { count: 1, why: "line of Levels naming no level that comes in (Q)", rows: ["Levels, line 3"] },
      { count: 1, why: "line of Levels naming a level listed already", rows: ["Levels, line 4"] },
    ]);
    expect(diagramOf(opened, { levels: "R = X\nP = X" })).toEqual({ why: 'Two levels are named "X"' });
    expect(diagramOf(opened, { levels: "R = TS" })).toEqual({ why: 'Two levels are named "TS"' });
  });

  it("reads a line as a level's name, and a name to show it by after =", () => {
    expect(levelsTyped("R\n  TS = saddle point \n\nP =\n= X")).toEqual([{ of: "R" }, { of: "TS", as: "saddle point" }, null, { of: "P" }, { of: "", as: "X" }]);
  });
});

describe("the energies an energy diagram may be drawn by", () => {
  it("are those its levels carry, each by its symbol, in words, and what worked it out and where - never a correction", () => {
    const by = { program: "ORCA", method: "r2SCAN-3c" };
    const t: Table = {
      columns: [
        { name: "id", kind: "entry" },
        { name: "energy", kind: "number", unit: "Eh", by },
        { name: "thermo.free-energy", kind: "number", unit: "Eh", by, at: { geometry: "own", kelvin: 298.15, atm: 1 } },
        { name: "thermo.enthalpy", kind: "number", unit: "Eh", by, at: { geometry: "own", kelvin: 298.15 } },
        { name: "thermo.zpve", kind: "number", unit: "Eh", by },
        { name: "thermo.g-correction", kind: "number", unit: "Eh", by },
        { name: "dipole", kind: "number", unit: "none" },
        { name: "barrier", kind: "number", unit: "kJ/mol" },
      ],
      rows: [],
      unread: [],
      left: [],
    };
    expect(diagramQuantities(t)).toEqual([
      { value: "energy", label: "\u0394E \u00b7 electronic energy \u00b7 ORCA \u00b7 r2SCAN-3c" },
      { value: "thermo.free-energy", label: "\u0394G \u00b7 Gibbs free energy \u00b7 ORCA \u00b7 r2SCAN-3c \u00b7 298.15\u00a0K \u00b7 1\u00a0atm" },
      { value: "thermo.enthalpy", label: "\u0394H \u00b7 enthalpy \u00b7 ORCA \u00b7 r2SCAN-3c \u00b7 298.15\u00a0K" },
      { value: "barrier", label: "\u0394barrier" },
    ]);
    // (one worked out two ways: each a column, named for how)
    expect(diagramQuantities({ columns: [{ name: "energy \u00b7 GFN2-xTB", kind: "number", unit: "Eh" }] })).toEqual([{ value: "energy \u00b7 GFN2-xTB", label: "\u0394E \u00b7 electronic energy \u00b7 GFN2-xTB" }]);
  });
});

describe("an energy diagram's level of several compounds, told apart", () => {
  /** Levels each a row - its level, its compound's key, elements, charge and multiplicity - and an energy in hartrees. */
  const rows = (given: [string, string, string[], number, number, number][]) => ({
    table: levels(given.map(([level, , , , , e], k) => [level, k + 1, e])),
    compounds: given.map(([, key, elements, charge, multiplicity]) => ({ key, elements, charge, multiplicity })),
  });
  const C2H4O = ["C", "C", "H", "H", "H", "H", "O"];

  it("says what each level of several sums, where it refuses them on their atoms - a keto and an enol held as two, a singlet and a triplet", () => {
    const keto = rows([
      ["R", "keto", C2H4O, 0, 1, -153.1],
      ["R", "enol", C2H4O, 0, 1, -153.08],
      ["P", "keto", C2H4O, 0, 1, -153.1],
    ]);
    expect(diagramOf(keto.table, {}, undefined, keto.compounds)).toEqual({
      why: "Its levels do not hold the same atoms and charge: R has C4H8O2; P has C2H4O - R sums two compounds: C2H4O, C2H4O",
    });
    const carbene = rows([
      ["R", "CH2|0|1", ["C", "H", "H"], 0, 1, -39.0],
      ["R", "CH2|0|3", ["C", "H", "H"], 0, 3, -39.02],
      ["P", "CH2|0|3", ["C", "H", "H"], 0, 3, -39.02],
    ]);
    expect(diagramOf(carbene.table, {}, undefined, carbene.compounds)).toEqual({
      why: "Its levels do not hold the same atoms and charge: R has C2H4; P has CH2 - R sums two compounds: CH2 (singlet), CH2 (triplet)",
    });
  });

  it("takes one compound held twice as one, at its lower - two A is one A; a dimer is a compound of its own", () => {
    const twice = rows([
      ["R", "A", ["C", "H", "H", "H", "H"], 0, 1, -40.5],
      ["R", "A", ["C", "H", "H", "H", "H"], 0, 1, -40.52],
      ["P", "A", ["C", "H", "H", "H", "H"], 0, 1, -40.5],
    ]);
    const d = ok(diagramOf(twice.table, {}, undefined, twice.compounds));
    expect([d.levels[0].lowestOf, d.levels[0].sums, Number(d.levels[1].value.toFixed(2))]).toEqual([2, undefined, Number((0.02 * KCAL).toFixed(2))]);
  });
});

