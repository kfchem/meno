import { describe, expect, it } from "vitest";
import { chipShiftOf, chipWidthOf } from "./chipWidth";
import { GROW_MS, OPENED, openingAfter, SHOW_MS, SHUT, type Opening } from "../../../theme/opening";

// (a set of seven: its slider 196 px, what it says 110, its details 150 - each with the chip's 10 px either side where it is the chip's)
const SHUT_W = 110 + 20;
const OPEN_W = 196 + 20;
const DETAILS_W = 150;
const width = (read: Opening, made: Opening = SHUT, madeW = 0) =>
  chipWidthOf({ shut: SHUT_W, open: OPEN_W, details: DETAILS_W, made: madeW, grown: read.grown, madeGrown: made.grown });

describe("a frames chip's width", () => {
  it("is what it says, shut; the widest of what it opens to, opened", () => {
    expect(width(SHUT)).toBe(SHUT_W);
    expect(width(OPENED)).toBe(OPEN_W);
    // (details wider than its bars: as wide as they are)
    expect(chipWidthOf({ shut: SHUT_W, open: OPEN_W, details: 260, made: 0, grown: 1, madeGrown: 0 })).toBe(260);
    // (a single geometry: no bars to open to)
    expect(chipWidthOf({ shut: 180, open: 0, details: 150, made: 0, grown: 1, madeGrown: 0 })).toBe(180);
  });

  it("shutting, holds its width while its lines go, and only then narrows - frame by frame", () => {
    let read = OPENED;
    const frames: { ms: number; w: number; shown: number }[] = [];
    for (let k = 1; k <= Math.ceil(((SHOW_MS + GROW_MS) * 60) / 1000); k++) {
      const ms = (k * 1000) / 60;
      read = openingAfter(read, false, 1000 / 60);
      frames.push({ ms, w: width(read), shown: read.shown });
    }
    // (at 20 and 40 ms, and all the while its lines are still seen: as wide as it was)
    expect(frames.filter((f) => f.shown > 0).every((f) => f.w === OPEN_W)).toBe(true);
    expect(frames.filter((f) => f.ms <= SHOW_MS).every((f) => f.w === OPEN_W)).toBe(true);
    // (then narrower each frame, to what it says)
    const after = frames.filter((f) => f.shown === 0);
    expect(after.every((f, k) => k === 0 || f.w <= after[k - 1].w)).toBe(true);
    expect(after[after.length - 1].w).toBe(SHUT_W);
  });

  it("opening, is at its width before its lines come in", () => {
    let read = SHUT;
    for (let ms = 0; ms < GROW_MS + SHOW_MS; ms += 1000 / 60) {
      read = openingAfter(read, true, 1000 / 60);
      if (read.shown > 0) expect(width(read)).toBe(OPEN_W);
    }
  });

  it("widens for how it was made with its rows, and holds that width while they go", () => {
    const MADE_W = 300;
    let made = SHUT;
    for (let ms = 0; ms < GROW_MS + SHOW_MS; ms += 1000 / 60) {
      made = openingAfter(made, true, 1000 / 60);
      if (made.shown > 0) expect(width(OPENED, made, MADE_W)).toBe(MADE_W);
    }
    for (let ms = 0; ms < SHOW_MS + GROW_MS; ms += 1000 / 60) {
      made = openingAfter(made, false, 1000 / 60);
      if (made.shown > 0) expect(width(OPENED, made, MADE_W)).toBe(MADE_W);
    }
    expect(width(OPENED, made, MADE_W)).toBe(OPEN_W);
  });

  it("widens to the right only as how it was made opens, and back: its left edge, and the toggle there, never move", () => {
    const MADE_W = 300;
    const at = (made: Opening) => ({ shut: SHUT_W, open: OPEN_W, details: DETAILS_W, made: MADE_W, grown: 1, madeGrown: made.grown });
    // (its left edge from where it is centred: half its width to the left, and as far back as it is drawn to the right)
    const left = (made: Opening) => chipShiftOf(at(made)) - chipWidthOf(at(made)) / 2;
    expect(chipShiftOf(at(SHUT))).toBe(0);
    expect(chipShiftOf(at(OPENED))).toBe((MADE_W - OPEN_W) / 2);
    let made: Opening = SHUT;
    for (const [open, ms] of [[true, GROW_MS + SHOW_MS], [false, 60], [true, 40], [false, SHOW_MS + GROW_MS]] as const) {
      for (let t = 0; t < ms; t += 1000 / 60) {
        made = openingAfter(made, open, 1000 / 60);
        expect(left(made)).toBeCloseTo(-OPEN_W / 2, 9);
      }
    }
    expect(chipShiftOf(at(made))).toBe(0);
  });
});
