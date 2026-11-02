import { describe, expect, it } from "vitest";
import { pointerOver } from "./pageEvents";

describe("where a pointer is over the page's canvas", () => {
  // (a canvas with the column beside it on its left, below the tabs)
  const canvas = { left: 320, top: 40, width: 1024, height: 728 };

  it("is worked out from the screen and the canvas: corners at -1 and 1, up positive", () => {
    expect(pointerOver(320, 40, canvas)).toEqual([-1, 1]);
    expect(pointerOver(1344, 768, canvas)).toEqual([1, -1]);
    expect(pointerOver(832, 404, canvas)).toEqual([0, 0]);
  });

  it("is the same at any screen's pixel ratio: a move Meno makes, whose offset Chromium gives divided by it, is found where the pointer is", () => {
    // (the pointer at 470, 312 on the screen: where a move the system made and one Meno made both find it - an offset
    //  divided by a ratio of 2, as Chromium gives the latter, would be another place)
    const [x, y] = pointerOver(470, 312, canvas);
    expect(x).toBeCloseTo(((470 - 320) / 1024) * 2 - 1, 12);
    expect(y).toBeCloseTo(-((312 - 40) / 728) * 2 + 1, 12);
    expect([x, y]).not.toEqual(pointerOver(470 / 2, 312 / 2, canvas));
  });

  it("is the middle where the canvas has no size yet", () => {
    expect(pointerOver(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual([0, 0]);
  });
});
