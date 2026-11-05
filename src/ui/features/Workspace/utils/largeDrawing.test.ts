import { describe, expect, it } from "vitest";
import { BALLS_SETTLE_MS, ballSegmentsFor, ballSegmentsNext, outlineSegments } from "./largeDrawing";

describe("a molecule's balls, by their size on the screen", () => {
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

describe("the balls' segments as the zoom changes", () => {
  it("go up at once as the balls grow on the screen", () => {
    expect(ballSegmentsNext(32, 16, 0)).toEqual({ now: 32 });
  });

  it("go down only once the zoom has stayed, as long as it has before", () => {
    expect(ballSegmentsNext(12, 32, 0)).toEqual({ waitMs: BALLS_SETTLE_MS });
    expect(ballSegmentsNext(12, 32, BALLS_SETTLE_MS - 50)).toEqual({ waitMs: 50 });
    expect(ballSegmentsNext(12, 32, BALLS_SETTLE_MS)).toEqual({ now: 12 });
  });

  it("stay where they are wanted", () => {
    expect(ballSegmentsNext(24, 24, 0)).toBeNull();
  });

  it("are fewer for small balls, and never more than the style's, on any canvas", () => {
    for (const most of [6, 8, 16, 32, 48]) {
      for (const px of [0.5, 4, 8, 12, 20, 30, 39, 40, 80, 400]) {
        const n = ballSegmentsFor(px, most);
        expect(n).toBeLessThanOrEqual(most);
        expect(n).toBeLessThanOrEqual(ballSegmentsFor(px * 2, most));
      }
    }
    expect(ballSegmentsFor(10, 32)).toBeLessThan(32);
  });
});

describe("the line round the balls", () => {
  it("is as fine as the balls up to the most atoms, never finer", () => {
    expect(outlineSegments(32, 100, 2000, 16)).toEqual([32, 32]);
    expect(outlineSegments(12, 100, 2000, 16)).toEqual([12, 12]);
  });

  it("is the coarse one past them, unless the balls are coarser", () => {
    expect(outlineSegments(32, 3000, 2000, 16)).toEqual([16, 8]);
    expect(outlineSegments(12, 3000, 2000, 16)).toEqual([12, 12]);
  });
});
