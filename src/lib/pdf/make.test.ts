import { describe, expect, it } from "vitest";
import { allPages, clickedPages, numberText, numberedName, pagesName, pagesTyped, readingOrder, shownUnbroken, unusedName } from "./make";

describe("a new PDF from pages", () => {
  it("is named for what it is made of", () => {
    // (its first page's number in its name: which way it was numbered)
    expect(numberedName("paper.pdf", { prefix: "", start: 1, at: "centre" })).toBe("paper (numbered 1).pdf");
    expect(numberedName("Paper.PDF", { prefix: "S", start: 1, at: "right" })).toBe("Paper (numbered S1).pdf");
    expect(numberedName("paper.pdf", { prefix: "", start: 12, at: "left" })).toBe("paper (numbered 12).pdf");
    const t = (page: number, turn = 0) => ({ page, turn });
    // (a run with an en dash)
    expect(pagesName("paper.pdf", [t(2), t(3), t(4)], 10)).toBe("paper (pages 3\u20135).pdf");
    expect(pagesName("paper.pdf", [t(1)], 10)).toBe("paper (page 2).pdf");
    // (out of order, turned, or all of them as they were rearranged: arranged)
    expect(pagesName("paper.pdf", [t(3), t(2)], 10)).toBe("paper (arranged).pdf");
    expect(pagesName("paper.pdf", [t(2, 90), t(3)], 10)).toBe("paper (arranged).pdf");
    expect(pagesName("paper.pdf", [t(0), t(1), t(2)], 3)).toBe("paper (arranged).pdf");
  });

  it("is named as no PDF on the page is: the same made again counted on", () => {
    expect(unusedName("paper (numbered S1).pdf", ["paper.pdf"])).toBe("paper (numbered S1).pdf");
    expect(unusedName("paper (numbered S1).pdf", ["paper (numbered S1).pdf"])).toBe("paper (numbered S1) 2.pdf");
    expect(unusedName("Combined.pdf", ["Combined.pdf", "Combined 2.pdf"])).toBe("Combined 3.pdf");
  });

  it("shows its name with the part in brackets kept on one line, the name itself as it was", () => {
    // (troika-three-text breaks a line after a space, a hyphen or an en dash - not after U+00A0 or U+2011)
    expect(shownUnbroken("paper (pages 3\u20135).pdf")).toBe("paper (pages\u00a03\u20115).pdf");
    expect(shownUnbroken("my paper (numbered S1) 2.pdf")).toBe("my paper (numbered\u00a0S1) 2.pdf");
    expect(shownUnbroken("a-b c.pdf")).toBe("a-b c.pdf");
    // (only the last bracketed part: an earlier one as it was)
    expect(shownUnbroken("x (a b) y (c d).pdf")).toBe("x (a b) y (c\u00a0d).pdf");
  });

  it("selects pages as a click asks: alone, a run with Shift, one added or taken away with Ctrl or Cmd", () => {
    const order = [4, 0, 1, 2, 3];
    // (a plain click: that page alone, whatever was selected)
    expect([...clickedPages(new Set([0, 1]), order, 0, 2, {}).selected]).toEqual([2]);
    // (Shift: the run, in the order shown, from the page clicked last - which stays the anchor)
    const run = clickedPages(new Set([0]), order, 4, 1, { shift: true });
    expect([...run.selected]).toEqual([4, 0, 1]);
    expect(run.anchor).toBe(4);
    expect([...clickedPages(run.selected, order, run.anchor, 2, { shift: true }).selected]).toEqual([4, 0, 1, 2]);
    // (Ctrl or Cmd: one added, or taken away)
    expect([...clickedPages(new Set([0]), order, 0, 3, { toggle: true }).selected].sort()).toEqual([0, 3]);
    expect([...clickedPages(new Set([0, 3]), order, 3, 3, { toggle: true }).selected]).toEqual([0]);
    // (Shift with no page clicked before: that page alone)
    expect([...clickedPages(new Set(), order, null, 1, { shift: true }).selected]).toEqual([1]);
  });

  it("numbers its pages from the number chosen, as supporting information is where asked", () => {
    expect(numberText({ prefix: "S", start: 1, at: "centre" }, 0)).toBe("S1");
    expect(numberText({ prefix: "", start: 12, at: "right" }, 3)).toBe("15");
  });

  it("takes several PDFs in the order they are read on the page: rows top to bottom, each left to right", () => {
    // (y up: the higher first)
    const at = (name: string, x: number, y: number) => ({ name, x, y });
    const order = readingOrder([at("c", 0, 0), at("b", 20, 100), at("a", 0, 102), at("d", 30, 1)], 10).map((p) => p.name);
    expect(order).toEqual(["a", "b", "c", "d"]);
  });

  it("reads pages typed as people type them, counted from one", () => {
    expect(pagesTyped("3-5", 10)).toEqual([2, 3, 4]);
    expect(pagesTyped("1, 4, 7–9", 10)).toEqual([0, 3, 6, 7, 8]);
    expect(pagesTyped("5-3", 10)).toEqual([4, 3, 2]);
    expect(pagesTyped("2, 2", 10)).toEqual([1]);
    expect(pagesTyped("0", 10)).toBeNull();
    expect(pagesTyped("11", 10)).toBeNull();
    expect(pagesTyped("a-b", 10)).toBeNull();
    expect(pagesTyped("", 10)).toBeNull();
  });

  it("takes every page of a PDF, in order, unturned", () => {
    expect(allPages({ sha256: "s", pages: [[1, 1], [1, 1]] })).toEqual([
      { sha: "s", page: 0, turn: 0 },
      { sha: "s", page: 1, turn: 0 },
    ]);
  });
});
