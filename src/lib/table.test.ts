import { describe, expect, it } from "vitest";
import { geometryKey, type Entry, type Property } from "./entry";
import { delimiterOf, headerOf, moleculesAsTable, numberOf, readTable, records, variantNames } from "./table";

describe("a delimited text's records (RFC 4180)", () => {
  it("reads quoted fields - delimiters, line breaks and doubled quotes in them - CRLF lines, and skips blank lines", () => {
    const text = 'name,note\r\n"a, b","said ""yes""\nthen no"\r\n\r\nc,\n';
    expect(records(text, ",")).toEqual([
      ["name", "note"],
      ["a, b", 'said "yes"\nthen no'],
      ["c", ""],
    ]);
  });
});

describe("a table's header", () => {
  it("names a column and its unit, in round or square brackets; none, said or not; a unit Meno does not know, said", () => {
    expect(headerOf("energy (kcal/mol)")).toEqual({ name: "energy", unit: "kcal/mol" });
    expect(headerOf("T [K]")).toEqual({ name: "T", unit: "K" });
    expect(headerOf("count (none)")).toEqual({ name: "count", unit: "none" });
    expect(headerOf("shift")).toEqual({ name: "shift" });
    expect(headerOf("length (furlongs)")).toEqual({ name: "length", unknown: "furlongs" });
  });
});

describe("a number as a table writes it", () => {
  it("reads digits, a point, a sign - a minus sign too - and an exponent; nothing else", () => {
    expect(["1.5", "-2", "\u22122", "+3", "1e-3", ".5", "7."].map(numberOf)).toEqual([1.5, -2, -2, 3, 0.001, 0.5, 7]);
    // (a comma means one thing in one country and another in another; words, and nothing, are no number)
    expect(["1,000", "1 000", "abc", "", "NaN", "Infinity"].map(numberOf)).toEqual([null, null, null, null, null, null]);
  });
});

describe("a table read from a file", () => {
  it("types its columns - numbers by their unit or their cells, true or false, text - and counts what does not read", () => {
    const t = readTable("name,energy (kcal/mol),count,converged\na,1.5,3,yes\nb,n/a,4,no\nc,,5\nd,2,6,true\n");
    expect(t.columns).toEqual([
      { name: "name", kind: "text" },
      { name: "energy", kind: "number", unit: "kcal/mol" },
      { name: "count", kind: "number", unit: "none" },
      { name: "converged", kind: "bool" },
    ]);
    expect(t.rows).toEqual([
      ["a", 1.5, 3, true],
      ["b", null, 4, false],
      ["d", 2, 6, true],
    ]);
    // (a cell that is no number in a column of numbers, and a row one cell short: each counted, where it is, and why)
    expect(t.unread).toEqual([
      { row: 3, column: "", text: "c, , 5", why: "3 cells for 4 columns" },
      { row: 2, column: "energy", text: "n/a", why: "not a number" },
    ]);
  });

  it("reads TSV where its first line has a tab, and says a unit it does not know - its column read as text", () => {
    const t = readTable("x (furlongs)\ty (\u00c5)\n1\t2\n3\t4\n");
    expect(t.columns).toEqual([
      { name: "x", kind: "text" },
      { name: "y", kind: "number", unit: "\u00c5" },
    ]);
    expect(t.rows).toEqual([
      ["1", 2],
      ["3", 4],
    ]);
    expect(t.unread).toEqual([{ row: 0, column: "x", text: "furlongs", why: "a unit Meno's units table does not know: read as text" }]);
  });
});

/** A water as an entry, with the properties given. */
function water(id: string, properties: Record<string, Property>): Entry {
  return {
    id,
    from: [],
    structure: {
      atoms: [{ el: "O" }, { el: "H" }, { el: "H" }],
      bonds: [
        { a1: 0, a2: 1, order: 1 },
        { a1: 0, a2: 2, order: 1 },
      ],
    },
    geometry: { kind: "none" },
    species: { charge: 0, multiplicity: 1, from: { charge: "atoms", multiplicity: "atoms" } },
    properties,
    status: "done",
  };
}

const energy = (v: number, method: string): Property => ({ value: v, unit: "Eh", by: { program: "prog", method }, at: { geometry: "g" }, status: "computed" });

