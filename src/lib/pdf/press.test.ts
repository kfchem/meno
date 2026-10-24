import { describe, expect, it } from "vitest";
import { pressOn } from "./press";
import { pageTextFrom, type PageText } from "./text";

/** Lines of letters 6 points wide and 12 tall, each at its own x and y: a page as PDFium reads it. */
function lines(given: [string, number, number][]): PageText {
  let text = "";
  const boxes: ([number, number, number, number] | null)[] = [];
  for (const [line, x, y] of given) {
    [...line].forEach((ch, k) => {
      text += ch;
      boxes.push(ch === " " ? null : [x + k * 6, y, x + 6 + k * 6, y + 12]);
    });
    text += "\r\n";
    boxes.push(null, null);
  }
  return pageTextFrom(text, boxes);
}

describe("a press on a PDF's page", () => {
  // (a table of coordinates as a supporting information sets it: rows 6.5 points apart)
  const table = lines([
    ["C    0.000000   -0.420000    0.000000", 60, 100],
    ["C    1.270000    0.420000    0.000000", 60, 118.5],
  ]);

  it("in the white between two rows of a table selects words - never draws a box", () => {
    expect(pressOn(table, null, 90, 115.25)).toMatchObject({ begins: "words" });
  });

  it("in the gap between a row's numbers selects words", () => {
    expect(pressOn(table, null, 60 + 6 * 2 + 3, 106)).toMatchObject({ begins: "words" });
  });

  it("on a table whose rules made it a figure still selects words: its rows are lines of text", () => {
    expect(pressOn(table, [50, 90, 300, 140], 90, 115.25)).toMatchObject({ begins: "words" });
  });

  it("on a figure's label draws the figure's box, as before", () => {
    const label = lines([["OMe", 200, 300]]);
    expect(pressOn(label, [150, 250, 300, 380], 206, 306)).toEqual({ begins: "box" });
  });

  it("where there are no words draws a box", () => {
    expect(pressOn(table, null, 60, 30)).toEqual({ begins: "box" });
    expect(pressOn(null, null, 60, 30)).toEqual({ begins: "box" });
  });
});
