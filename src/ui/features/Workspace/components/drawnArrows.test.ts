import { describe, expect, it } from "vitest";
import { ARROW_PAST_WORDS, captionSet } from "../../../../lib/chem/captions";
import { ACS_LABEL_SET } from "../../../../lib/chem/layout2d";
import type { Caption } from "../store/types";
import { arrowsBeside, drawnArrows, wordsKeptBy } from "./drawnArrows";

const fs = 10;
const arrows = [{ id: 1, x: 0, y: 0, angle: 0, length: 40 }];
const long = "Pd(PPh3)4, K2CO3, dioxane, 100 °C";
const captions: Caption[] = [{ id: 7, x: 0, y: 8, text: long, arrow: 1 }];
const need = (text: string) => 2 * (captionSet(text, 0, 0, fs, ACS_LABEL_SET).halfW + ARROW_PAST_WORDS * fs);

describe("the arrows as they are drawn", () => {
  it("are as long as their kept words need", () => {
    expect(drawnArrows({ arrows, captions, wordsWriting: null }, null, { fontPx: fs }, ACS_LABEL_SET)[0].length).toBeCloseTo(need(long), 6);
  });

  it("follow the words being written in place of their caption's own", () => {
    const wordsWriting = { arrow: 1, x: 0, y: 8, halfW: 5, halfH: 5, n: 1 };
    expect(drawnArrows({ arrows, captions, wordsWriting }, 7, { fontPx: fs }, ACS_LABEL_SET)[0].length).toBe(40);
  });

  it("take new words being written besides those kept", () => {
    const wordsWriting = { arrow: 1, x: 0, y: -8, halfW: 120, halfH: 5, n: 2 };
    expect(drawnArrows({ arrows, captions, wordsWriting }, null, { fontPx: fs }, ACS_LABEL_SET)[0].length).toBeCloseTo(2 * (120 + ARROW_PAST_WORDS * fs), 6);
  });

  it("are placed among without the words being put down", () => {
    expect(arrowsBeside({ arrows, captions }, { fontPx: fs }, ACS_LABEL_SET, 7)[0].length).toBe(40);
    expect(arrowsBeside({ arrows, captions }, { fontPx: fs }, ACS_LABEL_SET)[0].length).toBeCloseTo(need(long), 6);
  });
});

describe("an arrow put down by itself", () => {
  it("keeps its words that are within its reach where it is put - along it, within its length; across it, within two and a half ems - and lets go of the rest", () => {
    const words: Caption[] = [
      { id: 7, x: 0, y: 8, text: "Pd(PPh3)4" },
      { id: 8, x: 15, y: -20, text: "K2CO3" },
      { id: 9, x: 0, y: 60, text: "dioxane" },
      { id: 10, x: 30, y: 8, text: "100 °C" },
    ];
    const kept = wordsKeptBy({ arrows, captions: words }, 1, [7, 8, 9, 10], { fontPx: fs }, ACS_LABEL_SET);
    // (8 and 7 within its reach, above and below; 9 too far across; 10 past its end, 20 along a line 40 long)
    expect([...kept]).toEqual([
      [7, 1],
      [8, 1],
      [9, null],
      [10, null],
    ]);
    // (no such arrow, or no such words: none kept)
    expect([...wordsKeptBy({ arrows, captions: words }, 2, [7], { fontPx: fs }, ACS_LABEL_SET)]).toEqual([[7, null]]);
    expect([...wordsKeptBy({ arrows, captions: words }, 1, [99], { fontPx: fs }, ACS_LABEL_SET)]).toEqual([[99, null]]);
  });
});
