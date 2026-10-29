import { describe, expect, it } from "vitest";
import { PAGE_PX, WORDS_LEAST, wordsReadAt } from "./pageScale";
import { SWITCH_BAND } from "./zoomSwitch";

/** The zoom at which a page pixel is `scale` screen pixels. */
const zoomAt = (scale: number) => scale / PAGE_PX;

describe("the words of the page's cards, sets and chips, as the page is zoomed", () => {
  it("are read where they are large enough and not where they are too small - switched, never faded with the zoom", () => {
    expect(wordsReadAt(zoomAt(1), false)).toBe(true);
    expect(wordsReadAt(zoomAt(0.3), true)).toBe(false);
    expect(wordsReadAt(zoomAt(WORDS_LEAST * SWITCH_BAND), false)).toBe(true);
    expect(wordsReadAt(zoomAt(WORDS_LEAST / SWITCH_BAND / 1.001), true)).toBe(false);
  });

  it("hold as they are about the threshold: zooming out notch by notch and back, each switches once and only once", () => {
    // (a notch: e^(40 px x 0.0016) times - PanZoom2D; a half notch, as a trackpad gives)
    const step = Math.exp(20 * 0.0016);
    let read = true;
    let out = 0;
    for (let s = 1.2; s > 0.4; s /= step) {
      const r = wordsReadAt(zoomAt(s), read);
      if (r !== read) out++;
      read = r;
    }
    let back = 0;
    for (let s = 0.4; s < 1.2; s *= step) {
      const r = wordsReadAt(zoomAt(s), read);
      if (r !== read) back++;
      read = r;
    }
    expect([out, back]).toEqual([1, 1]);
  });
});
