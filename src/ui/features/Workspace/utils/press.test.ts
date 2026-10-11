import { describe, expect, it } from "vitest";
import { MOV_PX } from "../constants";
import { chordedPress, endsDrag, movePress, startPress } from "./press";

describe("press", () => {
  it("is a click when the button comes up where it went down", () => {
    const p = startPress(100, 100);
    expect(endsDrag(p, 100, 100)).toBe(false);
    expect(endsDrag(movePress(p, 102, 101), 101, 100)).toBe(false);
  });

  it("ends a drag when it comes up away from where it went down", () => {
    expect(endsDrag(startPress(100, 100), 100 + MOV_PX, 100)).toBe(true);
  });

  it("ends a drag that came back to where it began", () => {
    // a chain dragged out of an atom and brought back onto it
    let p = startPress(100, 100);
    p = movePress(p, 180, 60);
    p = movePress(p, 100, 100);
    expect(p.travelled).toBe(true);
    expect(endsDrag(p, 100, 100)).toBe(true);
  });

  it("is a click when no press was seen", () => {
    expect(endsDrag(null, 500, 500)).toBe(false);
  });
});

describe("a right press", () => {
  it("in the middle of a drag - the primary button held - is chorded, and opens no menu", () => {
    // (the menu's event, or the move the press came as, with both buttons held)
    expect(chordedPress(3, 1)).toBe(true);
    expect(chordedPress(2, 3)).toBe(true);
    // a right-click of its own; a Ctrl-click on a Mac, the primary button alone
    expect(chordedPress(2, 2)).toBe(false);
    expect(chordedPress(1, 1)).toBe(false);
    expect(chordedPress(0, 0)).toBe(false);
  });
});
