import { describe, expect, it } from "vitest";
import { allPages, numberText, numberedName, pagesName, pagesTyped, readingOrder } from "./make";

describe("a new PDF from pages", () => {
  it("is named for what it is made of", () => {
    expect(numberedName("paper.pdf")).toBe("paper (numbered).pdf");
    expect(numberedName("Paper.PDF")).toBe("Paper (numbered).pdf");
    const t = (page: number, turn = 0) => ({ page, turn });
    expect(pagesName("paper.pdf", [t(2), t(3), t(4)], 10)).toBe("paper (pages 3-5).pdf");
    expect(pagesName("paper.pdf", [t(1)], 10)).toBe("paper (page 2).pdf");
    // (out of order, turned, or all of them as they were rearranged: arranged)
    expect(pagesName("paper.pdf", [t(3), t(2)], 10)).toBe("paper (arranged).pdf");
    expect(pagesName("paper.pdf", [t(2, 90), t(3)], 10)).toBe("paper (arranged).pdf");
    expect(pagesName("paper.pdf", [t(0), t(1), t(2)], 3)).toBe("paper (arranged).pdf");
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
