import { describe, expect, it } from "vitest";
import { EASE, EASE_LEAVE, eased } from "./motion";

describe("eased: a cubic Bézier easing curve, as CSS's cubic-bezier()", () => {
  it("runs from naught to one, on its way all the time, and as CSS has EASE and EASE_LEAVE at their middles", () => {
    for (const curve of [EASE, EASE_LEAVE]) {
      expect([eased(curve, 0), eased(curve, 1)]).toEqual([0, 1]);
      const ys = Array.from({ length: 11 }, (_, k) => eased(curve, k / 10));
      expect(ys.every((y, k) => k === 0 || y >= ys[k - 1])).toBe(true);
    }
    // (quick out of the start: past three quarters at half its time; the leaving one even, a half at half)
    expect(eased(EASE, 0.5)).toBeGreaterThan(0.75);
    expect(eased(EASE_LEAVE, 0.5)).toBeCloseTo(0.5, 3);
  });
});
