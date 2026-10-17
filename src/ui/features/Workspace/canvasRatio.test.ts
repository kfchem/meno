import { describe, expect, it } from "vitest";
import { canvasRatio } from "./canvasRatio";

describe("how finely the canvas is drawn", () => {
  it("is twice, or once, whatever the screen", () => {
    for (const screen of [1, 1.25, 1.5, 2, 3]) {
      expect(canvasRatio(2, screen)).toBe(2);
      expect(canvasRatio(1, screen)).toBe(1);
    }
  });

  it("is as the screen shows things, matching it - never finer than twice, nor coarser than once", () => {
    expect(canvasRatio("display", 1)).toBe(1);
    expect(canvasRatio("display", 1.25)).toBe(1.25);
    expect(canvasRatio("display", 1.5)).toBe(1.5);
    expect(canvasRatio("display", 2)).toBe(2);
    expect(canvasRatio("display", 3)).toBe(2);
    expect(canvasRatio("display", 0.5)).toBe(1);
    expect(canvasRatio("display", Number.NaN)).toBe(1);
  });
});
