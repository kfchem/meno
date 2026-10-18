import { describe, expect, it } from "vitest";
import { atomNumbersOf, digitsOf, numberHeight, numberPlaces, NUMBER_HEIGHT } from "./atomNumbers";

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
