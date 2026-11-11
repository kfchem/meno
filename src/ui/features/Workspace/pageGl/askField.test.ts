import { describe, expect, it } from "vitest";
import { ASK, askHeight, askKey, askLines, askWidth, caretOf, firstLineShown, indexOnLine, lineAtPx, selectionBoxes } from "./askField";
import { textWidth } from "./texts";

const w = (t: string) => textWidth(t, ASK.size);

describe("what a key does in the ask field", () => {
  it("asks on Enter, starts a line on Shift+Enter, and leaves an Enter an input method takes to it - however it says so", () => {
    expect(askKey({ key: "Enter" })).toBe("ask");
    expect(askKey({ key: "Enter", shiftKey: true })).toBe("newline");
    expect(askKey({ key: "Enter", isComposing: true })).toBe("none");
    // (WebKit's composing Enter: keyCode 229, isComposing not yet set)
    expect(askKey({ key: "Enter", keyCode: 229 })).toBe("none");
    expect(askKey({ key: "Enter", isComposing: true, shiftKey: true })).toBe("none");
  });

  it("leaves every other key, and Enter with Ctrl, Alt or Meta, to the field's text", () => {
    for (const e of [{ key: "a" }, { key: "Tab" }, { key: "ArrowDown" }, { key: "Enter", ctrlKey: true }, { key: "Enter", altKey: true }, { key: "Enter", metaKey: true }]) expect(askKey(e)).toBe("none");
  });
});

describe("what is typed in lines", () => {
  it("is one empty line where nothing is typed, one line where it fits, and a line to each newline", () => {
    expect(askLines("", 400)).toEqual([{ from: 0, to: 0, width: 0 }]);
    expect(askLines("alpha beta", 400)).toEqual([{ from: 0, to: 10, width: w("alpha beta") }]);
    expect(askLines("ab\n\ncd", 400).map((l) => [l.from, l.to])).toEqual([[0, 2], [3, 3], [4, 6]]);
    expect(askLines("ab\n", 400).map((l) => [l.from, l.to])).toEqual([[0, 2], [3, 3]]);
  });

  it("breaks where the words run out - after the last space that fits - the break's spaces kept on the line before, each line saying where it lies", () => {
    const room = w("alpha beta") + 1;
    const lines = askLines("alpha beta gamma", room);
    expect(lines.map((l) => [l.from, l.to])).toEqual([[0, 11], [11, 16]]);
    expect(lines[0].width).toBeCloseTo(w("alpha beta"), 9);
    // (no letter lost: the lines run on from one another)
    expect(askLines("alpha beta gamma delta", room).map((l) => "alpha beta gamma delta".slice(l.from, l.to)).join("")).toBe("alpha beta gamma delta");
  });

  it("breaks a word wider than a line where it runs out", () => {
    const lines = askLines("x".repeat(30), w("x".repeat(10)) + 0.01);
    expect(lines.map((l) => [l.from, l.to])).toEqual([[0, 10], [10, 20], [20, 30]]);
  });

  it("breaks after a hyphen inside a word, as the page's words do - and keeps a minus with its figure", () => {
    const room = w("GFN2-") + 1;
    expect(askLines("GFN2-xTB", room).map((l) => [l.from, l.to])).toEqual([[0, 5], [5, 8]]);
  });
});

