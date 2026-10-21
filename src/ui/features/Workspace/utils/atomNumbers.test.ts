import { describe, expect, it } from "vitest";
import { atomNumbersOf, digitsOf, numberHeight, numberPlaces, numbersLeftOut, NUMBER_HEIGHT, NUMBER_LEAST_PX } from "./atomNumbers";

describe("atom numbers", () => {
  it("are each atom's place, counted from 1, or its atom-map number where it has one", () => {
    const m = { atoms: [{ el: "C", x: 0, y: 0, z: 0, map: 3 }, { el: "O", x: 1, y: 0, z: 0 }] };
    expect([...atomNumbersOf(m, "order")]).toEqual([1, 2]);
    expect([...atomNumbersOf(m, "map")]).toEqual([3, 0]);
    expect([0, 7, 42, 999, 1000, 10000].map(digitsOf)).toEqual([0, 1, 2, 3, 4, 0]);
  });

  it("stand as high as a share of the ball, never past a height of their own, and narrower with more digits", () => {
    expect(numberHeight(1, 0.3)).toBe(NUMBER_HEIGHT);
    expect(numberHeight(1, 1.7)).toBeLessThan(NUMBER_HEIGHT);
    expect(numberHeight(4, 0.3)).toBeLessThan(numberHeight(2, 0.3));
  });
});

describe("where a number goes on its ball", () => {
  const placed = (centres: number[], radii: number[]) => {
    const out = new Float32Array(3 * radii.length);
    numberPlaces(centres, radii, radii.map(() => 0.6), radii.map(() => 2), out);
    return [...out].map((v) => Math.round(v * 100) / 100);
  };

  it("is its middle where the ball is seen whole", () => {
    expect(placed([0, 0, 0, 5, 0, 0], [1, 1])).toEqual([0, 0, 1, 0, 0, 1]);
  });

  it("is in the part not behind a ball in front of it, smaller where that part is small, and none where it is hidden", () => {
    // (a ball in front over its left half: the number to the right; the front ball's own in its middle)
    const [x, y, share, ...front] = placed([0, 0, 0, -1, 0, 1], [1, 1]);
    expect(x).toBeGreaterThan(0.2);
    expect(Math.abs(y)).toBeLessThan(0.3);
    expect(share).toBeGreaterThan(0);
    expect(front).toEqual([0, 0, 1]);
    // (a larger ball right in front of it: none)
    expect(placed([0, 0, 0, 0, 0, 3], [1, 2]).slice(0, 3)).toEqual([0, 0, 0]);
  });
});

describe("a number beside a stick", () => {
  it("is moved off a stick seen in front of its ball", () => {
    const out = new Float32Array(6);
    // (a stick from an atom far in front down across the ball's left side)
    numberPlaces([0, 0, 0, -0.4, 0, 3], [1, 0], [0.6, 0.6], [2, 0], out, { bonds: [{ a1: 1, a2: 1 }], r: 0.35 });
    expect(out[0]).toBeGreaterThan(0.1);
  });
});

describe("the numbers a picture leaves out", () => {
  it("counts those the balls' shader leaves out: under three quarters of the least height, or squeezed under 0.4 of their size", () => {
    // (each at 0.78 of its ball's radius, times the share it has room for, drawn 0.7 of that high, against 0.75 of 6, 4.5:
    // a ball of 10 pixels, 5.46 - drawn; of 8, 4.37 - left out; squeezed to 0.39 - left out; to 0.6 on a ball of 20, 6.55 - drawn)
    const h = [0.78, 0.78, 0.78, 0.78, 0.78];
    const shares = [1, 1, 0.39, 0.6, 1];
    const radii = [10, 8, 10, 20, 10];
    const digits = [2, 2, 2, 2, 0];
    expect(NUMBER_LEAST_PX).toBe(6);
    // (left out: the small ball's, and the squeezed one's; not the one without a number)
    expect(numbersLeftOut(h, shares, radii, digits, NUMBER_LEAST_PX)).toBe(2);
    // (an atom the look leaves out - no ball - is none of them)
    expect(numbersLeftOut([0.78], [1], [0], [1], NUMBER_LEAST_PX)).toBe(0);
  });
});
