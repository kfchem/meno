import { describe, expect, it } from "vitest";
import { LEAST_SPREAD_PX } from "../input/pinch";
import { atOf, COLUMN_GAP, COLUMN_MARGIN, columnLayout, deepest, pageInView, pagesInView, pageUnder, pinchedColumn, pointOf, pointOn, topOf, type ColumnView } from "./column";

const A4: [number, number] = [595, 842];
const WIDE: [number, number] = [842, 595];

describe("a PDF's pages in the column", () => {
  it("lie one under another, the widest as wide as the column, its margins aside, each in the middle", () => {
    const l = columnLayout([A4, WIDE, A4], 440, 1);
    expect(l.width).toBe(440);
    expect(l.pages[1].w).toBeCloseTo(440 - 2 * COLUMN_MARGIN);
    expect(l.pages[0].w).toBeCloseTo((595 / 842) * (440 - 2 * COLUMN_MARGIN));
    expect(l.pages[0].x + l.pages[0].w / 2).toBeCloseTo(220);
    expect(l.pages[0].y).toBe(COLUMN_MARGIN);
    expect(l.pages[1].y).toBeCloseTo(l.pages[0].y + l.pages[0].h + COLUMN_GAP);
    expect(l.height).toBeCloseTo(l.pages[2].y + l.pages[2].h + COLUMN_MARGIN);
  });

  it("larger than the column, are wider than it, from its margin", () => {
    const l = columnLayout([A4], 440, 2);
    expect(l.pages[0].w).toBeCloseTo(2 * (440 - 2 * COLUMN_MARGIN));
    expect(l.width).toBeCloseTo(l.pages[0].w + 2 * COLUMN_MARGIN);
    expect(l.pages[0].x).toBeCloseTo(COLUMN_MARGIN);
  });

  it("are read so many pages down: a page gone to has its top just under the column's top, and widths keep the place", () => {
    const sizes = Array.from({ length: 6 }, () => A4);
    const l = columnLayout(sizes, 440, 1);
    expect(topOf(l, 0)).toBe(0);
    expect(topOf(l, 3)).toBeCloseTo(l.pages[3].y - COLUMN_GAP / 2);
    for (const at of [0, 0.25, 1.5, 4.75]) expect(atOf(l, topOf(l, at))).toBeCloseTo(at);
    // (a hair short of a page's place, still that hair short: what is eased toward it comes there)
    expect(topOf(l, atOf(l, topOf(l, 3) - 0.1))).toBeCloseTo(topOf(l, 3) - 0.1, 3);
    // (half way down the third page, however wide the column)
    const wider = columnLayout(sizes, 800, 1);
    const mid = (k: typeof l) => (topOf(k, 2.5) - k.pages[2].y) / k.pages[2].h;
    expect(mid(wider)).toBeCloseTo(mid(l), 2);
  });

  it("show the page most in view, the first of those as much", () => {
    const l = columnLayout(Array.from({ length: 4 }, () => A4), 440, 1);
    const h = l.pages[0].h;
    expect(pageInView(l, 0, h)).toBe(0);
    expect(pageInView(l, l.pages[1].y + h * 0.6, h)).toBe(2);
    // (small, all of two in view: the first)
    const small = columnLayout(Array.from({ length: 4 }, () => A4), 440, 0.25);
    expect(pageInView(small, 0, 2000)).toBe(0);
    expect(pagesInView(l, 0, h)).toEqual([0]);
    expect(pagesInView(l, 0, h + 2 * COLUMN_MARGIN)).toEqual([0, 1]);
    expect(pagesInView(l, 0, h, 2 * h)).toEqual([0, 1, 2]);
    expect(deepest(l, h)).toBeCloseTo(l.height - h);
  });

  it("find where a point is on a page, and where that point is again", () => {
    const l = columnLayout([A4, A4], 440, 1.5);
    const p = l.pages[1];
    const at = pointOn(l, p.x + p.w * 0.3, p.y + p.h * 0.7);
    expect(at.page).toBe(1);
    expect(at.u).toBeCloseTo(0.3);
    expect(at.v).toBeCloseTo(0.7);
    const back = pointOf(l, at);
    expect(back.x).toBeCloseTo(p.x + p.w * 0.3);
    expect(back.y).toBeCloseTo(p.y + p.h * 0.7);
    expect(pageUnder(l, p.x + 1, p.y + 1)).toBe(1);
    expect(pageUnder(l, 1, p.y + 1)).toBeNull();
  });
});

