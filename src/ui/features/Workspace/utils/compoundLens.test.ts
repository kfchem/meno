import { describe, expect, it, vi } from "vitest";
import { pageTextFrom } from "../../../../lib/pdf/text";
import { boxOnSheet, indexOnce, mentionUnder } from "./compoundLens";

const indexPdf = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("./compoundIndex", () => ({ indexPdf }));
vi.mock("./pdfStructures", () => ({ pdfPageLabels: () => () => Promise.resolve([]) }));

/** A line of words, each letter 6 points wide from x = 72, 12 points tall from y = 100; the words in `bold` set bold. */
function line(text: string, bold: string[] = []) {
  const chars = [...text];
  const marks = chars.map(() => false);
  for (const w of bold) {
    const at = text.indexOf(w);
    for (let k = at; k < at + w.length; k++) marks[k] = true;
  }
  return pageTextFrom(text, chars.map((c, k) => (c === " " ? null : ([72 + 6 * k, 100, 78 + 6 * k, 112] as const))), marks);
}

describe("the compound-number lens's reading of a page, the same in the column and on the canvas", () => {
  it("gives the number under a point, and its word's box on the page", () => {
    const text = "Ketone 12 gave 13a in 2 h.";
    const t = line(text, ["12", "13a"]);
    // (the 1 of "12": letters 7 and 8, x 114 to 126)
    expect(mentionUnder(t, 117, 106, false)).toEqual({ label: "12", box: [114, 100, 126, 112] });
    expect(mentionUnder(t, 72 + 6 * 16 + 3, 106, false)?.label).toBe("13a");
  });

  it("gives none off a number, or on a number no compound's, unless ⌥ is held: then any of that shape", () => {
    const text = "Ketone 12 gave 13a in 2 h.";
    const t = line(text, ["12", "13a"]);
    expect(mentionUnder(t, 75, 106, false)).toBeNull();
    const two = 72 + 6 * text.indexOf("2 h") + 3;
    expect(mentionUnder(t, two, 106, false)).toBeNull();
    expect(mentionUnder(t, two, 106, true)?.label).toBe("2");
  });
});

describe("the lens's index and its word on the page", () => {
  it("reads a PDF's numbers through once, however often the pointer moves over it", () => {
    indexOnce("a".repeat(64), 3);
    indexOnce("a".repeat(64), 3);
    indexOnce("b".repeat(64), 2);
    expect(indexPdf).toHaveBeenCalledTimes(2);
  });

  it("never takes a number across a line's end: a mention is one word, and a word stops there - so its box is its one line's", () => {
    // ("compound 1" at a line's end, "2 was" on the next: the 1 is the number, not "12")
    const text = "compound 1\n2 was";
    const chars = [...text];
    const boxes = chars.map((c, k) => (c === " " || c === "\n" ? null : k < 10 ? ([72 + 6 * k, 100, 78 + 6 * k, 112] as const) : ([72 + 6 * (k - 11), 114, 78 + 6 * (k - 11), 126] as const)));
    const t = pageTextFrom(text, boxes, chars.map(() => false));
    expect(mentionUnder(t, 72 + 6 * 9 + 3, 106, false)).toEqual({ label: "1", box: [126, 100, 132, 112] });
  });

  it("sets a box on a page on the canvas: from the sheet's top left, y up", () => {
    expect(boxOnSheet([10, 20, 30, 25], { x: 100, y: 50, w: 612, h: 792 }, 0.5)).toEqual({ x0: 100 - 306 + 5, y0: 50 + 396 - 10, x1: 100 - 306 + 15, y1: 50 + 396 - 12.5 });
  });
});
