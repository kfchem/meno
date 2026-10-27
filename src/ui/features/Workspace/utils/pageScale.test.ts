import { describe, expect, it } from "vitest";
import { PAGE_PX, standInShown, WORDS_FADE, WORDS_LEAST, wordsShown, wordsTooSmall } from "./pageScale";

/** The zoom at which a page pixel is `scale` screen pixels. */
const zoomAt = (scale: number) => scale / PAGE_PX;
/** How much is seen of the two laid one over the other: what either covers. */
const together = (words: number, standIn: number) => 1 - (1 - words) * (1 - standIn);

describe("the words of the page's cards, sets and chips, as the page is zoomed", () => {
  it("are all shown where they read and gone at the band's foot; what stands for them comes in over the same band", () => {
    expect(wordsShown(zoomAt(1))).toBe(1);
    expect(wordsShown(zoomAt(WORDS_LEAST * WORDS_FADE))).toBeCloseTo(1, 9);
    expect(wordsShown(zoomAt(WORDS_LEAST))).toBeCloseTo(Math.SQRT1_2, 9);
    expect(wordsShown(zoomAt(WORDS_LEAST / WORDS_FADE))).toBeCloseTo(0, 9);
    expect(wordsShown(zoomAt(0.3))).toBeCloseTo(0, 9);
    expect(standInShown(zoomAt(1))).toBe(0);
    expect(standInShown(zoomAt(WORDS_LEAST * WORDS_FADE))).toBeCloseTo(0, 9);
    expect(standInShown(zoomAt(WORDS_LEAST))).toBeCloseTo(Math.SQRT1_2, 9);
    expect(standInShown(zoomAt(WORDS_LEAST / WORDS_FADE))).toBeCloseTo(1, 9);
    // (too small to read - where what is pressed on them no longer is - at the band's middle)
    expect([wordsTooSmall(zoomAt(WORDS_LEAST * 1.01)), wordsTooSmall(zoomAt(WORDS_LEAST / 1.01))]).toEqual([false, true]);
  });

  it("with what stands for them, never leave a card all but empty: together never less than 0.9 at any zoom", () => {
    let least = 1;
    let where = 0;
    for (let scale = 0.4; scale < 1.5; scale *= 1.001) {
      const t = together(wordsShown(zoomAt(scale)), standInShown(zoomAt(scale)));
      if (t < least) [least, where] = [t, scale];
      // (a power-keeping cross-fade: the squares of the two always one)
      expect(wordsShown(zoomAt(scale)) ** 2 + standInShown(zoomAt(scale)) ** 2).toBeCloseTo(1, 9);
    }
    expect(least).toBeGreaterThan(0.9);
    // (least at the band's middle: 1 - (1 - 0.71)^2)
    expect(least).toBeCloseTo(1 - (1 - Math.SQRT1_2) ** 2, 4);
    expect(where / WORDS_LEAST).toBeCloseTo(1, 2);
    // (as it was - the words out over the band's upper half, then the icons in over its lower - nothing at its middle)
    const halves = (scale: number) => {
      const f = Math.log(scale / WORDS_LEAST) / Math.log(WORDS_FADE);
      return together(Math.min(1, Math.max(0, f)), Math.min(1, Math.max(0, -f)));
    };
    expect(halves(WORDS_LEAST)).toBe(0);
  });

  it("fade with the zoom, never at once: notch by notch of a mouse wheel, never more than half at a time, and only one way", () => {
    // (a notch: e^(40 px x 0.0016) times - PanZoom2D)
    const notch = Math.exp(40 * 0.0016);
    // (the band ln 1.15 either side, a notch ln 1.066: 0.23 of it, the cosine's steepest pi/2 times that - 0.36)
    for (const [shown, way] of [[wordsShown, 1], [standInShown, -1]] as const) {
      let was = shown(zoomAt(0.4));
      let most = 0;
      let steps = 0;
      for (let scale = 0.4 * notch; scale < 1.5; scale *= notch) {
        const now = shown(zoomAt(scale));
        expect((now - was) * way).toBeGreaterThanOrEqual(-1e-12);
        most = Math.max(most, Math.abs(now - was));
        if (Math.abs(now - was) > 1e-9) steps++;
        was = now;
      }
      expect(most).toBeLessThan(0.4);
      expect(steps).toBeGreaterThanOrEqual(4);
    }
  });
});
