import { describe, expect, it } from "vitest";
import { ICONS_WIDEST, MENU_ICON, MENU_ICON_GAP, MENU_ICON_SPLIT, MENU_ICONS_MOST, iconLines, iconsWidth, oneLineWidth } from "./menuIconLines";

// Icons named by letters; "Del" is Delete.
const isDel = (i: string) => i === "Del";
const names = (lines: { item: string; starts: boolean }[][]) => lines.map((l) => l.map((p) => p.item));
/** The width the menu has at its least: 240 px, less its border and the icons' margins. */
const LEAST = 230;

describe("a menu's icons on as few lines as its width holds", () => {
  it("measures icons as they stand: squares, a gap between, and a wider one between kinds", () => {
    expect(iconsWidth(0)).toBe(0);
    expect(iconsWidth(1)).toBe(MENU_ICON);
    expect(iconsWidth(3, 1)).toBe(3 * MENU_ICON + 2 * MENU_ICON_GAP + MENU_ICON_SPLIT);
  });

  it("says how wide one line of them is, the gap between kinds counted only where both are there, and the widest", () => {
    expect(oneLineWidth(6, 2)).toBe(iconsWidth(8, 1));
    expect(oneLineWidth(4, 0)).toBe(iconsWidth(4));
    expect(oneLineWidth(0, 3)).toBe(iconsWidth(3));
    expect(ICONS_WIDEST).toBe(iconsWidth(MENU_ICONS_MOST, 1));
    // (past the widest, a second line)
    expect(names(iconLines(["A", "B", "C", "D", "E", "F", "G", "H", "Del"], ["Cut", "Copy"], isDel, ICONS_WIDEST))).toEqual([["A", "B", "C", "D", "E", "F", "G", "H", "Del"], ["Cut", "Copy"]]);
  });

  it("puts the thing's own and the selection's on one line where they fit, Delete at its right end", () => {
    const lines = iconLines(["Clean", "3D", "Turn", "Del"], ["Cut", "Copy"], isDel, LEAST);
    expect(names(lines)).toEqual([["Clean", "3D", "Turn", "Cut", "Copy", "Del"]]);
    // (the selection's begin after a small gap; nothing else does)
    expect(lines[0].filter((p) => p.starts).map((p) => p.item)).toEqual(["Cut"]);
  });

  it("makes a second line only where they do not fit: the selection's under the thing's, Delete kept with its own", () => {
    const own = ["A", "B", "C", "D", "E", "Del"];
    expect(iconsWidth(8, 1)).toBeGreaterThan(LEAST);
    const lines = iconLines(own, ["Cut", "Copy"], isDel, LEAST);
    expect(names(lines)).toEqual([own, ["Cut", "Copy"]]);
    expect(lines.flat().some((p) => p.starts)).toBe(false);
    // (a menu made wider by its listed items holds them on one line)
    expect(names(iconLines(own, ["Cut", "Copy"], isDel, iconsWidth(8, 1)))).toEqual([["A", "B", "C", "D", "E", "Cut", "Copy", "Del"]]);
  });

  it("never wraps the thing's own icons, however narrow: a line is as wide as they are", () => {
    const own = ["A", "B", "C", "D", "E", "F", "Del"];
    expect(names(iconLines(own, [], isDel, LEAST))).toEqual([own]);
    expect(names(iconLines(own, ["Cut", "Copy"], isDel, 0))).toEqual([own, ["Cut", "Copy"]]);
  });

  it("keeps Delete last where it is the selection's, on empty space", () => {
    const lines = iconLines(["Paste"], ["Cut", "Copy", "Clean", "3D", "Del"], isDel, LEAST);
    expect(names(lines)).toEqual([["Paste", "Cut", "Copy", "Clean", "3D", "Del"]]);
    // (Delete set first among its own is still at the right end)
    expect(names(iconLines(["Del", "A", "B"], [], isDel, LEAST))).toEqual([["A", "B", "Del"]]);
  });

  it("loses nothing and reorders nothing within its kind", () => {
    const own = ["A", "B", "C", "D", "Del"];
    const sel = ["Cut", "Copy", "X"];
    for (const room of [0, 100, LEAST, 400]) {
      const flat = iconLines(own, sel, isDel, room).flat().map((p) => p.item);
      expect([...flat].sort()).toEqual([...own, ...sel].sort());
      expect(flat.filter((i) => own.includes(i) && !isDel(i))).toEqual(["A", "B", "C", "D"]);
      expect(flat.filter((i) => sel.includes(i))).toEqual(sel);
    }
    expect(iconLines([], [], isDel, LEAST)).toEqual([]);
  });
});