describe("a place in what is typed", () => {
  const value = "alpha beta gamma\nzz";
  const lines = askLines(value, w("alpha beta") + 1);

  it("is on the line it lies in - at a break, the line after it begins on - and how far into it, in page px", () => {
    expect(lines.map((l) => [l.from, l.to])).toEqual([[0, 11], [11, 16], [17, 19]]);
    expect(caretOf(value, lines, 0)).toEqual({ line: 0, x: 0 });
    expect(caretOf(value, lines, 5).line).toBe(0);
    expect(caretOf(value, lines, 5).x).toBeCloseTo(w("alpha"), 9);
    // (at the break between "beta " and "gamma": the start of the second line)
    expect(caretOf(value, lines, 11)).toEqual({ line: 1, x: 0 });
    // (the end of a line that a newline ends: its own end, not the next line's start)
    expect(caretOf(value, lines, 16).line).toBe(1);
    expect(caretOf(value, lines, 17)).toEqual({ line: 2, x: 0 });
    expect(caretOf(value, lines, 19).line).toBe(2);
    expect(caretOf(value, lines, 999).line).toBe(2);
  });

  it("is found from a point on a line: the nearest place between letters, never past the line's words", () => {
    expect(indexOnLine(value, lines, 0, -5)).toBe(0);
    expect(indexOnLine(value, lines, 0, w("alpha") + 0.01)).toBe(5);
    expect(indexOnLine(value, lines, 0, 1e6)).toBe(10);
    expect(indexOnLine(value, lines, 1, 0)).toBe(11);
    expect(indexOnLine(value, lines, 1, 1e6)).toBe(16);
    expect(indexOnLine(value, lines, 2, 1e6)).toBe(19);
    expect(indexOnLine(value, lines, 9, 0)).toBe(17);
  });

  it("is on the line a point below the top of the first line shown falls on, 19 px each, clamped", () => {
    expect([lineAtPx(lines, 0, 0), lineAtPx(lines, 0, 18.9), lineAtPx(lines, 0, 19), lineAtPx(lines, 1, 0), lineAtPx(lines, 0, 1e6), lineAtPx(lines, 0, -40)]).toEqual([0, 0, 1, 1, 2, 0]);
  });
});

describe("what is selected, as boxes", () => {
  const value = "alpha beta gamma\nzz";
  const lines = askLines(value, w("alpha beta") + 1);

  it("is none where nothing is, a box on a line where it stays on one, a box on each line it crosses", () => {
    expect(selectionBoxes(value, lines, 3, 3)).toEqual([]);
    const one = selectionBoxes(value, lines, 2, 5);
    expect(one).toHaveLength(1);
    expect([one[0].line, one[0].x0, one[0].x1]).toEqual([0, w("al"), w("alpha")]);
    // (from 7 to 13: "ta " on the first line, "ga" on the second)
    const two = selectionBoxes(value, lines, 13, 7);
    expect(two.map((b) => b.line)).toEqual([0, 1]);
    expect(two[1].x0).toBe(0);
    expect(two[1].x1).toBeCloseTo(w("ga"), 9);
  });

  it("takes a newline in it a little past the words of its line", () => {
    const b = selectionBoxes(value, lines, 14, 18);
    expect(b.map((x) => x.line)).toEqual([1, 2]);
    // ("ma" of gamma and its newline: from after "gam" to the end of "gamma" and 0.4 of the size more; then "zz" up to the selection's end, "z" in)
    expect([b[0].x0, b[0].x1]).toEqual([w("gam"), w("gamma") + ASK.size * 0.4]);
    expect([b[1].x0, b[1].x1]).toEqual([0, w("z")]);
  });
});

describe("how tall the field is", () => {
  it("is at least the card's 44, then 8 for each room round it, 8 inside, and 19 a line - to four lines, then scrolled", () => {
    expect([1, 2, 3, 4, 5, 20].map(askHeight)).toEqual([44, 62, 81, 100, 100, 100]);
    expect(askHeight(0)).toBe(44);
  });

  it("keeps the caret's line in view past four lines, from where it stood", () => {
    expect([firstLineShown(3, 2, 0), firstLineShown(4, 3, 0)]).toEqual([0, 0]);
    // (6 lines, 4 shown: the caret on line 5 - the last - shows lines 2 to 5; back on line 1 - above the first shown - from 1)
    expect([firstLineShown(6, 5, 0), firstLineShown(6, 3, 0), firstLineShown(6, 4, 0), firstLineShown(6, 1, 2), firstLineShown(6, 3, 2)]).toEqual([2, 0, 1, 1, 2]);
    expect(firstLineShown(6, 0, 5)).toBe(0);
  });

  it("gives its words the card's width less its room - and Stop's where the model works", () => {
    expect(askWidth(432)).toBe(432 - 16 - 20);
    expect(askWidth(432, 40)).toBe(432 - 16 - 20 - 40 - 8);
    expect(askWidth(10)).toBe(1);
  });
});
