import { describe, expect, it } from "vitest";
import { cardPlace } from "./compoundCardPlace";

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
