import { describe, expect, it } from "vitest";
import { HAIR_STEP, hairWritten, NOTES_SCALE, PAGE_PX, pageLayerStep, pagePx, pageScale, pageSized, pageTold, notesSized, WORDS_LEAST, wordsReadAt, ZOOM_WRITTEN_STEP, zoomWritten, type PageLayerState } from "./pageScale";
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

describe("a card's and a set's lines, as the zoom goes", () => {
  it("are a page pixel - one of the layer's - written first, and never again while zoomed in", () => {
    expect(hairWritten(Number.NaN, zoomAt(1), 2)).toBe(1);
    for (const scale of [0.6, 1, 2, 6]) expect(hairWritten(1, zoomAt(scale), 2), `${scale}`).toBeNull();
  });

  it("are never thinner than a device pixel: under that floor written in steps of a quarter, and back to one as the zoom comes out from under it", () => {
    // (a page pixel a quarter of a device pixel on a screen of two: four of the layer's)
    expect(hairWritten(1, zoomAt(0.125), 2)).toBeCloseTo(4, 9);
    // (a step too small to be seen: left)
    expect(hairWritten(4, zoomAt(0.125 * 1.1), 2)).toBeNull();
    expect(hairWritten(4, zoomAt(0.125 * HAIR_STEP * 1.01), 2)).toBeCloseTo(4 / (HAIR_STEP * 1.01), 6);
    expect(hairWritten(4, zoomAt(1), 2)).toBe(1);
    // (on a screen of one, the floor a whole screen pixel)
    expect(hairWritten(1, zoomAt(0.5), 1)).toBeCloseTo(2, 9);
  });
});

describe("the page's chips as the zoom moves", () => {
  it("are laid out at the zoom first, and once it stands still - scaled from there, never laid out again, while it moves", () => {
    expect(pageTold(Number.NaN, 4, false)).toEqual({ laid: 4, page: pageScale(4), k: 1, notesK: 1 });
    // (moving: still laid out at 4, scaled by how far the zoom has gone - however far)
    const moving = pageTold(4, 6, false);
    expect(moving.laid).toBe(4);
    expect(moving.page).toBe(pageScale(4));
    expect(moving.k).toBeCloseTo(1.5);
    expect(pageTold(4, 4 * 1.001, false).laid).toBe(4);
    // (standing: laid out where it stands, nothing scaled)
    expect(pageTold(4, 6, true)).toEqual({ laid: 6, page: pageScale(6), k: 1, notesK: 1 });
  });

  it("are as large, scaled, as laid out at the zoom they are scaled to - and so are notes, between their two scales", () => {
    for (const [laid, zoom] of [
      [zoomAt(1), zoomAt(1.3)],
      [zoomAt(1), zoomAt(0.5)],
      [zoomAt(1.2), zoomAt(3)],
      [zoomAt(0.4), zoomAt(0.6)],
    ]) {
      const t = pageTold(laid, zoom, false);
      expect(t.page * t.k).toBeCloseTo(pageScale(zoom));
      const notes = (s: number) => Math.min(NOTES_SCALE.most, Math.max(NOTES_SCALE.least, s));
      expect(notes(t.page) * t.notesK).toBeCloseTo(notes(pageScale(zoom)));
    }
  });

  it("over a zoom from one scale to three, are laid out twice: as it begins, and where it stops", () => {
    let laid = Number.NaN;
    let before = Number.NaN;
    let layouts = 0;
    const zooms: number[] = [];
    for (let z = zoomAt(1), k = 0; k < 40; k++) zooms.push((z += (zoomAt(3) - z) / 6));
    zooms.push(zooms[zooms.length - 1]);
    for (const z of [zoomAt(1), ...zooms]) {
      const t = pageTold(laid, z, z === before);
      before = z;
      if (t.laid !== laid) layouts++;
      laid = t.laid;
    }
    expect(layouts).toBe(2);
  });

  it("each hang from their own point, scaled as the zoom moves and laid out at the page's scale", () => {
    expect(pageSized("top")).toEqual({ zoom: "var(--page, 1)", transform: "scale(var(--page-k, 1))", transformOrigin: "50% 0" });
    expect(pageSized("middle").transformOrigin).toBe("50% 50%");
    expect(notesSized("foot")).toMatchObject({ transform: "scale(var(--notes-k, 1))", transformOrigin: "50% 100%" });
    expect(notesSized("foot").zoom).toBe(`clamp(${NOTES_SCALE.least}, var(--page, 1), ${NOTES_SCALE.most})`);
  });
});

describe("the page's HTML layer, told at each frame", () => {
  const names = (w: [string, string][]) => w.map(([n]) => n);

  it("is told all first; while the zoom moves, only how far it is scaled, a frame more asked for each time; where it stops, laid out there, scaled no more, no frame more", () => {
    const first = pageLayerStep(null, zoomAt(1), false);
    expect(names(first.writes)).toEqual(["--page", "--page-k", "--notes-k", "--words", "--stand-in"]);
    expect(first.again).toBe(false);
    // (moving: scaled, laid out where it was)
    const moving = pageLayerStep(first.now, zoomAt(1.2), false);
    expect(names(moving.writes)).toEqual(["--page-k", "--notes-k"]);
    expect(moving.writes[0][1]).toBe("1.2000");
    expect(moving.again).toBe(true);
    // (still moving, a step further: scaled again, a frame more again)
    const further = pageLayerStep(moving.now, zoomAt(1.4), false);
    expect(names(further.writes)).toEqual(["--page-k", "--notes-k"]);
    expect(further.again).toBe(true);
    // (standing still where it stopped: laid out there, scaled no more, the canvas left to rest)
    const stood = pageLayerStep(further.now, zoomAt(1.4), true);
    expect(names(stood.writes)).toEqual(["--page", "--page-k", "--notes-k"]);
    expect(stood.writes).toContainEqual(["--page", pageScale(zoomAt(1.4)).toFixed(4)]);
    expect(stood.writes).toContainEqual(["--page-k", "1.0000"]);
    expect(stood.again).toBe(false);
    // (and nothing more as it stays)
    expect(pageLayerStep(stood.now, zoomAt(1.4), true).writes).toEqual([]);
  });

  it("tells the notes their own scale while it moves, held between their two scales", () => {
    const at = pageLayerStep(null, zoomAt(1), true).now;
    // (to three times: notes no larger than half as large again)
    const step = pageLayerStep(at, zoomAt(3), false);
    expect(step.writes).toContainEqual(["--notes-k", (NOTES_SCALE.most / 1).toFixed(4)]);
  });

  it("switches its words where they are too small to read, and back - told so, the attribute too", () => {
    const at: PageLayerState = pageLayerStep(null, zoomAt(1), true).now;
    const small = pageLayerStep(at, zoomAt(0.3), false);
    expect(small.writes).toContainEqual(["--words", "0"]);
    expect(small.wordsSmall).toBe(true);
    expect(pageLayerStep(small.now, zoomAt(0.3), true).wordsSmall).toBeUndefined();
    const back = pageLayerStep(pageLayerStep(small.now, zoomAt(0.3), true).now, zoomAt(1), false);
    expect(back.writes).toContainEqual(["--words", "1"]);
    expect(back.wordsSmall).toBe(false);
  });

  it("gives a length on its chips at the scale they are laid out at and scaled by as the zoom moves", () => {
    expect(pagePx(10)).toBe("calc(10px * var(--page, 1) * var(--page-k, 1))");
  });
});
