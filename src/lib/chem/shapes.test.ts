import { describe, expect, it } from "vitest";
import {
  dashed,
  drawnShape,
  flattenedCurve,
  outlineCurve,
  fillOutline,
  handlesOf,
  insidePolygon,
  lineWidthOf,
  moved,
  outlineOf,
  reshaped,
  shapeBounds,
  shapeHit,
  strokePieces,
  strokeTriangles,
  asBonds,
  bondLinePtOf,
  cornerRadius,
  roundedOfBondPt,
  roundedPt,
  tintOf,
  turned,
  type ShapeGeometry,
} from "./shapes";

const PT = 0.1;
const box = (kind: ShapeGeometry["kind"], more: Partial<ShapeGeometry> = {}): ShapeGeometry => ({ kind, x0: 0, y0: 0, x1: 20, y1: 10, ...more });

describe("what a shape draws", () => {
  it("goes round a box, its corners square or rounded, and an ellipse smoothly", () => {
    expect(outlineOf(box("rect"), PT)).toEqual({ points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }], closed: true });
    const rounded = outlineOf(box("rect", { radius: 9 }), PT).points;
    // (no corner itself: rounded off, 9 points round)
    expect(rounded.some((p) => p.x === 0 && p.y === 0)).toBe(false);
    expect(Math.min(...rounded.map((p) => p.x))).toBeCloseTo(0);
    expect(Math.max(...rounded.map((p) => p.y))).toBeCloseTo(10);
    const ellipse = outlineOf(box("ellipse"), PT).points;
    for (const p of ellipse) expect(((p.x - 10) / 10) ** 2 + ((p.y - 5) / 5) ** 2).toBeCloseTo(1);
  });

  it("gives a picture an ellipse's edge, and a rounded box's, as the curve it is - closed, smooth where it begins - and a rectangle's none", () => {
    const at = (c: { x: number; y: number }[], i: number, u: number) => {
      const [a, b, d, e] = [c[i], c[i + 1], c[i + 2], c[i + 3]];
      const w = [(1 - u) ** 3, 3 * (1 - u) ** 2 * u, 3 * (1 - u) * u * u, u ** 3];
      return { x: w[0] * a.x + w[1] * b.x + w[2] * d.x + w[3] * e.x, y: w[0] * a.y + w[1] * b.y + w[2] * d.y + w[3] * e.y };
    };
    const e = outlineCurve(box("ellipse"), PT)!;
    // (four quarter arcs: the start, then three points each)
    expect(e).toHaveLength(13);
    expect(e[12].x).toBeCloseTo(e[0].x, 9);
    expect(e[12].y).toBeCloseTo(e[0].y, 9);
    // (on the ellipse all along, within a hair of it)
    for (let i = 0; i + 3 < e.length; i += 3)
      for (const u of [0, 0.25, 0.5, 0.75, 1]) {
        const p = at(e, i, u);
        expect(Math.abs(Math.hypot((p.x - 10) / 10, (p.y - 5) / 5) - 1)).toBeLessThan(3e-4);
      }
    // (where it begins and ends, the same way: no seam)
    expect((e[1].y - e[0].y) * (e[12].x - e[11].x) - (e[1].x - e[0].x) * (e[12].y - e[11].y)).toBeCloseTo(0, 9);
    const rounded = outlineCurve(box("rect", { radius: 9 }), PT)!;
    expect(rounded[rounded.length - 1].x).toBeCloseTo(rounded[0].x, 9);
    expect(rounded.some((p) => Math.abs(p.x - 20) < 1e-9 && Math.abs(p.y - 5) < 3)).toBe(true);
    expect(outlineCurve(box("rect"), PT)).toBeNull();
    expect(outlineCurve({ kind: "line", x0: 0, y0: 0, x1: 1, y1: 1 }, PT)).toBeNull();
    // (flattened for a fill: fine steps along it)
    expect(flattenedCurve(e, 24)).toHaveLength(1 + 4 * 24);
  });

  it("runs a line from end to end, open", () => {
    expect(outlineOf({ kind: "line", x0: 0, y0: 0, x1: 20, y1: 0 }, PT)).toEqual({ points: [{ x: 0, y: 0 }, { x: 20, y: 0 }], closed: false });
  });

  it("breaks a dashed line into dashes along it, round its corners", () => {
    const pieces = dashed(
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 10 },
      ],
      false,
      5,
      2,
    );
    // (5 on, 2 off: the first round the corner, the second up the side, and nothing of the last bare point)
    expect(pieces).toEqual([
      [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1 }],
      [{ x: 4, y: 3 }, { x: 4, y: 8 }],
    ]);
    expect(strokePieces(box("rect", { dash: true }), PT).length).toBeGreaterThan(4);
    expect(strokePieces(box("rect"), PT)).toHaveLength(1);
  });

  it("makes a line as wide as the drawing's bonds - following its style - or its own width, as triangles either side of it, its corners mitred", () => {
    // (as the bonds: a style's bond line, 0.45 points in RSC's)
    expect(asBonds(box("rect"), 0.45).width).toBe(0.45);
    expect(lineWidthOf(asBonds(box("rect"), 0.45), PT)).toBeCloseTo(0.045);
    // (its own, whatever the style)
    expect(asBonds(box("rect", { width: 2 }), 0.45).width).toBe(2);
    expect(lineWidthOf({ width: 2 }, PT)).toBeCloseTo(0.2);
    // (the bonds' width read from a layout's options: its line over its point)
    expect(bondLinePtOf({ lineWidthPx: 0.075, pointPx: 0.125 })).toBeCloseTo(0.6);
    const t = strokeTriangles(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      true,
      2,
    );
    expect(t.positions).toHaveLength(16);
    expect(t.indices).toHaveLength(24);
    // (at a corner: in and out along its mitre, as far as half the width square to each side)
    expect(t.positions.slice(0, 4).map((v) => Math.round(v * 1e9) / 1e9)).toEqual([1, 1, -1, -1]);
  });

  it("fills only a box", () => {
    expect(fillOutline(box("ellipse"), PT)).not.toBeNull();
    expect(fillOutline({ kind: "line", x0: 0, y0: 0, x1: 1, y1: 1 }, PT)).toBeNull();
  });
});

