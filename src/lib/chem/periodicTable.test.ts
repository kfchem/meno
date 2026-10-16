import { describe, expect, it } from "vitest";
import { ELEMENTS } from "./elements";
import { SERIES_PLACES, TABLE_COLUMNS, TABLE_ROWS, tablePlace } from "./periodicTable";
import { COLOUR_SETS_3D, inkOn } from "./style3d";

describe("the periodic table's layout", () => {
  it("gives each of the 118 elements a place of its own, inside the table, none on a series' place", () => {
    const taken = new Set<string>();
    for (const e of ELEMENTS) {
      const p = tablePlace(e.number)!;
      expect(p.row).toBeGreaterThanOrEqual(1);
      expect(p.row).toBeLessThanOrEqual(TABLE_ROWS);
      expect(p.row).not.toBe(8);
      expect(p.column).toBeGreaterThanOrEqual(1);
      expect(p.column).toBeLessThanOrEqual(TABLE_COLUMNS);
      taken.add(`${p.row}:${p.column}`);
    }
    expect(ELEMENTS).toHaveLength(118);
    expect(taken.size).toBe(118);
    for (const s of SERIES_PLACES) expect(taken.has(`${s.row}:${s.column}`)).toBe(false);
    expect(tablePlace(0)).toBeNull();
    expect(tablePlace(119)).toBeNull();
  });
  it("lays the elements out as the IUPAC's table does", () => {
    const at = (symbol: string) => tablePlace(ELEMENTS.find((e) => e.symbol === symbol)!.number);
    expect(at("H")).toEqual({ row: 1, column: 1 });
    expect(at("He")).toEqual({ row: 1, column: 18 });
    expect(at("B")).toEqual({ row: 2, column: 13 });
    expect(at("Sc")).toEqual({ row: 4, column: 3 });
    expect(at("Y")).toEqual({ row: 5, column: 3 });
    expect(at("Ba")).toEqual({ row: 6, column: 2 });
    expect(at("Hf")).toEqual({ row: 6, column: 4 });
    expect(at("Rn")).toEqual({ row: 6, column: 18 });
    expect(at("Rf")).toEqual({ row: 7, column: 4 });
    expect(at("Og")).toEqual({ row: 7, column: 18 });
    // (the series in rows of 15 below, under groups 3 to 17)
    expect(at("La")).toEqual({ row: 9, column: 3 });
    expect(at("Lu")).toEqual({ row: 9, column: 17 });
    expect(at("Ac")).toEqual({ row: 10, column: 3 });
    expect(at("Lr")).toEqual({ row: 10, column: 17 });
    // (each group a column: the halogens and the noble gases down theirs)
    expect(["F", "Cl", "Br", "I", "At", "Ts"].map((s) => at(s)!.column)).toEqual([17, 17, 17, 17, 17, 17]);
    expect(["He", "Ne", "Ar", "Kr", "Xe", "Rn", "Og"].map((s) => at(s)!.row)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("every element's colour, in every colour set", () => {
  it("gives each of the 118 elements a colour in each set", () => {
    for (const set of COLOUR_SETS_3D)
      for (const e of ELEMENTS) expect(set.colour(e.symbol), `${set.id} ${e.symbol}`).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
  it("draws 1 to 109 each in a colour of its own, and 110 to 118 in a light grey, in every set", () => {
    const jmol = COLOUR_SETS_3D.find((s) => s.id === "jmol")!;
    for (const e of ELEMENTS) {
      if (e.number <= 109) expect(e.colour, e.symbol).toMatch(/^#[0-9A-F]{6}$/);
      else for (const set of COLOUR_SETS_3D) expect(set.colour(e.symbol).toLowerCase(), `${set.id} ${e.symbol}`).toMatch(/^#([c-f][0-9a-f])\1\1$/);
    }
    expect(jmol.colour("Og").toLowerCase()).toBe("#cccccc");
  });
});

describe("the ink on a colour", () => {
  it("is black on a light colour and white on a dark one", () => {
    expect(inkOn("#ffffff")).toBe("#000000");
    expect(inkOn("#000000")).toBe("#ffffff");
    // (carbon's mid grey, hydrogen's white, nitrogen's blue, oxygen's red, as Jmol has them)
    expect(inkOn("#909090")).toBe("#000000");
    expect(inkOn("#FFFFFF")).toBe("#000000");
    expect(inkOn("#3050F8")).toBe("#ffffff");
    expect(inkOn("#FF0D0D")).toBe("#000000");
  });
});
