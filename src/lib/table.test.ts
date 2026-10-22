import { describe, expect, it } from "vitest";
import type { Entry, Property } from "./entry";
import { headerOf, moleculesAsTable, numberOf, readTable, records } from "./table";

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
    expect(t.columns.map((c) => c.name)).toEqual(["id", "constitution", "configuration", "energy", "name"]);
    expect(t.columns[3]).toEqual({ name: "energy", kind: "number", unit: "Eh", by: { program: "prog", method: "A" }, at: { geometry: "g" } });
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
    expect(t.columns.slice(3).map((c) => c.name)).toEqual(["energy \u00b7 prog A (Eh)", "energy \u00b7 prog B (Eh)"]);
    expect(t.rows.map((r) => r.slice(3))).toEqual([
      [-76.4, null],
      [null, -76.1],
      [null, null],
    ]);
    expect(t.left).toEqual([{ column: "charges", why: "a list, not a column" }]);
  });
});