describe("molecules seen as a table", () => {
  it("is a row per entry - its id, constitution, configuration - and a column per property, numbers with their unit and what worked them out", () => {
    const t = moleculesAsTable([water("e1", { energy: energy(-76.4, "A"), name: { value: "water", unit: "none", status: "computed" } }), water("e2", { energy: energy(-76.3, "A") })]);
    expect(t.columns.map((c) => c.name)).toEqual(["id", "constitution", "configuration", "energy \u00b7 at another geometry", "name"]);
    // (worked out at a geometry not the entry's own - it has none here - said so, not by its key: in its name too)
    expect(t.columns[3]).toEqual({ name: "energy \u00b7 at another geometry", kind: "number", unit: "Eh", by: { program: "prog", method: "A" }, at: { geometry: "another" } });
    expect(t.rows.map((r) => [r[0], r[2], r[3], r[4]])).toEqual([
      ["e1", "not known", -76.4, "water"],
      ["e2", "not known", -76.3, null],
    ]);
    // (one constitution, written the same for both)
    expect(t.rows[0][1]).toBe(t.rows[1][1]);
  });

  it("makes a property worked out two ways two columns, named for how - never one; and leaves, saying so, what is no number, text or true or false", () => {
    const t = moleculesAsTable([
      water("e1", { energy: energy(-76.4, "A"), charges: { value: { list: [-0.8, 0.4, 0.4], per: "atom" }, unit: "none", status: "computed" } }),
      water("e2", { energy: energy(-76.1, "B") }),
      water("e3", { energy: { ...energy(-76.5, "A"), status: { failed: "did not converge" } } }),
    ]);
    // (named for what tells them apart - here the method, the rest alike - and where: at another geometry than their entries', which have none)
    expect(t.columns.slice(3).map((c) => c.name)).toEqual(["energy \u00b7 A at another geometry", "energy \u00b7 B at another geometry"]);
    expect(t.rows.map((r) => r.slice(3))).toEqual([
      [-76.4, null],
      [null, -76.1],
      [null, null],
    ]);
    // (one that failed: missing in its row, and counted)
    expect(t.left).toEqual([
      { column: "charges", why: "a list, not a column" },
      { column: "energy", why: "1 not worked out, missing in its row" },
    ]);
  });

  it("makes a property worked out at each entry's own geometry one column - every row its own - and one at another geometry its own column", () => {
    const at3d = (id: string, xyz: number[], energies: { own?: number; other?: number }): Entry => ({
      ...water(id, {}),
      geometry: { kind: "3d", xyz },
      properties: {
        ...(energies.own != null ? { energy: { ...energy(energies.own, "A"), at: { geometry: geometryKey(xyz) } } } : {}),
        ...(energies.other != null ? { sp: { ...energy(energies.other, "A"), at: { geometry: "elsewhere" } } } : {}),
      },
    });
    const t = moleculesAsTable([
      at3d("e1", [0, 0, 0, 0.96, 0, 0, -0.24, 0.93, 0], { own: -76.4 }),
      at3d("e2", [0, 0, 0, 0.97, 0, 0, -0.24, 0.94, 0], { own: -76.3, other: -76.2 }),
    ]);
    expect(t.columns.slice(3).map((c) => [c.name, c.kind === "number" ? c.at?.geometry : null])).toEqual([
      ["energy", "own"],
      // (at another geometry: said in its name, though it is its property's only column)
      ["sp \u00b7 at another geometry", "another"],
    ]);
    expect(t.rows.map((r) => r.slice(3))).toEqual([
      [-76.4, null],
      [-76.3, -76.2],
    ]);
    // (the same property at its own geometry in one row and another's in the next: two columns, named for where)
    const mixed = moleculesAsTable([at3d("e1", [0, 0, 0, 0.96, 0, 0, -0.24, 0.93, 0], { own: -76.4 }), { ...at3d("e2", [0, 0, 0, 0.97, 0, 0, -0.24, 0.94, 0], {}), properties: { energy: { ...energy(-76.2, "A"), at: { geometry: "elsewhere" } } } }]);
    expect(mixed.columns.slice(3).map((c) => c.name)).toEqual(["energy \u00b7 at its geometry", "energy \u00b7 at another geometry"]);
    // (two ways at another geometry, told apart by method: each says where too)
    const two = moleculesAsTable([
      { ...at3d("e1", [0, 0, 0, 0.96, 0, 0, -0.24, 0.93, 0], {}), properties: { energy: { ...energy(-76.2, "A"), at: { geometry: "elsewhere" } } } },
      { ...at3d("e2", [0, 0, 0, 0.97, 0, 0, -0.24, 0.94, 0], {}), properties: { energy: { ...energy(-76.1, "B"), at: { geometry: "elsewhere" } } } },
    ]);
    expect(two.columns.slice(3).map((c) => c.name)).toEqual(["energy \u00b7 A at another geometry", "energy \u00b7 B at another geometry"]);
    // (an entry of frames or a drawing has no own geometry: its property at any is at another)
    const k = [0, 0, 0, 0.96, 0, 0, -0.24, 0.93, 0];
    const drawn = moleculesAsTable([
      { ...water("d1", {}), geometry: { kind: "2d", xy: [0, 0, 1, 0, -0.3, 0.9] }, properties: { energy: { ...energy(-76.4, "A"), at: { geometry: geometryKey(k) } } } },
      { ...water("f1", {}), geometry: { kind: "frames", frames: [k, k] }, properties: { energy: { ...energy(-76.3, "A"), at: { geometry: geometryKey(k) } } } },
    ]);
    expect(drawn.columns.slice(3).map((c) => [c.name, c.kind === "number" ? c.at?.geometry : null])).toEqual([["energy \u00b7 at another geometry", "another"]]);
    expect(drawn.rows.map((r) => r[3])).toEqual([-76.4, -76.3]);
  });
});

