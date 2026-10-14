import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH } from "../../../lib/chem/acs";
import { ACS_1996, STYLE_PRESETS, WILEY } from "../../../lib/chem/style";
import { editorLayoutOptions, maxFitZoom, startingZoom } from "./layoutOptions";

describe("startingZoom", () => {
  it("shows a bond two and a half times as long as it prints", () => {
    // ACS 1996's 14.4 pt bond prints 19.2 px long, so comes out at 48 px
    expect(startingZoom(ACS_1996) * NOMINAL_BOND_LENGTH).toBeCloseTo(48, 6);
    // a longer bond in the style, a longer bond on the canvas
    expect(startingZoom(WILEY)).toBeGreaterThan(startingZoom(ACS_1996));
  });

  it("lets a fit zoom in three times as far, and no further", () => {
    expect(maxFitZoom(ACS_1996) / startingZoom(ACS_1996)).toBeCloseTo(3, 9);
  });
});

describe("the layout's options of the style alone", () => {
  it("give the slides, the writing and the shapes what the drawing's layout gives them", () => {
    // (useStyleOptions: what those layers take - the type, the ink, a point's size - comes of the style, whatever the drawing's rings)
    for (const { style } of STYLE_PRESETS) {
      const own = editorLayoutOptions(style);
      const drawn = editorLayoutOptions(style, { aromaticCircle: { enabled: new Set(["1,2,3,4,5,6"]) }, ringFills: { "1,2,3,4,5,6": "#ff0000" } });
      expect([own.fontFamily, own.bondColor, own.pointPx]).toEqual([drawn.fontFamily, drawn.bondColor, drawn.pointPx]);
      expect(own.pointPx).toBeGreaterThan(0);
    }
  });
});
