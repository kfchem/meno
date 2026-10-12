import { describe, expect, it } from "vitest";
import { ringUnder } from "./ringUnder";

// (a view zoomed out: 10 pixels to the page's unit, the page's y up and the screen's down)
const onScreen = (c: { x: number; y: number }) => ({ x: 400 + c.x * 10, y: 300 - c.y * 10 });
const benzene = { x: 0, y: 0, r: 1.2, key: "1,2,3,4,5,6" };
const other = { x: 6, y: 0, r: 1.2, key: "7,8,9,10,11,12" };

describe("the ring whose circle a press is for", () => {
  it("is the nearest whose middle is within reach on the screen", () => {
    expect(ringUnder([benzene, other], { x: 405, y: 300 }, onScreen, false)).toBe(benzene);
    expect(ringUnder([benzene, other], { x: 445, y: 300 }, onScreen, false)).toBe(other);
    expect(ringUnder([benzene, other], { x: 400, y: 200 }, onScreen, false)).toBeNull();
  });

  it("is none while an atom or a bond is under the pointer - zoomed out, a ring's atoms lie within reach of its middle, and a press on one is the atom's", () => {
    // (a ring atom 1.8 units from the middle: 18 pixels, within 40)
    expect(ringUnder([benzene], { x: 418, y: 300 }, onScreen, true)).toBeNull();
    expect(ringUnder([benzene], { x: 418, y: 300 }, onScreen, false)).toBe(benzene);
  });
});
