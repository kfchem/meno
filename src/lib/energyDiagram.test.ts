import { describe, expect, it } from "vitest";
import { deltaOf, diagramIn, diagramOf, diagramQuantities, diagramSaid, levelNamer, levelsTyped, referenceNeed, withoutExtension, type DiagramValue } from "./energyDiagram";
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
    expect(diagramOf(RTP, { reference: "Q" })).toEqual({ why: 'No level is called "Q"' });
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
  // HCN, its isomerisation's saddle point and HNC, opened in the order P, R, TS: each one's energy in hartrees, made up
  const opened = levels([
    ["P", 1, -93.376],
    ["R", 1, -93.4],
    ["TS", 1, -93.325],
  ]);

  it("draws them in the order listed, relative to the one named - R, TS, P relative to R: P 15.1, TS 47.1 kcal/mol above", () => {
    const d = ok(diagramOf(opened, { levels: "R\nTS\nP", reference: "R" }));
    expect(d.levels.map((l) => [l.name, Number(l.value.toFixed(2))])).toEqual([
      ["R", 0],
      ["TS", 47.06],
      ["P", 15.06],
    ]);
    // (by hand: (-93.325 + 93.4) x 627.509; (-93.376 + 93.4) x 627.509)
    expect([((-93.325 + 93.4) * KCAL).toFixed(2), ((-93.376 + 93.4) * KCAL).toFixed(2)]).toEqual(["47.06", "15.06"]);
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
    // (the name no level has, said; among the rest left, where there are others - and kept with the workspace)
    expect([d.unlisted, diagramSaid(d)]).toEqual([["Q"], "3 levels \u00b7 relative to TS \u00b7 2 left, Q among them"]);
    expect(diagramIn(JSON.parse(JSON.stringify(d)))).toEqual(d);
    const foo = ok(diagramOf(opened, { levels: "R\nTS\nP\nFoo" }));
    expect([foo.unlisted, diagramSaid(foo)]).toEqual([["Foo"], "3 levels \u00b7 relative to R \u00b7 1 left: Foo"]);
    expect(diagramSaid(ok(diagramOf(opened, { levels: "R\nR" })))).toBe("3 levels \u00b7 relative to R \u00b7 1 left");
    expect(diagramOf(opened, { levels: "R = X\nP = X" })).toEqual({ why: 'Two levels are named "X"' });
    expect(diagramOf(opened, { levels: "R = TS" })).toEqual({ why: 'Two levels are named "TS"' });
  });

  it("names a reference no level has before it runs - by either of a level's names, as the diagram takes it - and none where it is blank", () => {
    const names = ["R", "TS", "TS", "P"];
    expect(referenceNeed(names, "", "Zed")).toBe('No level is called "Zed"');
    expect(referenceNeed(names, "R = HCN", "HCN")).toBeUndefined();
    expect(referenceNeed(names, "R = HCN", "R")).toBeUndefined();
    expect(referenceNeed(names, "", " P ")).toBeUndefined();
    expect([referenceNeed(names, "", ""), referenceNeed(names, "", undefined)]).toEqual([undefined, undefined]);
    // (the same as the diagram's own refusal, where it is drawn from those levels)
    expect(diagramOf(opened, { reference: "Zed" })).toEqual({ why: referenceNeed(["R", "TS", "P"], "", "Zed") });
    // (levels that cannot be shown as listed: the diagram says why, not this)
    expect(referenceNeed(names, "R = X\nP = X", "Zed")).toBeUndefined();
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


describe("an energy diagram: levels by a property, joined by properties, columns from the lines, every conformer", () => {
  /**
   * A workflow's minima and saddle points as the table of entries sees them, free energies in kcal/mol: minima a (three
   * conformers, 0.0, 0.8 and 1.5), b and c (two), each carrying `species`; saddle points "a>b" (two) and "a>c", each
   * carrying `path` and its ends, `first end` and `last end`.
   */
  const COLUMNS: Table["columns"] = [
    { name: "id", kind: "entry" },
    { name: "number", kind: "number", unit: "none" },
    { name: "energy", kind: "number", unit: "kcal/mol", by: BY, at: { geometry: "own" } },
    { name: "species", kind: "text" },
    { name: "path", kind: "text" },
    { name: "first end", kind: "text" },
    { name: "last end", kind: "text" },
  ];
  type Row = [number, number | null, string | null, string | null, string | null, string | null];
  const tableOf = (rows: Row[], columns = COLUMNS): Table => ({ columns, rows: rows.map((r, i) => [`molecule:${i + 1}#0`, ...r]), unread: [], left: [] });
  const MINIMA: Row[] = [
    [1, 0.0, "a", null, null, null],
    [2, 0.8, "a", null, null, null],
    [3, 1.5, "a", null, null, null],
    [1, -6.3, "b", null, null, null],
    [1, -1.9, "c", null, null, null],
    [2, -1.0, "c", null, null, null],
  ];
  const SADDLES: Row[] = [
    [1, 35.2, null, "a>b", "a", "b"],
    [2, 36.0, null, "a>b", "a", "b"],
    [1, 29.1, null, "a>c", "a", "c"],
  ];
  const T = tableOf([...MINIMA, ...SADDLES]);
  const by = { levelsBy: "species\npath", reference: "a" };
  const joined = { ...by, joinedBy: "first end\nlast end" };

  it("names a level by the first of the properties an entry carries - species, else path - and by today's rule where it carries none", () => {
    const d = ok(diagramOf(T, by));
    expect(d.levels.map((l) => [l.name, l.named, l.lowestOf])).toEqual([
      ["a", "species", 3],
      ["b", "species", 1],
      ["c", "species", 2],
      ["a>b", "path", 2],
      ["a>c", "path", 1],
    ]);
    // (no property named: today's, by title, name or group - none here)
    expect(levelNamer(T)(T.rows[0])).toBe("");
    expect(levelNamer(T, ["species", "path"])(T.rows[0])).toBe("a");
    expect(diagramOf(T, { levelsBy: "colour" })).toEqual({ why: 'Levels by names "colour", which no entry carries' });
  });

  it("joins each level to the levels a property names - the first names what comes before it, the rest what comes after - and puts the levels in columns from the reference, the direction kept", () => {
    const d = ok(diagramOf(T, joined));
    // (a=0 b=1 c=2 a>b=3 a>c=4)
    expect(d.links).toEqual([[0, 3], [3, 1], [0, 4], [4, 2]]);
    expect(d.levels.map((l) => [l.name, l.column])).toEqual([["a", 0], ["b", 2], ["c", 2], ["a>b", 1], ["a>c", 1]]);
    expect(d.left).toEqual([
      // (two conformers of a>b both name a and b: nothing to say; the lowest's taken)
    ]);
  });

  it("is relative to the reference, in the direction the lines run: A - TS1 - I - TS2 - P from Connects, relative to I, is columns 0 1 2 3 4 - not A and P in one", () => {
    const chain = tableOf([
      [1, 0, "A", null, null, null],
      [1, 20, "TS1", null, null, null],
      [1, 5, "I", null, null, null],
      [1, 18, "TS2", null, null, null],
      [1, -3, "P", null, null, null],
    ]);
    const connects = readTable("from,to\nA,TS1\nTS1,I\nI,TS2\nTS2,P\n");
    const d = ok(diagramOf(chain, { levelsBy: "species", reference: "I" }, connects));
    expect(d.levels.map((l) => [l.name, l.column])).toEqual([["A", 0], ["TS1", 1], ["I", 2], ["TS2", 3], ["P", 4]]);
    expect(d.reference).toBe("I");
  });

  it("draws every other conformer of a level as a thin line at its own value, the bold one at the lowest: a's are 0.8 and 1.5", () => {
    const d = ok(diagramOf(T, { ...joined, conformers: "every" }));
    expect(d.levels[0].others?.map((o) => [Number(o.value.toFixed(4)), o.number, o.entry])).toEqual([
      [0.8, 2, "molecule:2#0"],
      [1.5, 3, "molecule:3#0"],
    ]);
    // (c's other, relative to a's lowest; the lowest of a saddle point's two)
    expect(d.levels[2].others?.map((o) => Number(o.value.toFixed(4)))).toEqual([-1]);
    expect(d.levels[3].others?.map((o) => Number(o.value.toFixed(4)))).toEqual([36]);
    // (none where the option is the lowest: as today)
    expect(ok(diagramOf(T, joined)).levels.every((l) => l.others === undefined)).toBe(true);
  });

  it("converts a thin line's value as the bold ones' - hartrees in, kcal/mol out: 0.001 and 0.002 Eh above are 0.6275 and 1.2550", () => {
    const eh = tableOf(
      [
        [1, -76.4, "a", null, null, null],
        [2, -76.399, "a", null, null, null],
        [3, -76.398, "a", null, null, null],
        [1, -76.42, "b", null, null, null],
      ],
      COLUMNS.map((c) => (c.name === "energy" ? { ...c, unit: "Eh" as const } : c)),
    );
    const d = ok(diagramOf(eh, { levelsBy: "species", conformers: "every" }));
    expect(d.levels[0].others?.map((o) => Number(o.value.toFixed(4)))).toEqual([0.6275, 1.255]);
  });

  it("counts a conformer with no value, never just absent; and says once that a level of several compounds draws no thin lines", () => {
    const missing = tableOf([...MINIMA.slice(0, 2), [3, null, "a", null, null, null], MINIMA[3]]);
    const d = ok(diagramOf(missing, { levelsBy: "species", conformers: "every" }));
    expect(d.left).toEqual([{ count: 1, why: 'of "a" with no E: not drawn', rows: expect.any(Array) }]);
    // (R: two compounds, a sum; P one compound of two conformers)
    const AB = ["C", "H", "H", "H", "H", "Cl"];
    const rows: [string, string, string[], number, number, number][] = [
      ["R", "A", ["C", "H", "H", "H", "H"], 0, 1, -10.0],
      ["R", "A", ["C", "H", "H", "H", "H"], 0, 1, -9.9],
      ["R", "B", ["Cl"], 0, 1, -5.0],
      ["P", "AB", AB, 0, 1, -15.1],
      ["P", "AB", AB, 0, 1, -15.0],
    ];
    const t: Table = {
      columns: [{ name: "id", kind: "entry" }, { name: "title", kind: "text" }, { name: "number", kind: "number", unit: "none" }, { name: "energy", kind: "number", unit: "Eh", by: BY }],
      rows: rows.map(([l, , , , , e], i) => [`molecule:${i + 1}#0`, l, i + 1, e]),
      unread: [],
      left: [],
    };
    const s = ok(diagramOf(t, { conformers: "every" }, undefined, rows.map(([, key, elements, charge, multiplicity]) => ({ key, elements, charge, multiplicity }))));
    expect(s.levels[0].others).toBeUndefined();
    expect(s.levels[1].others).toHaveLength(1);
    expect(s.left).toEqual([{ count: 1, why: "level that sum compounds: thin lines not drawn", rows: ["R"] }]);
  });

  it("counts a value naming no level, or its own level, and says where a level's conformers name different levels - its lowest's taken", () => {
    const odd = tableOf([
      ...MINIMA,
      [1, 35.2, null, "a>b", "a", "b"],
      // (a>b's second conformer names another first end; the lowest's, a, is taken)
      [2, 36.0, null, "a>b", "c", "b"],
      // (a>c ends in a level that does not come in; a path whose end is itself)
      [1, 29.1, null, "a>c", "a", "zzz"],
      [1, 40.0, null, "loop", "loop", "loop"],
    ]);
    const d = ok(diagramOf(odd, joined));
    expect(d.links).toEqual([[0, 3], [3, 1], [0, 4]]);
    expect(d.left.map((l) => [l.count, l.why, l.rows])).toEqual([
      [1, "level whose conformers name different levels: the lowest's taken", ["a>b: its conformers name 2 different first ends; its lowest's taken"]],
      [3, "values of Joined by naming no other level (zzz, loop)", ["Joined by, a>c: last end", "Joined by, loop: first end", "Joined by, loop: last end"]],
      // (c's line was a>c's, which named a level that does not come in; loop has none)
      [2, "levels no line reaches: after the last column", ["c", "loop"]],
    ]);
    expect(d.levels.map((l) => l.column)).toEqual([0, 2, 3, 1, 1, 4]);
  });

  it("refuses links from both Connects and Joined by", () => {
    expect(diagramOf(T, joined, readTable("from,to\na,b\n"))).toEqual({ why: "Links from both Connects and Joined by: take one" });
  });

  it("keeps a level that a cycle reaches at two distances at the nearest to the reference, said", () => {
    // (a - b - c - a: a loop of three lines all running one way)
    const cyc = tableOf([
      [1, 0, "a", null, null, null],
      [1, 5, "b", null, null, null],
      [1, 9, "c", null, null, null],
    ]);
    const d = ok(diagramOf(cyc, { levelsBy: "species", reference: "a" }, readTable("from,to\na,b\nb,c\nc,a\n")));
    // (c is one line behind a, and two ahead of it: the nearest, one behind; b is as ambiguous)
    expect(d.levels.map((l) => l.column)).toEqual([1, 2, 0]);
    expect(d.left.map((l) => [l.count, l.rows])).toEqual([[2, ["b", "c"]]]);
  });

  it("joins a pair once where both properties name it - a's Last end names a>b, and a>b's First end names a", () => {
    const both = tableOf([
      [1, 0, "a", null, null, "a>b"],
      [1, 35.2, null, "a>b", "a", "b"],
      [1, -6.3, "b", null, null, null],
    ]);
    const d = ok(diagramOf(both, joined));
    // (a=0 a>b=1 b=2: the pair a, a>b once)
    expect(d.links).toEqual([[0, 1], [1, 2]]);
    expect(d.left).toEqual([]);
  });

  it("counts columns from the reference named, wherever it stands in the list: in a cycle, and where the lines leave some levels out", () => {
    const cyc = tableOf([
      [1, 0, "a", null, null, null],
      [1, 5, "b", null, null, null],
      [1, 9, "c", null, null, null],
    ]);
    // (relative to c: a is one line ahead of it, b one behind - b 0, c 1, a 2; a and b are each reached two ways)
    const around = ok(diagramOf(cyc, { levelsBy: "species", reference: "c" }, readTable("from,to\na,b\nb,c\nc,a\n")));
    expect(around.levels.map((l) => l.column)).toEqual([2, 0, 1]);
    expect(around.left.map((l) => [l.count, l.rows])).toEqual([[2, ["a", "b"]]]);
    // (only b to c given, relative to c: b 0, c 1, and a, no line reaches, after them)
    const apart = ok(diagramOf(cyc, { levelsBy: "species", reference: "c" }, readTable("from,to\nb,c\n")));
    expect(apart.levels.map((l) => l.column)).toEqual([2, 0, 1]);
    expect(apart.left.map((l) => [l.count, l.rows])).toEqual([[1, ["a"]]]);
  });

  it("is read back from a file as it was made, columns, thin lines and the property that named a level; one without them reads as today", () => {
    const d = ok(diagramOf(T, { ...joined, conformers: "every" }));
    const back = diagramIn(JSON.parse(JSON.stringify(d)))!;
    expect(back).toEqual(d);
    const old = ok(diagramOf(RTP));
    expect(diagramIn(JSON.parse(JSON.stringify(old)))).toEqual(old);
    expect(old.levels.some((l) => l.column !== undefined || l.others !== undefined || l.named !== undefined)).toBe(false);
  });
});
