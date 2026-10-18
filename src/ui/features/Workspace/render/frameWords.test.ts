import { describe, expect, it } from "vitest";
import { pageScale } from "../utils/pageScale";
import { BELOW_MOST, SAYINGS, SIDE, WORDS_LEAST_PX, frameWords, lineOf, textWidth, twoLineRoom, wordsReach, wrap } from "./frameWords";

/** Frames from a dot to a large film's, as many shapes as a render's frame takes. */
const SIZES: [number, number][] = [];
for (const w of [16, 40, 80, 110, 150, 180, 200, 208, 230, 260, 320, 480, 800, 1600]) for (const h of [16, 40, 68, 90, 112, 120, 150, 240, 450, 900]) SIZES.push([w, h]);

describe("a render's frame and its words", () => {
  it("measures its words in the app's typeface: wider words wider, a longer saying longer", () => {
    expect(textWidth("Waiting", 13)).toBeGreaterThan(textWidth("finish", 13));
    expect(textWidth(SAYINGS[0], 13)).toBeGreaterThan(textWidth(SAYINGS[1], 13));
    expect(textWidth("Rendering…", 26)).toBeCloseTo(2 * textWidth("Rendering…", 13), 9);
    // ("…" as wide as three full stops)
    expect(textWidth("…", 13)).toBeCloseTo(textWidth("...", 13), 9);
  });

  it("inside a frame, sets everything a running render says in two lines at most, between margins clear of its button, tall enough", () => {
    let inside = 0;
    for (const [w, h] of SIZES) {
      const fw = frameWords(w, h);
      if (fw.place !== "inside") continue;
      inside++;
      expect(fw.px).toBeGreaterThanOrEqual(WORDS_LEAST_PX);
      // (the stop button stands 6 px in and is 24 px wide: the margin is past it)
      expect(SIDE).toBeGreaterThanOrEqual(6 + 24);
      for (const s of SAYINGS) {
        const lines = wrap(s, w - 2 * SIDE, fw.px);
        expect(lines.length).toBeLessThanOrEqual(2);
        for (const l of lines) expect(textWidth(l, fw.px)).toBeLessThanOrEqual(w - 2 * SIDE);
      }
      expect(2 * 12 + 2 * lineOf(fw.px) + 3 + 8 + 16 + 8).toBeLessThanOrEqual(h);
    }
    expect(inside).toBeGreaterThan(10);
  });

  it("below a smaller frame, in a box as wide as two lines of the longest need, or the frame: never a word a line", () => {
    let below = 0;
    for (const [w, h] of SIZES) {
      const fw = frameWords(w, h);
      if (fw.place !== "below") continue;
      below++;
      expect(fw.width).toBeLessThanOrEqual(BELOW_MOST);
      expect(fw.width).toBeGreaterThanOrEqual(Math.min(BELOW_MOST, w));
      const text = fw.width - (24 + 4 + 8);
      for (const s of SAYINGS) {
        const lines = wrap(s, text, fw.px);
        expect(lines.length).toBeLessThanOrEqual(2);
        // (a saying of three words or more never one a line)
        if (s.split(" ").length >= 3) expect(lines.some((l) => l.includes(" "))).toBe(true);
        for (const l of lines) expect(textWidth(l, fw.px)).toBeLessThanOrEqual(text + 1e-9);
      }
    }
    expect(below).toBeGreaterThan(10);
  });

  it("goes where it goes at every zoom: the frame and its words are drawn larger or smaller together", () => {
    for (const [w, h] of SIZES) {
      const fw = frameWords(w, h);
      for (const zoom of [0.25, 0.5, 1, 2, 4, 8, 16].map((k) => k / pageScale(1))) {
        const s = pageScale(zoom);
        // (on the screen: the longest saying's widest line against the frame's room, both at the zoom's scale)
        if (fw.place === "inside") {
          const widest = Math.max(...wrap(SAYINGS[0], w - 2 * SIDE, fw.px).map((l) => textWidth(l, fw.px)));
          expect(widest * s).toBeLessThanOrEqual((w - 2 * SIDE) * s + 1e-9);
        } else {
          expect(twoLineRoom(SAYINGS[0], fw.px) * s).toBeLessThanOrEqual((fw.width - 36) * s + 1e-6);
        }
      }
    }
  });

  it("keeps a running render's words where they began, whatever it says as it runs", () => {
    for (const [w, h] of SIZES) expect(frameWords(w, h).place).toBe(frameWords(w, h, SAYINGS).place);
  });

  it("sets why a render failed inside a frame that holds it in two lines, else below it, wrapped, up to the box's widest", () => {
    const short = "Blender stopped";
    expect(frameWords(400, 200, [short], true).place).toBe("inside");
    const long = "Blender stopped: the scene could not be read because a file it needs was not found in the job's folder";
    expect(frameWords(800, 450, [long], true).place).toBe("inside");
    const fw = frameWords(260, 150, [long], true);
    expect(fw.place).toBe("below");
    if (fw.place === "below") expect(fw.width).toBe(BELOW_MOST);
  });

  it("reaches past its frame by its words below it, and either side where they are wider: the view eases to that too", () => {
    expect(wordsReach(800, frameWords(800, 450))).toEqual({ below: 0, side: 0 });
    const small = frameWords(110, 68);
    const reach = wordsReach(110, small);
    expect(small.place).toBe("below");
    expect(reach.below).toBeGreaterThan(lineOf(13));
    expect(reach.side).toBeGreaterThan(0);
  });
});