describe("a table read from a file, as programs write them", () => {
  it("leaves out a byte-order mark before a quoted first header", () => {
    const t = readTable('\uFEFF"name",energy (Eh),count\na,1,2\n');
    expect([t.columns.map((c) => c.name), t.rows, t.unread]).toEqual([["name", "energy", "count"], [["a", 1, 2]], []]);
  });

  it("reads values separated by semicolons where the first line has those and no commas", () => {
    expect(["a\tb", "a;b", "a,b", "a;b,c"].map((l) => delimiterOf(l))).toEqual(["\t", ";", ",", ","]);
    // (a single column whose name holds a semicolon: its rows have none - one column, read whole)
    const one = readTable("note; remark\nhello\nthere\n");
    expect([one.columns.map((c) => c.name), one.rows, one.unread]).toEqual([["note; remark"], [["hello"], ["there"]], []]);
    const t = readTable("name;shift (none)\nC1;7,26\nC2;128.4\n");
    expect(t.columns.map((c) => c.name)).toEqual(["name", "shift"]);
    // (a decimal comma is no number Meno reads: said where it is)
    expect(t.unread).toEqual([{ row: 1, column: "shift", text: "7,26", why: "not a number" }]);
  });

  it("names a second column of one name apart, and says so", () => {
    const t = readTable("x,x,x\n1,2,3\n");
    expect(t.columns.map((c) => c.name)).toEqual(["x", "x (2)", "x (3)"]);
    expect(t.unread.map((u) => u.why)).toEqual(['a second column named "x": named "x (2)"', 'a second column named "x": named "x (3)"']);
  });

  it("says why a column of numbers but for a cell is read as text", () => {
    const t = readTable("value\n1\n2\nabout 3\n4\n");
    expect(t.columns).toEqual([{ name: "value", kind: "text" }]);
    expect(t.unread).toEqual([{ row: 3, column: "value", text: "about 3", why: "read as text: 1 of 4 cells are no number" }]);
  });
});

describe("a property's ways of being worked out, named apart", () => {
  const p = (by: Property["by"], at: Property["at"]): Property => ({ value: 1, unit: "Eh", by, at, status: "computed" });
  it("by what tells them apart - geometry, step, run, plugin, conditions - numbered only where that is not enough", () => {
    expect(variantNames("energy", [p({ program: "xtb", step: "3" }, { geometry: "aa" }), p({ program: "xtb", step: "4" }, { geometry: "aa" })])).toEqual(["energy \u00b7 step 3", "energy \u00b7 step 4"]);
    expect(variantNames("energy", [p({ program: "xtb" }, { geometry: "aa" }), p({ program: "xtb" }, { geometry: "bb" }), p({ program: "xtb", plugin: "x" }, { geometry: "bb" })])).toEqual([
      "energy \u00b7 plugin not stated geometry aa",
      "energy \u00b7 plugin not stated geometry bb",
      "energy \u00b7 plugin x geometry bb",
    ]);
    expect(variantNames("G", [p({ program: "xtb", run: "r1" }, { geometry: "g", kelvin: 298.15 }), p({ program: "xtb", run: "r1" }, { geometry: "g", kelvin: 310 })])).toEqual(["G \u00b7 298.15 K", "G \u00b7 310 K"]);
    // (one way: its name alone)
    expect(variantNames("energy", [p({ program: "xtb" }, { geometry: "g" })])).toEqual(["energy"]);
  });

  it("counts a property with no value as missing, never throwing", () => {
    const t = moleculesAsTable([water("e1", { energy: { ...energy(-76.4, "A"), value: null as unknown as number } }), water("e2", { energy: energy(-76.3, "A") })]);
    expect(t.rows.map((r) => r[3])).toEqual([null, -76.3]);
    expect(t.left).toEqual([{ column: "energy", why: "1 with no value, missing in its row" }]);
  });
});