describe("two fingers pinching the column", () => {
  // (one page 100 by 1000 points in a column 124 wide: at 1, a point is a pixel, the page 12 in from the top and the left)
  const SIZES: [number, number][] = [[100, 1000]];
  const W = 124;
  const TALL = 300;
  const pinch = (view: ColumnView, a0: [number, number], b0: [number, number], a1: [number, number], b1: [number, number]) =>
    pinchedColumn(SIZES, W, TALL, view, { a0: { x: a0[0], y: a0[1] }, b0: { x: b0[0], y: b0[1] }, a1: { x: a1[0], y: a1[1] }, b1: { x: b1[0], y: b1[1] } }, 0.25, 8);

  it("spread twice as far apart, is twice as large, the point midway between them held there", () => {
    const v = pinch({ zoom: 1, top: 100, left: 0 }, [40, 150], [60, 150], [30, 150], [70, 150]);
    // (midway: 50 across, 250 down at 1 - 0.38 across the page, 0.238 down it; at 2 the page is 200 by 2000, 12 in, in a column 224 wide)
    expect(v.zoom).toBeCloseTo(2);
    expect(v.top).toBeCloseTo(12 + 0.238 * 2000 - 150);
    expect(v.left).toBeCloseTo(12 + 0.38 * 200 - 50);
    const held = pointOn(columnLayout(SIZES, W, 2), v.left + 50, v.top + 150);
    expect(held.u).toBeCloseTo(0.38);
    expect(held.v).toBeCloseTo(0.238);
  });

  it("closed, is smaller; the point midway between them, wherever they go, is under them still", () => {
    const from: ColumnView = { zoom: 3, top: 900, left: 60 };
    const before = pointOn(columnLayout(SIZES, W, 3), from.left + 50, from.top + 100);
    const v = pinch(from, [20, 60], [80, 140], [20, 110], [50, 150]);
    expect(v.zoom).toBeCloseTo(1.5);
    const after = pointOn(columnLayout(SIZES, W, 1.5), v.left + 35, v.top + 130);
    expect(after.u).toBeCloseTo(before.u);
    expect(after.v).toBeCloseTo(before.v);
  });

  it("moved together, moves it as far as they went and zooms nothing", () => {
    expect(pinch({ zoom: 1, top: 100, left: 0 }, [40, 150], [60, 170], [40, 120], [60, 140])).toEqual({ zoom: 1, top: 130, left: 0 });
    const v = pinch({ zoom: 2, top: 400, left: 50 }, [40, 150], [60, 170], [30, 160], [50, 180]);
    expect(v.zoom).toBe(2);
    expect(v.top).toBeCloseTo(390);
    expect(v.left).toBeCloseTo(60);
  });

  it("stops at the zoom's limits, whatever the fingers do, and stays within the pages", () => {
    expect(pinch({ zoom: 6, top: 100, left: 0 }, [40, 150], [60, 150], [0, 150], [100, 150]).zoom).toBe(8);
    expect(pinch({ zoom: 0.5, top: 0, left: 0 }, [0, 150], [100, 150], [45, 150], [55, 150]).zoom).toBe(0.25);
    const top = pinch({ zoom: 1, top: 0, left: 0 }, [40, 150], [60, 150], [40, 250], [60, 250]);
    expect(top).toEqual({ zoom: 1, top: 0, left: 0 });
  });

  it("closed nearer than a pinch can be measured, holds the zoom it had there and does not spring back", () => {
    const begun: ColumnView = { zoom: 4, top: 600, left: 100 };
    const at = (spread: number) => pinch(begun, [0, 150], [100, 150], [50 - spread / 2, 150], [50 + spread / 2, 150]).zoom;
    expect(at(10)).toBeCloseTo(0.4);
    expect(at(LEAST_SPREAD_PX)).toBeCloseTo((4 * LEAST_SPREAD_PX) / 100);
    expect(at(LEAST_SPREAD_PX - 0.1)).toBeCloseTo((4 * LEAST_SPREAD_PX) / 100);
    expect(at(2)).toBeCloseTo((4 * LEAST_SPREAD_PX) / 100);
    expect(at(0)).toBeCloseTo((4 * LEAST_SPREAD_PX) / 100);
  });

  it("begun with the fingers nearer than that, zooms as soon as they part far enough, from where it was, with no jump", () => {
    const begun: ColumnView = { zoom: 1, top: 100, left: 0 };
    const at = (spread: number) => pinch(begun, [47.5, 150], [52.5, 150], [50 - spread / 2, 150], [50 + spread / 2, 150]).zoom;
    expect(at(5)).toBe(1);
    expect(at(LEAST_SPREAD_PX)).toBeCloseTo(1);
    expect(at(LEAST_SPREAD_PX + 0.1)).toBeCloseTo((LEAST_SPREAD_PX + 0.1) / LEAST_SPREAD_PX);
    expect(at(2 * LEAST_SPREAD_PX)).toBeCloseTo(2);
    expect(at(120)).toBe(8);
  });

  it("given a place that is not a number, changes nothing", () => {
    const begun: ColumnView = { zoom: 2, top: 300, left: 40 };
    expect(pinch(begun, [40, 150], [60, 150], [NaN, 150], [70, 150])).toEqual(begun);
    expect(pinch(begun, [40, Infinity], [60, 150], [30, 150], [70, 150])).toEqual(begun);
  });

  it("taken out and back in, a frame at a time, comes back to where it began - past a limit and back too", () => {
    const begun: ColumnView = { zoom: 1.7, top: 640, left: 35 };
    // (three times as far apart at most - and ten times, past the largest)
    for (const most of [3, 10]) {
      let v = begun;
      let largest = 0;
      for (let i = 0; i <= 400; i++) {
        const spread = 10 * (1 + (most - 1) * Math.sin((Math.PI * i) / 400));
        const mx = 60 + 15 * Math.sin((Math.PI * i) / 100);
        // (worked out from where they came down, as the column does)
        v = pinch(begun, [55, 145], [65, 155], [mx - spread / 2, 150 - spread / 2], [mx + spread / 2, 150 + spread / 2]);
        largest = Math.max(largest, v.zoom);
      }
      expect(largest).toBeCloseTo(Math.min(8, begun.zoom * most), 3);
      expect(v.zoom).toBeCloseTo(begun.zoom, 9);
      expect(v.top).toBeCloseTo(begun.top, 6);
      expect(v.left).toBeCloseTo(begun.left, 6);
    }
  });
});
