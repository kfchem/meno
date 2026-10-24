import { describe, expect, it } from "vitest";
import { boxOf, FIGURES_LEAST_PX, holds, isStandard, joinOf, markScale, OF_VIEW, presentAct, reshaped, slideAround, slideFit, slideInView, slideOfView, slidesBox, STANDARD, talkEnd, viewOf, WIDE, zoomOf } from "./slides";
import { bandsAbout, frameOnScreen, rectBetween } from "./stage";
import { presentIntent } from "../../../../lib/doc/shortcuts";

describe("slides on the page", () => {
  it("are made round what is selected: wide-screen, that in their middle, room left about it", () => {
    const s = slideAround({ x0: 0, y0: 0, x1: 30, y1: 10 });
    expect(s.w / s.h).toBeCloseTo(WIDE, 9);
    expect(s.x).toBe(15);
    expect(s.y).toBe(5);
    const b = boxOf(s);
    expect(b.x0).toBeLessThan(0);
    expect(b.x1).toBeGreaterThan(30);
    expect(b.y0).toBeLessThan(0);
    expect(b.y1).toBeGreaterThan(10);
    // (tall: as tall as it needs, then as wide as the proportions say)
    const tall = slideAround({ x0: 0, y0: 0, x1: 2, y1: 20 }, STANDARD);
    expect(tall.h).toBeGreaterThan(20);
    expect(tall.w / tall.h).toBeCloseTo(STANDARD, 9);
  });

  it("are made of the view: the largest of their proportions within it, a little in from its edges, where asked", () => {
    const s = slideOfView({ x0: -50, y0: -20, x1: 50, y1: 20 }, WIDE, { x: 3, y: 4 });
    expect(s.w / s.h).toBeCloseTo(WIDE, 9);
    expect(s.h).toBeLessThan(40);
    expect(s.x).toBe(3);
    expect(s.y).toBe(4);
  });

  it("change their proportions about their middle, as wide", () => {
    const s = { id: 1, x: 2, y: 3, w: 32, h: 18 };
    expect(isStandard(s)).toBe(false);
    const t = reshaped(s, STANDARD);
    expect(t).toMatchObject({ x: 2, y: 3, w: 32, h: 24 });
    expect(isStandard(t)).toBe(true);
  });

  it("are shown as large as they fit the canvas, in the middle of it", () => {
    const s = { x: 10, y: 20, w: 160, h: 90 };
    expect(slideFit(s, 1600, 900)).toEqual({ x: 10, y: 20, zoom: 10 });
    // (a screen less wide than the slide: as wide as the screen)
    expect(slideFit(s, 1200, 900).zoom).toBe(7.5);
    const v = viewOf({ x: 1, y: 2, zoom: 4 }, 800);
    expect(v).toEqual({ x: 1, y: 2, w: 200 });
    expect(zoomOf(v, 800)).toBe(4);
  });

  it("end a talk at the last one shown, in the middle of the canvas the talk found, as much of it as a slide made of the view", () => {
    const s = { x: 10, y: 20, w: 160, h: 90 };
    expect(talkEnd(s, 1600, 900)).toEqual({ x: 10, y: 20, zoom: OF_VIEW * 10 });
    // (the column opening again over 400 pixels of a canvas 2000 wide: the slide fits the rest - the view going half the column as it opens)
    expect(talkEnd(s, 2000, 900, 400)).toEqual({ x: 10, y: 20, zoom: OF_VIEW * 10 });
    // (a canvas less wide than the slide: as wide as the canvas allows)
    expect(talkEnd(s, 800, 900).zoom).toBeCloseTo(OF_VIEW * 5, 12);
  });

  it("are told in view: the one most nearly what is seen, or the nearest; none with none", () => {
    const slides = [
      { x: 0, y: 0, w: 160, h: 90 },
      { x: 300, y: 0, w: 160, h: 90 },
      { x: 300, y: 0, w: 32, h: 18 },
    ];
    expect(slideInView(slides, { x0: -90, y0: -50, x1: 90, y1: 50 })).toBe(0);
    expect(slideInView(slides, { x0: 210, y0: -50, x1: 390, y1: 50 })).toBe(1);
    // (zoomed in to the small one within the second)
    expect(slideInView(slides, { x0: 280, y0: -10, x1: 320, y1: 10 })).toBe(2);
    expect(slideInView(slides, { x0: 900, y0: 900, x1: 950, y1: 950 })).toBe(1);
    expect(slideInView([], { x0: 0, y0: 0, x1: 1, y1: 1 })).toBe(-1);
  });

  it("are joined to the next by a line from edge to edge, or from number to number when one holds the other", () => {
    const a = { x: 0, y: 0, w: 16, h: 9 };
    const b = { x: 40, y: 0, w: 16, h: 9 };
    expect(joinOf(a, b)).toEqual({ from: { x: 8, y: 0 }, to: { x: 32, y: 0 } });
    const inner = { x: 2, y: 1, w: 4, h: 2 };
    expect(holds(a, inner)).toBe(true);
    expect(joinOf(a, inner)).toEqual({ from: { x: -8, y: 4.5 }, to: { x: 0, y: 2 } });
    // (overlapping: nothing between them to draw)
    expect(joinOf(a, { x: 10, y: 0, w: 16, h: 9 })).toBeNull();
    expect(slidesBox([a, b])).toEqual({ x0: -8, y0: -4.5, x1: 48, y1: 4.5 });
    expect(slidesBox([])).toBeNull();
  });

  it("are given in a talk by the keys slides software has, and those a clicker sends", () => {
    for (const key of ["ArrowRight", "ArrowDown", " ", "PageDown", "n"]) expect(presentAct({ key })).toEqual({ go: "next" });
    for (const key of ["ArrowLeft", "ArrowUp", "PageUp", "Backspace", "p"]) expect(presentAct({ key })).toEqual({ go: "previous" });
    expect(presentAct({ key: "Home" })).toEqual({ go: "first" });
    expect(presentAct({ key: "End" })).toEqual({ go: "last" });
    expect(presentAct({ key: "Enter" })).toEqual({ enter: true });
    expect(presentAct({ key: "Escape" })).toEqual({ end: true });
    expect(presentAct({ key: "b" })).toEqual({ screen: "black" });
    expect(presentAct({ key: "." })).toEqual({ screen: "black" });
    expect(presentAct({ key: "W" })).toEqual({ screen: "white" });
    expect(presentAct({ key: "7" })).toEqual({ digit: 7 });
    expect(presentAct({ key: "ArrowRight", metaKey: true })).toBeNull();
    expect(presentAct({ key: "q" })).toBeNull();
  });

  it("are given from the first or from the one in view by the keys slides software has", () => {
    expect(presentIntent({ key: "Enter", metaKey: true, shiftKey: true })).toBe("first");
    expect(presentIntent({ key: "Enter", ctrlKey: true })).toBe("here");
    expect(presentIntent({ key: "F5" })).toBe("first");
    expect(presentIntent({ key: "F5", shiftKey: true })).toBe("here");
    expect(presentIntent({ key: "Enter" })).toBeNull();
    // (not while a field has the keys)
    expect(presentIntent({ key: "Enter", metaKey: true, target: { tagName: "TEXTAREA" } })).toBeNull();
  });

  it("are veiled about, in four bands that cover the rest of the canvas and nothing of the slide", () => {
    const bands = bandsAbout({ left: 100, top: 50, width: 800, height: 450 }, 1000, 600);
    expect(bands).toEqual([
      [0, 0, 1000, 50],
      [0, 500, 1000, 100],
      [0, 50, 100, 450],
      [900, 50, 100, 450],
    ]);
    // (a slide larger than the canvas: no band)
    expect(bandsAbout({ left: -10, top: -10, width: 1200, height: 800 }, 1000, 600).every(([, , w, h]) => w * h === 0)).toBe(true);
  });

  it("are framed on the screen where a talk shows them - the frame the black lies about, at a slide and on the way between two", () => {
    // (16:9 on a 1000 by 700 canvas, 50 pixels kept at its top: as wide as it is, in the middle of what is left)
    const frame = frameOnScreen({ w: 16, h: 9 }, 1000, 700, 50);
    expect(frame.left).toBeCloseTo(0);
    expect(frame.width).toBeCloseTo(1000);
    expect(frame.height).toBeCloseTo(562.5);
    expect(frame.top).toBeCloseTo(50 + (650 - 562.5) / 2);
    // (where the view laid out by slideFit draws the slide: the same)
    const s = { x: 3, y: 4, w: 16, h: 9 };
    const v = slideFit(s, 1000, 700, 50);
    expect(1000 / 2 + (s.x - s.w / 2 - v.x) * v.zoom).toBeCloseTo(frame.left);
    expect(700 / 2 - (s.y + s.h / 2 - v.y) * v.zoom).toBeCloseTo(frame.top);
    // (two slides of the same proportions: the same frame all the way; 4:3 to 16:9, from the one to the other)
    const tall = frameOnScreen({ w: 4, h: 3 }, 1000, 700, 50);
    expect(rectBetween(frame, frame, 0.4)).toEqual(frame);
    expect(rectBetween(tall, frame, 0)).toEqual(tall);
    expect(rectBetween(tall, frame, 1)).toEqual(frame);
    expect(rectBetween(tall, frame, 0.5).width).toBeCloseTo((tall.width + frame.width) / 2);
  });
});

