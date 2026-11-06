import { describe, expect, it } from "vitest";
import { cardHolds, cardPlace, REST_MS, restLeft } from "./compoundCardPlace";

describe("where a compound's card stands by its word", () => {
  const view = { width: 1000, height: 800 };
  const card = { width: 240, height: 180 };
  const word = (left: number, top: number) => ({ left, top, right: left + 20, bottom: top + 12 });
  it("is over the word's line, its left edge on the word's, a little gap above the letters: over what has been read alone", () => {
    expect(cardPlace(word(100, 300), card, view)).toEqual({ left: 100, top: 116 });
  });
  it("is under the line only where over it would pass the window's top", () => {
    expect(cardPlace(word(100, 100), card, view)).toEqual({ left: 100, top: 116 });
  });
  it("stays within the window's sides", () => {
    expect(cardPlace(word(900, 300), card, view).left).toBe(752);
    expect(cardPlace(word(2, 300), card, view).left).toBe(8);
  });
});

describe("when a compound's card comes", () => {
  it("is once the pointer has rested on the number about a third of a second - not at once, not seconds later", () => {
    expect(REST_MS).toBe(350);
    expect(restLeft(1000, 1000)).toBe(350);
    expect(restLeft(1000, 1100)).toBe(250);
    expect(restLeft(1000, 1350)).toBe(0);
    expect(restLeft(1000, 5000)).toBe(0);
  });
});

describe("what a compound's card holds", () => {
  it("is its drawing once its number is placed and its structure read whole; while its PDF is still read for numbers, or its figure, says so; else nothing", () => {
    const at = (placed: boolean, read: boolean, drawn: boolean, whole: boolean) => cardHolds({ placed, read, drawn, whole });
    expect(at(true, true, true, true)).toBe("drawing");
    expect(at(true, true, true, false)).toBe("drawing");
    // (its PDF's pages still gone through: the number may be on one not yet read)
    expect(at(false, false, false, false)).toBe("reading");
    // (placed, its figure's structures still being read)
    expect(at(true, false, false, true)).toBe("reading");
    // (gone through whole and the number drawn nowhere, or its structure not read whole: no card)
    expect(at(false, false, false, true)).toBeNull();
    expect(at(true, true, false, true)).toBeNull();
    expect(at(true, true, false, false)).toBeNull();
  });
});
