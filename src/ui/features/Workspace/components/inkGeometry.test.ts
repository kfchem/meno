import { describe, expect, it } from "vitest";
import { MARKER_OPACITY } from "../../../../lib/chem/ink";
import { pageInkLook } from "./inkGeometry";

describe("writing on a PDF's page, as drawn", () => {
  it("is see-through always, as the page's pictures are - a pen's too - so that it is drawn after them, over them", () => {
    expect(pageInkLook("pen", 1)).toEqual({ opacity: 1, transparent: true, depthWrite: false });
    expect(pageInkLook("marker", 1).opacity).toBe(MARKER_OPACITY);
    // (fading with its page)
    expect(pageInkLook("pen", 0.5).opacity).toBe(0.5);
  });
});
