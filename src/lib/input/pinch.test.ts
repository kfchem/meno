import { describe, expect, it } from "vitest";
import { LEAST_SPREAD_PX, PINCH_SOON_MS, fingersStep, makesPinch, pageUnder, pinchedView, type PageView, type ScreenBox } from "./pinch";

const box: ScreenBox = { left: 100, top: 50, width: 800, height: 600 };
const view: PageView = { x: 10, y: -4, zoom: 20 };

describe("two fingers pinching", () => {
  it("zoom as far as they spread, about the point between them", () => {
    const step = fingersStep({ x: 400, y: 300 }, { x: 500, y: 300 }, { x: 350, y: 300 }, { x: 550, y: 300 });
    expect(step.scale).toBeCloseTo(2, 12);
    expect(step.from).toEqual({ x: 450, y: 300 });
    expect(step.to).toEqual({ x: 450, y: 300 });
    const next = pinchedView(view, box, step, 1, 300);
    expect(next.zoom).toBeCloseTo(40, 12);
    // (what was between the fingers is between them still)
    const held = pageUnder(view, box, step.from);
    const now = pageUnder(next, box, step.to);
    expect(now.x).toBeCloseTo(held.x, 12);
    expect(now.y).toBeCloseTo(held.y, 12);
  });

  it("move the view as the point between them moves, the page under them going with them", () => {
    // (both moved 30 px right and 40 px down, as far apart as before)
    const step = fingersStep({ x: 300, y: 200 }, { x: 420, y: 260 }, { x: 330, y: 240 }, { x: 450, y: 300 });
    expect(step.scale).toBeCloseTo(1, 12);
    const next = pinchedView(view, box, step, 1, 300);
    expect(next.zoom).toBe(20);
    expect(next.x).toBeCloseTo(view.x - 30 / 20, 12);
    expect(next.y).toBeCloseTo(view.y + 40 / 20, 12);
    const a = pageUnder(view, box, { x: 300, y: 200 });
    const b = pageUnder(next, box, { x: 330, y: 240 });
    expect(b.x).toBeCloseTo(a.x, 12);
    expect(b.y).toBeCloseTo(a.y, 12);
  });

  it("keep the page point first between them between them, one finger moved at a time over many steps", () => {
    let v = view;
    let a = { x: 300, y: 300 };
    const b = { x: 600, y: 360 };
    const start = pageUnder(v, box, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    // (the first finger drawn in, in steps; then the point between them is where the page point went)
    for (let k = 0; k < 10; k++) {
      const next = { x: a.x + 12, y: a.y + 3 };
      v = pinchedView(v, box, fingersStep(a, b, next, b), 1, 300);
      a = next;
    }
    expect(v.zoom).toBeLessThan(view.zoom);
    // (each step keeps its own midpoint's page point: the steps together keep the first one's within what the midpoints moved)
    const end = pageUnder(v, box, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeLessThan(1e-9);
  });

  it("stay within the zoom's limits, and zoom nothing where the fingers are nearly together", () => {
    const wide = fingersStep({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }, { x: 10_000, y: 0 });
    expect(pinchedView(view, box, wide, 1, 300).zoom).toBe(300);
    const shut = fingersStep({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }, { x: 0.01, y: 0 });
    expect(pinchedView(view, box, shut, 1, 300).zoom).toBe(20);
    expect(shut.scale).toBe(1);
    expect(fingersStep({ x: 0, y: 0 }, { x: LEAST_SPREAD_PX / 2, y: 0 }, { x: 0, y: 0 }, { x: 200, y: 0 }).scale).toBe(1);
  });
});

describe("a second finger", () => {
  const first = { at: { x: 100, y: 100 }, t: 1000, now: { x: 100, y: 100 } };
  const bondPx = 36;

  it("makes a pinch of a press it comes soon after, whatever the first came down on", () => {
    expect(makesPinch(first, 1000 + PINCH_SOON_MS, bondPx, false)).toBe(true);
    // (the first already gone further than a bond's length - drawing a bond - but only just begun)
    expect(makesPinch({ ...first, now: { x: 200, y: 100 } }, 1000 + 50, bondPx, false)).toBe(true);
  });

  it("makes a pinch, however late, of a first finger not yet gone a bond's length", () => {
    expect(makesPinch({ ...first, now: { x: 120, y: 110 } }, 1000 + 900, bondPx, false)).toBe(true);
  });

  it("makes a pinch of a first finger moving the view, however far and late", () => {
    expect(makesPinch({ ...first, now: { x: 600, y: 100 } }, 5000, bondPx, true)).toBe(true);
  });

  it("is no pinch where the first has gone a bond's length, late, in something of its own", () => {
    expect(makesPinch({ ...first, now: { x: 136, y: 100 } }, 1000 + PINCH_SOON_MS + 1, bondPx, false)).toBe(false);
  });
});
