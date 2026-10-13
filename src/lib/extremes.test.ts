import { describe, expect, it } from "vitest";
import { boundsOf, least, middleOfPoints, most } from "./extremes";

describe("the least and the most of many numbers", () => {
  it("are those Math.min and Math.max give, for none, for NaN and for many", () => {
    expect([least([]), most([])]).toEqual([Infinity, -Infinity]);
    expect([least([3, -1, 2]), most([3, -1, 2])]).toEqual([-1, 3]);
    expect([least([1, NaN, 0]), most([1, NaN, 0])]).toEqual([NaN, NaN]);
    // (past what a call takes spread as its arguments: 65,536 in WebKit, about twice that here)
    const many = Array.from({ length: 150_000 }, (_, i) => (i * 7919) % 150_000);
    expect(() => Math.min(...many)).toThrow(RangeError);
    expect([least(many), most(many)]).toEqual([0, 149_999]);
  });

  it("give the box round many points, and its middle", () => {
    expect(boundsOf([])).toBeNull();
    expect(middleOfPoints([])).toBeNull();
    const pts = Array.from({ length: 150_000 }, (_, i) => ({ x: i % 400, y: Math.floor(i / 400) }));
    expect(boundsOf(pts)).toEqual({ x0: 0, y0: 0, x1: 399, y1: 374 });
    expect(middleOfPoints(pts)).toEqual({ x: 199.5, y: 187 });
  });
});
