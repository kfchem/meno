import { describe, expect, it } from "vitest";
import { PAGE_PX, standInShown, WORDS_FADE, WORDS_LEAST, wordsShown, wordsTooSmall } from "./pageScale";

/** The zoom at which a page pixel is `scale` screen pixels. */
const zoomAt = (scale: number) => scale / PAGE_PX;

describe("the words of the page's cards, sets and chips, as the page is zoomed", () => {
  it("are all shown where they read, gone at the least scale they are read at; what stands for them in only after, all at the band's foot", () => {
    expect(wordsShown(zoomAt(1))).toBe(1);
    expect(wordsShown(zoomAt(WORDS_LEAST * WORDS_FADE))).toBeCloseTo(1, 9);
    expect(wordsShown(zoomAt(WORDS_LEAST * Math.sqrt(WORDS_FADE)))).toBeCloseTo(0.5, 9);
    expect(wordsShown(zoomAt(WORDS_LEAST))).toBeCloseTo(0, 9);
    expect(wordsShown(zoomAt(0.3))).toBe(0);
    expect(standInShown(zoomAt(1))).toBe(0);
    expect(standInShown(zoomAt(WORDS_LEAST))).toBeCloseTo(0, 9);
    expect(standInShown(zoomAt(WORDS_LEAST / Math.sqrt(WORDS_FADE)))).toBeCloseTo(0.5, 9);
    expect(standInShown(zoomAt(WORDS_LEAST / WORDS_FADE))).toBeCloseTo(1, 9);
    // (too small to read - where what is pressed on them no longer is - where they are gone)
    expect([wordsTooSmall(zoomAt(WORDS_LEAST * 1.01)), wordsTooSmall(zoomAt(WORDS_LEAST / 1.01))]).toEqual([false, true]);
  });

  it("are never seen both at once with what stands for them, at any zoom", () => {
    for (let scale = 0.4; scale < 1.5; scale *= 1.01) expect(Math.min(wordsShown(zoomAt(scale)), standInShown(zoomAt(scale)))).toBeLessThan(1e-9);
  });

  it("fade with the zoom, never at once: notch by notch of a mouse wheel, never more than half at a time, and only one way", () => {
    // (a notch: e^(40 px x 0.0016) times - PanZoom2D)
    const notch = Math.exp(40 * 0.0016);
    // (each half of the band ln 1.15 wide, a notch ln 1.066: 0.46 of either at most)
    for (const [shown, way] of [[wordsShown, 1], [standInShown, -1]] as const) {
      let was = shown(zoomAt(0.4));
      let most = 0;
      let steps = 0;
      for (let scale = 0.4 * notch; scale < 1.5; scale *= notch) {
        const now = shown(zoomAt(scale));
        expect((now - was) * way).toBeGreaterThanOrEqual(0);
        most = Math.max(most, Math.abs(now - was));
        if (now !== was) steps++;
        was = now;
      }
      expect(most).toBeLessThan(0.5);
      expect(steps).toBeGreaterThanOrEqual(2);
    }
  });
});