describe("where a shape is", () => {
  it("is pressed on its line, or inside it where it is filled", () => {
    const s = box("rect");
    expect(shapeHit(s, { x: 10, y: 0.05 }, 0.1, PT, false)).toBe("line");
    expect(shapeHit(s, { x: 10, y: 5 }, 0.1, PT, false)).toBeNull();
    expect(shapeHit(s, { x: 10, y: 5 }, 0.1, PT, true)).toBe("inside");
    expect(shapeHit(s, { x: 30, y: 5 }, 0.1, PT, true)).toBeNull();
    // (a line's end is its line's: a 1 pt line, half a point either side of it)
    expect(shapeHit({ kind: "line", x0: 0, y0: 0, x1: 20, y1: 0, width: 1 }, { x: 19.95, y: 0.04 }, 0, PT, false)).toBe("line");
    expect(insidePolygon({ x: 0.5, y: 0.5 }, [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }])).toBe(true);
  });

  it("reaches as far as its line", () => {
    const b = shapeBounds(box("rect", { width: 1 }), PT);
    expect(b.y0).toBeCloseTo(-0.05);
    expect(b.x1).toBeCloseTo(20.05);
  });

  it("rounds a rectangle's corners as far as asked, never past half its shorter side - an ellipse's and a line's none", () => {
    expect(cornerRadius(box("rect"), PT)).toBe(0);
    expect(cornerRadius(box("rect", { radius: 9 }), PT)).toBeCloseTo(0.9);
    // (10 units tall: at most 5 round, its ends whole half circles)
    expect(cornerRadius(box("rect", { radius: 500 }), PT)).toBe(5);
    expect(cornerRadius(box("ellipse", { radius: 9 }), PT)).toBe(0);
    // (as *Box around these* rounds them: a fifth of a bond - 1.8 units here - less in a small box)
    expect(roundedPt(20, 10, PT)).toBeCloseTo((0.2 * 1.8) / PT);
    expect(roundedOfBondPt(PT)).toBeCloseTo((0.2 * 1.8) / PT);
    expect(roundedPt(2, 1, PT)).toBeCloseTo((1 * 0.18) / PT);
  });
});

describe("a shape drawn and changed", () => {
  it("is drawn between two corners - a square with Shift - or a line at steps of 15 degrees with it", () => {
    expect(drawnShape("rect", { x: 5, y: 5 }, { x: 0, y: 8 })).toEqual({ x0: 0, y0: 5, x1: 5, y1: 8 });
    expect(drawnShape("ellipse", { x: 0, y: 0 }, { x: 4, y: -2 }, true)).toEqual({ x0: 0, y0: -4, x1: 4, y1: 0 });
    const l = drawnShape("line", { x: 0, y: 0 }, { x: 10, y: 1 }, true);
    expect(l.y1).toBeCloseTo(0);
    expect(l.x1).toBeCloseTo(Math.hypot(10, 1));
  });

  it("is made larger or smaller by a corner or a side, the other staying - its proportions kept with Shift - and a line by its ends", () => {
    const s = box("rect");
    expect(reshaped(s, "x1y1", { x: 30, y: 30 }, 1)).toMatchObject({ x0: 0, y0: 0, x1: 30, y1: 30 });
    expect(reshaped(s, "x1y1", { x: 40, y: 12 }, 1, true)).toMatchObject({ x1: 40, y1: 20 });
    expect(reshaped(s, "x0", { x: 25, y: 99 }, 1)).toMatchObject({ x0: 19, x1: 20, y0: 0, y1: 10 });
    expect(reshaped({ kind: "line", x0: 0, y0: 0, x1: 5, y1: 0 }, "start", { x: -3, y: 4 }, 1)).toMatchObject({ x0: -3, y0: 4, x1: 5, y1: 0 });
    expect(handlesOf(box("rect"))).toHaveLength(8);
    expect(handlesOf({ kind: "line", x0: 0, y0: 0, x1: 1, y1: 1 })).toHaveLength(2);
  });

  it("moves whole, its corners as round; turned, a line's ends go round and a box stays upright", () => {
    expect(moved(box("rect", { radius: 4 }), { x: 2, y: 3 })).toEqual({ kind: "rect", x0: 2, y0: 3, x1: 22, y1: 13, radius: 4 });
    const t = turned(box("rect"), { x: 0, y: 0 }, Math.PI / 2);
    expect(t.x1 - t.x0).toBeCloseTo(20);
    expect((t.x0 + t.x1) / 2).toBeCloseTo(-5);
    expect((t.y0 + t.y1) / 2).toBeCloseTo(10);
    const l = turned({ kind: "line", x0: 0, y0: 0, x1: 10, y1: 0 }, { x: 0, y: 0 }, Math.PI / 2);
    expect(l.x1).toBeCloseTo(0);
    expect(l.y1).toBeCloseTo(10);
  });

  it("gives a pale fill of a colour toward white", () => {
    expect(tintOf("#317689", 0.25)).toBe("#ccdde2");
    expect(tintOf("#000000", 1)).toBe("#000000");
  });
});
