import { describe, expect, it } from "vitest";
import { PAGE_PX, WORDS_LEAST, wordsReadAt, ZOOM_WRITTEN_STEP, zoomWritten } from "./pageScale";
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

describe("what the page's HTML is sized by, written again as the zoom goes", () => {
  it("is written first, then while the zoom moves only once it has gone half a per cent, and as it is once it stands", () => {
    expect(zoomWritten(Number.NaN, 4, false)).toBe(true);
    expect(zoomWritten(4, 4, true)).toBe(false);
    expect(zoomWritten(4, 4 * 1.004, false)).toBe(false);
    expect(zoomWritten(4, 4 * 1.006, false)).toBe(true);
    expect(zoomWritten(4, 4 / 1.006, false)).toBe(true);
    // (standing still, a step short of it: written as it is)
    expect(zoomWritten(4, 4 * 1.004, true)).toBe(true);
  });

  it("over a wheel's zoom easing in, writes a few times where the frames are many, the last as it ends", () => {
    let written = Number.NaN;
    let before = Number.NaN;
    const writes: number[] = [];
    // (from 4.7 to 6.667, each frame a fifth of the way left - with a long tail - then standing at it)
    const zooms: number[] = [];
    for (let z = 4.7, k = 0; k < 60; k++) zooms.push((z += (6.667 - z) / 5));
    zooms.push(6.667, 6.667);
    for (const z of zooms) {
      const still = z === before;
      before = z;
      if (zoomWritten(written, z, still)) writes.push((written = z));
    }
    expect(writes.length).toBeLessThan(zooms.length / 3);
    expect(writes[writes.length - 1]).toBe(6.667);
    // (each write while it moved, at least a step from the one before)
    for (let i = 1; i < writes.length - 1; i++) expect(Math.abs(Math.log(writes[i] / writes[i - 1]))).toBeGreaterThanOrEqual(ZOOM_WRITTEN_STEP);
  });
});
