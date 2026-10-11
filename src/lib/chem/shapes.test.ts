import { describe, expect, it } from "vitest";
import {
  dashed,
  drawnShape,
  fillOutline,
  handlesOf,
  headsOf,
  insidePolygon,
  lineWidthOf,
  moved,
  outlineOf,
  reshaped,
  shapeBounds,
  shapeHit,
  strokePieces,
  strokeTriangles,
  tintOf,
  turned,
  wordsRoom,
  type ShapeGeometry,
} from "./shapes";

const PT = 0.1;
const box = (kind: ShapeGeometry["kind"], more: Partial<ShapeGeometry> = {}): ShapeGeometry => ({ kind, x0: 0, y0: 0, x1: 20, y1: 10, ...more });

describe("what a shape draws", () => {
  it("goes round a box, its corners square or rounded, and an ellipse smoothly", () => {
    expect(outlineOf(box("rect"), PT)).toEqual({ points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }], closed: true });
    const rounded = outlineOf(box("rounded"), PT).points;
    // (no corner itself: rounded off, the radius 9 points at most)
    expect(rounded.some((p) => p.x === 0 && p.y === 0)).toBe(false);
    expect(Math.min(...rounded.map((p) => p.x))).toBeCloseTo(0);
    expect(Math.max(...rounded.map((p) => p.y))).toBeCloseTo(10);
    const ellipse = outlineOf(box("ellipse"), PT).points;
    for (const p of ellipse) expect(((p.x - 10) / 10) ** 2 + ((p.y - 5) / 5) ** 2).toBeCloseTo(1);
  });

  it("gives a callout a tail from the side its tip lies beyond, clear of the corners, and none with its tip inside", () => {
    const below = outlineOf(box("callout", { tail: { x: 4, y: -6 } }), PT).points;
    expect(below).toContainEqual({ x: 4, y: -6 });
    // (its base on the bottom side, either side of it)
    const at = below.findIndex((p) => p.x === 4 && p.y === -6);
    expect(below[at - 1].y).toBeCloseTo(0);
    expect(below[at + 1].y).toBeCloseTo(0);
    expect(below[at - 1].x).toBeLessThan(below[at + 1].x);
    const right = outlineOf(box("callout", { tail: { x: 30, y: 5 } }), PT).points;
    const r = right.findIndex((p) => p.x === 30);
    expect(right[r - 1].x).toBeCloseTo(20);
    expect(outlineOf(box("callout", { tail: { x: 5, y: 5 } }), PT).points).not.toContainEqual({ x: 5, y: 5 });
  });

  it("stops an arrow's line short of its heads, a triangle at its end - and at its start, with two", () => {
    const arrow: ShapeGeometry = { kind: "arrow", x0: 0, y0: 0, x1: 20, y1: 0 };
    const o = outlineOf(arrow, PT);
    expect(o.closed).toBe(false);
    expect(o.points[0]).toEqual({ x: 0, y: 0 });
    expect(o.points[1].x).toBeLessThan(20);
    const [head] = headsOf(arrow, PT);
    expect(head[0]).toEqual({ x: 20, y: 0 });
    // (its back behind where the line stops: the line ends within it)
    expect(head[1].x).toBeLessThan(o.points[1].x);
    expect(headsOf({ ...arrow, heads: 2 }, PT)).toHaveLength(2);
    expect(outlineOf({ ...arrow, heads: 2 }, PT).points[0].x).toBeGreaterThan(0);
    expect(headsOf({ ...arrow, kind: "line" }, PT)).toEqual([]);
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

  it("makes a line as wide as its weight says, as triangles either side of it, its corners mitred", () => {
    expect(lineWidthOf({}, PT)).toBeCloseTo(0.1);
    expect(lineWidthOf({ weight: "thick" }, PT)).toBeCloseTo(0.2);
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
    // (an arrow's head is its line's)
    expect(shapeHit({ kind: "arrow", x0: 0, y0: 0, x1: 20, y1: 0 }, { x: 19.5, y: 0.05 }, 0, PT, false)).toBe("line");
    expect(insidePolygon({ x: 0.5, y: 0.5 }, [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }])).toBe(true);
  });

  it("reaches as far as its line, its heads and its tail", () => {
    const b = shapeBounds(box("callout", { tail: { x: 4, y: -6 } }), PT);
    expect(b.y0).toBeCloseTo(-6 - 0.05);
    expect(b.x1).toBeCloseTo(20.05);
  });

  it("holds its words about its middle, as wide as it is inside - an ellipse's within it - and a line none", () => {
    expect(wordsRoom(box("rect"), 1)).toEqual({ x: 10, y: 5, width: 18 });
    expect(wordsRoom(box("ellipse"), 1)!.width).toBeCloseTo(20 * Math.SQRT1_2 - 2);
    expect(wordsRoom({ kind: "arrow", x0: 0, y0: 0, x1: 1, y1: 0 }, 1)).toBeNull();
  });
});

describe("a shape drawn and changed", () => {
  it("is drawn between two corners - a square with Shift - or a line at steps of 15 degrees with it", () => {
    expect(drawnShape("rect", { x: 5, y: 5 }, { x: 0, y: 8 })).toEqual({ x0: 0, y0: 5, x1: 5, y1: 8 });
    expect(drawnShape("ellipse", { x: 0, y: 0 }, { x: 4, y: -2 }, true)).toEqual({ x0: 0, y0: -4, x1: 4, y1: 0 });
    const l = drawnShape("line", { x: 0, y: 0 }, { x: 10, y: 1 }, true);
    expect(l.y1).toBeCloseTo(0);
    expect(l.x1).toBeCloseTo(Math.hypot(10, 1));
    // (a callout's tail below it, to the left)
    const c = drawnShape("callout", { x: 0, y: 0 }, { x: 20, y: 10 });
    expect(c.tail!.y).toBeLessThan(0);
    expect(c.tail!.x).toBeLessThan(10);
  });

  it("is made larger or smaller by a corner or a side, the other staying - its proportions kept with Shift - and a line by its ends", () => {
    const s = box("rect");
    expect(reshaped(s, "x1y1", { x: 30, y: 30 }, 1)).toMatchObject({ x0: 0, y0: 0, x1: 30, y1: 30 });
    expect(reshaped(s, "x1y1", { x: 40, y: 12 }, 1, true)).toMatchObject({ x1: 40, y1: 20 });
    expect(reshaped(s, "x0", { x: 25, y: 99 }, 1)).toMatchObject({ x0: 19, x1: 20, y0: 0, y1: 10 });
    expect(reshaped({ kind: "line", x0: 0, y0: 0, x1: 5, y1: 0 }, "start", { x: -3, y: 4 }, 1)).toMatchObject({ x0: -3, y0: 4, x1: 5, y1: 0 });
    expect(reshaped(box("callout", { tail: { x: 0, y: -5 } }), "tail", { x: 30, y: 5 }, 1).tail).toEqual({ x: 30, y: 5 });
    expect(handlesOf(box("callout", { tail: { x: 0, y: -5 } })).map((h) => h.handle)).toContain("tail");
    expect(handlesOf({ kind: "arrow", x0: 0, y0: 0, x1: 1, y1: 1 })).toHaveLength(2);
  });

  it("moves whole, its tail with it; turned, a line's ends go round and a box stays upright", () => {
    expect(moved(box("callout", { tail: { x: 1, y: -1 } }), { x: 2, y: 3 })).toMatchObject({ x0: 2, y0: 3, x1: 22, y1: 13, tail: { x: 3, y: 2 } });
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
