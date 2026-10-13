import { describe, expect, it } from "vitest";
import { greatest, least, pushAll } from "./lists";

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
    // (a million: past what any thread's stack takes spread into one call)
    const many = Array.from({ length: 1_000_000 }, (_, i) => i);
    expect(() => Math.max(...many)).toThrow(RangeError);
    expect(greatest(many)).toBe(999_999);
    expect(least(many)).toBe(0);
    expect(pushAll([], many)).toHaveLength(1_000_000);
  });
});
