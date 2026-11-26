import { describe, expect, it } from "vitest";
import { inHalf, isMatte, matteHalves, over } from "./matte";

describe("a film on a transparent background, its picture and its alpha", () => {
  it("are read from the upper half and the lower where the alpha lies below", () => {
    const { colour, alpha, inset } = matteHalves("below", 64, 128);
    // (the middle of the film: the middle of each half)
    expect(inHalf(colour, inset, 0.5, 0.5)).toEqual([0.5, 0.75]);
    expect(inHalf(alpha, inset, 0.5, 0.5)).toEqual([0.5, 0.25]);
    // (the film's top edge: half a pixel in from the top of the texture; its bottom edge: half a pixel above the halves' line)
    expect(inHalf(colour, inset, 0, 1)).toEqual([0.5 / 64, 1 - 0.5 / 128]);
    expect(inHalf(alpha, inset, 0, 1)[1]).toBeCloseTo(0.5 - 0.5 / 128, 12);
    expect(inHalf(colour, inset, 0, 0)[1]).toBeCloseTo(0.5 + 0.5 / 128, 12);
  });

  it("are read from the left half and the right where the alpha lies to the right", () => {
    const { colour, alpha, inset } = matteHalves("right", 128, 64);
    expect(inHalf(colour, inset, 0.5, 0.5)).toEqual([0.25, 0.5]);
    expect(inHalf(alpha, inset, 0.5, 0.5)).toEqual([0.75, 0.5]);
    // (never across the line between the halves: the picture's right edge half a pixel short of it, the alpha's left edge half a pixel past it)
    expect(inHalf(colour, inset, 1, 0.5)[0]).toBeCloseTo(0.5 - 0.5 / 128, 12);
    expect(inHalf(alpha, inset, 0, 0.5)[0]).toBeCloseTo(0.5 + 0.5 / 128, 12);
  });

  it("lays a pixel over white and over black with no fringe: as its colour, not multiplied, laid over by its alpha", () => {
    // (a red of 230, 51, 26 at half alpha: what the film for the page holds, its colour multiplied - 115, 26, 13 - and its alpha 128)
    const red = [230, 51, 26].map((c) => c / 255);
    const a = 128 / 255;
    const held = red.map((c) => Math.round(c * a * 255) / 255);
    for (const under of [[1, 1, 1], [0, 0, 0], [0.12, 0.14, 0.17]]) {
      const straight = red.map((c, i) => c * a + (1 - a) * under[i]);
      over(held, a, under).forEach((c, i) => expect(Math.abs(c - straight[i]) * 255).toBeLessThan(0.51));
    }
    // (where the alpha is nought the page is untouched; where it is whole, the colour alone)
    expect(over([0, 0, 0], 0, [0.3, 0.4, 0.5])).toEqual([0.3, 0.4, 0.5]);
    expect(over(red, 1, [0.3, 0.4, 0.5])).toEqual(red);
  });

  it("is said only as below or right", () => {
    expect([isMatte("below"), isMatte("right"), isMatte("left"), isMatte(undefined)]).toEqual([true, true, false, false]);
  });
});
