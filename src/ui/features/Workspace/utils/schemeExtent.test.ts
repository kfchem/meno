import { describe, expect, it } from "vitest";
import { schemeExtent } from "./schemeExtent";

describe("what a scheme's arrows and signs take on the page", () => {
  it("is the box round each arrow's ends and corners and each sign, half a letter wider all round - none, with none", () => {
    const b = schemeExtent([{ x: 5, y: 0, angle: 0, length: 4, corners: [{ along: 0.5, across: 3 }] }], [{ x: -2, y: 1 }], 1);
    expect(b).toEqual({ x0: -2.5, y0: -0.5, x1: 7.5, y1: 3.5 });
    expect(schemeExtent([], [], 1)).toBeNull();
  });
});
