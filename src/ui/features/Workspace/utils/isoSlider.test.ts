import { describe, expect, it } from "vitest";
import { isoBounds, isoOf, ISO_STEPS, sliderOf } from "./isoSlider";

describe("a surface's isovalue slider", () => {
  it("goes between an orbital's and a density's values, as before, for those", () => {
    expect(isoBounds()).toEqual({ least: 1e-4, most: 0.5 });
    expect(isoBounds(0.05)).toEqual({ least: 1e-4, most: 0.5 });
  });

  it("reaches round an NCI surface's reduced gradient: drawn at 0.5, it is not at its top, and goes up to 2", () => {
    const b = isoBounds(0.5);
    expect(b.most).toBe(2);
    expect(sliderOf(0.5, b)).toBeLessThan(ISO_STEPS);
    expect(isoOf(ISO_STEPS, b)).toBeCloseTo(2);
    expect(isoOf(sliderOf(0.3, b), b)).toBeCloseTo(0.3, 2);
  });
});
