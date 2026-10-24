import { describe, expect, it } from "vitest";
import { PAGE_PX, WORDS_FADE, WORDS_LEAST, wordsShown, wordsTooSmall } from "./pageScale";

/** The zoom at which a page pixel is `scale` screen pixels. */
const zoomAt = (scale: number) => scale / PAGE_PX;

describe("the words of the page's cards, sets and chips, as the page is zoomed", () => {
  it("are all shown where they read, none where they are too small, and half at the least scale they are read at", () => {
    expect(wordsShown(zoomAt(1))).toBe(1);
    expect(wordsShown(zoomAt(WORDS_LEAST * WORDS_FADE))).toBeCloseTo(1, 9);
    expect(wordsShown(zoomAt(WORDS_LEAST / WORDS_FADE))).toBeCloseTo(0, 9);
    expect(wordsShown(zoomAt(0.3))).toBe(0);
    expect(wordsShown(zoomAt(WORDS_LEAST))).toBeCloseTo(0.5, 9);
    // (too small to read - where what is pressed on them no longer is - from the middle of the fade)
    expect([wordsTooSmall(zoomAt(WORDS_LEAST * 1.01)), wordsTooSmall(zoomAt(WORDS_LEAST / 1.01))]).toEqual([false, true]);
  });

  it("fade with the zoom, never at once: notch by notch of a mouse wheel, never more than a third at a time, and only one way", () => {
    // (a notch: e^(40 px x 0.0016) times - PanZoom2D)
    const notch = Math.exp(40 * 0.0016);
    let was = wordsShown(zoomAt(0.4));
    let most = 0;
    let steps = 0;
    for (let scale = 0.4 * notch; scale < 1.5; scale *= notch) {
      const now = wordsShown(zoomAt(scale));
      expect(now).toBeGreaterThanOrEqual(was);
      most = Math.max(most, now - was);
      if (now > was) steps++;
      was = now;
    }
    expect(most).toBeLessThan(1 / 3);
    expect(steps).toBeGreaterThanOrEqual(4);
  });
});
