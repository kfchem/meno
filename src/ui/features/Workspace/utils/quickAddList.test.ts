import { describe, expect, it } from "vitest";
import { keyRows, openAfter, openFirst, remembersPress, rowAfter, typedIn } from "./quickAddList";

describe("Quick Add's list of calculations", () => {
  const ids = ["meno", "xtb", "orca", "procedures"];

  it("opens with who was opened last, where it is still there - Meno's own otherwise", () => {
    expect(openFirst("orca", ids)).toBe("orca");
    expect(openFirst("crest", ids)).toBe("meno");
    expect(openFirst(undefined, ids)).toBe("meno");
    expect(openFirst(3, ids)).toBe("meno");
    expect(openFirst("orca", [])).toBeUndefined();
  });

  it("opens one row at a time: a press on another opens it, a press on the one open shuts it", () => {
    expect(openAfter("meno", "orca")).toBe("orca");
    expect(openAfter("orca", "orca")).toBeUndefined();
    expect(openAfter(undefined, "xtb")).toBe("xtb");
  });

  it("remembers a row as it is opened, and not as it is shut: it stays who was opened last", () => {
    expect(remembersPress("meno", "orca")).toBe(true);
    expect(remembersPress(undefined, "orca")).toBe(true);
    expect(remembersPress("orca", "orca")).toBe(false);
  });

  it("goes down and up from row to row, stopping at either end, from the first where no row has the keys", () => {
    expect(rowAfter(4, 1, "ArrowDown")).toBe(2);
    expect(rowAfter(4, 1, "ArrowUp")).toBe(0);
    expect(rowAfter(4, 3, "ArrowDown")).toBe(3);
    expect(rowAfter(4, 0, "ArrowUp")).toBe(0);
    expect(rowAfter(4, -1, "ArrowDown")).toBe(0);
    expect(rowAfter(4, -1, "ArrowUp")).toBe(0);
    expect(rowAfter(0, -1, "ArrowDown")).toBeNull();
  });

  it("leaves the keys to a field being typed in - the SMILES field, a text area, words edited in place", () => {
    expect(typedIn({ tagName: "INPUT" })).toBe(true);
    expect(typedIn({ tagName: "TEXTAREA" })).toBe(true);
    expect(typedIn({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(typedIn({ tagName: "BUTTON", isContentEditable: false })).toBe(false);
    expect(typedIn(null)).toBe(false);
  });

  it("goes only through the rows that show and can be pressed: none in a row shut, none turned off", () => {
    const rows = [
      { id: "meno", disabled: false, shut: false },
      { id: "step in a shut row", disabled: false, shut: true },
      { id: "orca", disabled: true, shut: false },
      { id: "xtb", disabled: false, shut: false },
    ];
    expect(keyRows(rows, (r) => r.shut).map((r) => r.id)).toEqual(["meno", "xtb"]);
  });
});
