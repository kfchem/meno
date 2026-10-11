import { describe, expect, it } from "vitest";
import { categoryRows, readCif } from "./cif";

describe("a CIF, read as the CIF 1.1 syntax lays it out", () => {
  it("reads blocks, items and tables - data names in any case, values as written", () => {
    const [block] = readCif(["#\\#CIF_1.1", "data_Foo", "_Cell.Length_A  5.959(1)", "loop_", "_atom.label", "_atom.x", "C1 0.5", "C2 .", ""].join("\n"));
    expect(block.name).toBe("Foo");
    expect(block.items.get("_cell.length_a")).toBe("5.959(1)");
    expect(block.loops).toEqual([{ tags: ["_atom.label", "_atom.x"], rows: [["C1", "0.5"], ["C2", null]] }]);
    expect(categoryRows(block, "_atom")).toEqual([
      { label: "C1", x: "0.5" },
      { label: "C2", x: null },
    ]);
    expect(categoryRows(block, "_cell")).toEqual([{ length_a: "5.959(1)" }]);
  });

  it("closes a quoted string only at its quote followed by white space (15)", () => {
    const [block] = readCif("data_q\n_example  'a dog's life'\n_other \"C1'\"\n_dot '.'\n_unknown ?\n");
    expect(block.items.get("_example")).toBe("a dog's life");
    expect(block.items.get("_other")).toBe("C1'");
    // (a quoted . is the string; unquoted, it is inapplicable: 57)
    expect(block.items.get("_dot")).toBe(".");
    expect(block.items.get("_unknown")).toBeNull();
  });

  it("reads a text field from a semicolon at a line's start to the next, the last end of line left out (17, 20)", () => {
    const [block] = readCif("data_t\n_a\n;foo\n;\n_b\n; foo\n  bar\n;\n_c x;y\n");
    expect(block.items.get("_a")).toBe("foo");
    expect(block.items.get("_b")).toBe(" foo\n  bar");
    // (a semicolon not at a line's start is an ordinary character)
    expect(block.items.get("_c")).toBe("x;y");
  });

  it("leaves out comments - only after white space - and reads any end of line (21, 42)", () => {
    const [block] = readCif("data_c\r\n_a C#1 # a comment\r_b 2\n");
    expect(block.items.get("_a")).toBe("C#1");
    expect(block.items.get("_b")).toBe("2");
  });

  it("refuses what the syntax does not allow", () => {
    expect(() => readCif("data_x\nloop_\n_a.b\n_a.c\n1 2 3\n")).toThrow(/cut short/);
    expect(() => readCif("data_x\n_a 'not closed\n")).toThrow(/not closed/);
    expect(() => readCif("data_x\n_a\n;never closed\n")).toThrow(/not closed/);
    expect(() => readCif("data_x\nsave_frame\n_a 1\nsave_\n")).toThrow(/dictionaries/);
    expect(() => readCif("data_x\n_a [1]\n")).toThrow(/bracket|\[/);
    expect(() => readCif("_a 1\n")).toThrow(/first data block/);
  });
});