describe("a slide laid for a talk below a Mac's notch", () => {
  it("fits the screen below the band the notch keeps, in the middle of what is left - as slides software lays it", () => {
    const s = { x: 0, y: 0, w: 32, h: 18 };
    // (a 1710 by 1112 screen, its top 38 points the notch's: the slide as wide as the screen, 962 tall)
    const f = slideFit(s, 1710, 1112, 38);
    expect(f.zoom).toBeCloseTo(1710 / 32, 9);
    // (its middle on the screen: halfway down what is left below the band)
    const middleOnScreen = 1112 / 2 - (s.y - f.y) * f.zoom;
    expect(middleOnScreen).toBeCloseTo(38 + (1112 - 38) / 2, 6);
    // (none kept: as before)
    expect(slideFit(s, 1710, 1112)).toEqual({ x: 0, y: 0, zoom: Math.min(1710 / 32, 1112 / 18) });
  });
});

describe("a slide's number, and the line to the next, as the page is zoomed out", () => {
  // (Slides2D's: a disc 22 px across, its figures 12 px; a slide 9 units tall on the page)
  const mark = (screenH: number) => markScale(9, 9 / screenH, 22, 12);
  it("keeps its size on the screen while its disc is no more than a sixth of its slide's height there", () => {
    expect(mark(600)).toEqual({ k: 1, seen: 1 });
    expect(mark(132).k).toBeCloseTo(1, 9);
  });

  it("from there shrinks with its slide - a sixth of its height - and fades out where its figures are too small to read", () => {
    expect(mark(66).k).toBeCloseTo(0.5, 9);
    expect(mark(66).seen).toBe(0);
    // (figures at 8.25 px - the least the page's words are read at - half seen; at 1.15 times that all, at 1/1.15 none)
    const at = (figures: number) => mark((figures / 12) * 132);
    expect(at(FIGURES_LEAST_PX).seen).toBeCloseTo(0.5, 9);
    expect(at(FIGURES_LEAST_PX * 1.15).seen).toBeCloseTo(1, 9);
    expect(at(FIGURES_LEAST_PX / 1.15).seen).toBeCloseTo(0, 9);
  });

  it("never at a jump: zoomed out notch by notch of a mouse wheel, its size and how much it is seen only ever less, by little at a time", () => {
    const notch = Math.exp(40 * 0.0016);
    let was = mark(2000);
    let most = { k: 0, seen: 0 };
    for (let screenH = 2000 / notch; screenH > 20; screenH /= notch) {
      const now = mark(screenH);
      expect(now.k).toBeLessThanOrEqual(was.k);
      expect(now.seen).toBeLessThanOrEqual(was.seen);
      most = { k: Math.max(most.k, was.k - now.k), seen: Math.max(most.seen, was.seen - now.seen) };
      was = now;
    }
    expect(most.k).toBeLessThan(0.07);
    // (the fade's band 1.15 x 1.15 wide, a notch 1.066 times: ln 1.066 / (2 ln 1.15) = 0.23 at most)
    expect(most.seen).toBeLessThan(0.25);
    expect(was.seen).toBe(0);
  });
});
