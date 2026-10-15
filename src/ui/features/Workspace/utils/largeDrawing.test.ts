import { describe, expect, it } from "vitest";
import { ballSegmentsFor } from "./largeDrawing";

describe("a very large drawing's balls", () => {
  it("are given as many segments as their size on the screen wants: 32 from about 40 pixels across, down to 8 under about 8", () => {
    expect(ballSegmentsFor(60, 32)).toBe(32);
    expect(ballSegmentsFor(40, 32)).toBe(32);
    expect(ballSegmentsFor(39, 32)).toBe(24);
    expect(ballSegmentsFor(20, 32)).toBe(16);
    expect(ballSegmentsFor(10, 32)).toBe(12);
    expect(ballSegmentsFor(7.9, 32)).toBe(8);
    expect(ballSegmentsFor(1, 32)).toBe(8);
  });

  it("never more than the style has them", () => {
    expect(ballSegmentsFor(60, 16)).toBe(16);
    expect(ballSegmentsFor(1, 6)).toBe(6);
  });
});
