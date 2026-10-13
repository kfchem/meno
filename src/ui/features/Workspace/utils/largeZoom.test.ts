import { describe, expect, it } from "vitest";
import type { LayoutOptions } from "../../../../lib/chem/layout2d";
import { LARGE_ATOMS } from "./largeDrawing";
import { lineWidening, zoomedLarge } from "./largeZoom";

// (lines 0.05 wide in the drawing's units, never under a pixel on the screen)
const opts = { units: "world", lineWidthPx: 0.05, minLinePx: 1 } as LayoutOptions;

describe("a very large drawing as the view zooms", () => {
  it("is one past the mark a very large drawing in 3D is drawn lighter at", () => {
    expect(zoomedLarge(LARGE_ATOMS)).toBe(false);
    expect(zoomedLarge(LARGE_ATOMS + 1)).toBe(true);
  });

  it("keeps its lines as wide as a layout at the view's zoom would have them, laid out at another", () => {
    // (laid out where they are their own width, 5 px, and seen at 2.5 px: as they are)
    expect(lineWidening(opts, 100, 100)).toBe(1);
    expect(lineWidening(opts, 100, 50)).toBeCloseTo(1, 12);
    // (laid out held at a pixel, at zoom 10, and zoomed out to 5: twice as wide in the drawing, still a pixel)
    expect(lineWidening(opts, 10, 5)).toBeCloseTo(2, 12);
    // (and zoomed in to 40, where they are their own width again, 2 px: half as wide as held)
    expect(lineWidening(opts, 10, 40)).toBeCloseTo(0.5, 12);
  });
});
