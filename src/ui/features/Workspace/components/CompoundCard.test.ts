import { readFileSync } from "node:fs";
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
  it("is the PDF's own picture of where the compound is drawn once its number is placed and its structure's box known - read whole or not; while its PDF is still read for numbers, or its figure, says so; the number drawn nowhere, says so in words", () => {
    const at = (placed: boolean, read: boolean, whole: boolean) => cardHolds({ placed, read, whole });
    expect(at(true, true, true)).toBe("picture");
    expect(at(true, true, false)).toBe("picture");
    // (its PDF's pages still gone through: the number may be on one not yet read)
    expect(at(false, false, false)).toBe("reading");
    // (placed, its figure's structures still being read)
    expect(at(true, false, true)).toBe("reading");
    expect(at(true, false, false)).toBe("reading");
    // (gone through whole and the number drawn nowhere: said so, nothing guessed)
    expect(at(false, false, true)).toBe("none");
  });

  it("never draws the structure Meno read: it is placed on the canvas to be checked there", () => {
    const source = readFileSync(new URL("./CompoundCard.tsx", import.meta.url), "utf8");
    // (no drawing of a read model - nor of any structure - in the card: only its PDF's region as a picture)
    expect(source).not.toMatch(/drawingSvg|image\/svg|aromaticRings/);
    expect(source).toContain("lensPictureOf");
  });
});
