import { describe, expect, it } from "vitest";
import { boundsOf, greatest, least, middleOfPoints, pushAll } from "./lists";

describe("long lists", () => {
  it("give their least and greatest as Math.min and Math.max do", () => {
    expect(least([3, -1, 2])).toBe(-1);
    expect(greatest([3, -1, 2])).toBe(3);
    expect(least([])).toBe(Infinity);
    expect(greatest([])).toBe(-Infinity);
    expect(least([1, NaN])).toBeNaN();
    expect(greatest(new Set([4, 9]))).toBe(9);
  });

  it("are put on the end of another in order, as a spread push puts them", () => {
    const into = [1];
    expect(pushAll(into, [2, 3])).toBe(into);
    expect(into).toEqual([1, 2, 3]);
  });

  it("hold more than one call's arguments can be", () => {
    // (a million: more than a call's arguments can be on a worker's stack)
    const many = Array.from({ length: 1_000_000 }, (_, i) => i);
    expect(greatest(many)).toBe(999_999);
    expect(least(many)).toBe(0);
    expect(pushAll([], many)).toHaveLength(1_000_000);
  });
});

describe("many points", () => {
  it("give the box round them, and its middle", () => {
    expect(boundsOf([])).toBeNull();
    expect(middleOfPoints([])).toBeNull();
    // (past what a call takes spread as its arguments: 65,536 in WebKit, about twice that here)
    const pts = Array.from({ length: 150_000 }, (_, i) => ({ x: i % 400, y: Math.floor(i / 400) }));
    expect(boundsOf(pts)).toEqual({ x0: 0, y0: 0, x1: 399, y1: 374 });
    expect(middleOfPoints(pts)).toEqual({ x: 199.5, y: 187 });
  });
});
