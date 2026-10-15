import { describe, expect, it } from "vitest";
import { guided, nearOf, sidesLike, sizedLike, widthLike, type Box } from "./guides";

const box = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0, y0, x1, y1 });

describe("guides as things are moved", () => {
  it("line an edge or a middle up with another's within reach, and show a line from end to end of what lines up", () => {
    const moving = box(0, 0, 10, 4);
    const other = box(30, 20, 70, 30);
    // (moved so that its left edge is 0.3 off the other's left: it lines up there)
    const g = guided(moving, 30.3, 0, [other], 0.5);
    expect(g.dx).toBeCloseTo(30);
    expect(g.dy).toBe(0);
    // (from end to end of what lines up, and a dozen pixels - twice the reach - past each end)
    expect(g.lines).toEqual([{ x1: 30, y1: -1, x2: 30, y2: 31 }]);
    // (out of reach: as it was moved, nothing shown)
    const far = guided(moving, 31, 0, [other], 0.5);
    expect(far).toEqual({ dx: 31, dy: 0, lines: [], marks: [] });
    // (middles: its middle on the other's)
    const middle = guided(moving, 44.8, 23.1, [other], 0.5);
    expect(middle.dx).toBeCloseTo(45);
    expect(middle.dy).toBeCloseTo(23);
  });

  it("take the nearest of everything near, each way on its own, and keep to one way where asked", () => {
    const others = [box(20, 0, 30, 10), box(40, 40, 50, 60)];
    const g = guided(box(0, 0, 10, 10), 19.8, 40.2, others, 0.5);
    expect(g.dx).toBeCloseTo(20);
    expect(g.dy).toBeCloseTo(40);
    // (as wide as the first: all three of its places line up across; its top and bottom with the second's top and middle)
    expect(g.lines).toHaveLength(5);
    const across = guided(box(0, 0, 10, 10), 19.8, 40.2, others, 0.5, "x");
    expect(across.dy).toBeCloseTo(40.2);
  });

  it("make a space in a row the same as the one beside it, or halfway between two, and mark the spaces", () => {
    const row = [box(0, 0, 10, 10), box(20, 0, 30, 10)];
    // (10 apart already: put 9.7 after the second, it goes 10 after)
    const g = guided(box(0, 0, 10, 10), 39.7, 0, row, 0.5);
    expect(g.dx).toBeCloseTo(40);
    expect(g.marks).toEqual([
      { x1: 10, y1: 5, x2: 20, y2: 5 },
      { x1: 30, y1: 5, x2: 40, y2: 5 },
    ]);
    // (between two 30 apart, a box 10 wide: halfway, 10 either side)
    const between = guided(box(0, 0, 10, 10), 19.6, 0, [box(0, 0, 10, 10), box(40, 0, 50, 10)], 0.5);
    expect(between.dx).toBeCloseTo(20);
    expect(between.marks).toHaveLength(2);
  });

  it("are looked for among what is near", () => {
    expect(nearOf(box(0, 0, 10, 10), [box(12, 0, 20, 10), box(100, 0, 110, 10)], 20)).toEqual([box(12, 0, 20, 10)]);
  });
});

describe("guides as things are made larger or smaller", () => {
  it("take another's width or height, the proportions kept, and mark both", () => {
    const b = box(0, 0, 16, 9);
    const keep = (f: number) => box(0, 0, 16 * f, 9 * f);
    const s = sizedLike(b, 1.98, [box(50, 0, 82, 18)], 0.5, keep);
    expect(s.f).toBeCloseTo(2);
    expect(s.marks).toHaveLength(2);
    expect(sizedLike(b, 1.5, [box(50, 0, 82, 18)], 0.5, keep).f).toBe(1.5);
  });

  it("take another's width, as words are made wider", () => {
    const w = widthLike(box(0, 0, 19.8, 3), [box(0, 10, 20, 12), box(0, 20, 50, 22)], 0.5);
    expect(w.size).toBeCloseTo(20);
    expect(widthLike(box(0, 0, 30, 3), [box(0, 10, 20, 12)], 0.5).size).toBeNull();
  });

  it("take another's width by the side moved, and its height by the top or bottom, the sides across staying", () => {
    const others = [box(50, 0, 70, 30)];
    // (the right side dragged to 19.8 wide: 20, as the other is)
    expect(sidesLike(box(0, 0, 19.8, 10), { x: "x1" }, others, 0.5).box).toEqual(box(0, 0, 20, 10));
    // (a corner: the left side to 20 wide, the top to 30 tall)
    const corner = sidesLike(box(0.2, 0, 20, 29.7), { x: "x0", y: "y1" }, others, 0.5);
    expect(corner.box).toEqual(box(0, 0, 20, 30));
    expect(corner.marks).toHaveLength(4);
    // (nothing near that size: as it was)
    expect(sidesLike(box(0, 0, 12, 10), { x: "x1" }, others, 0.5).marks).toEqual([]);
  });
});
