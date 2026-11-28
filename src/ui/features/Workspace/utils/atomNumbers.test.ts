import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { atomGlyphsOf, atomNumbersOf, glyphCode, glyphsWidth, PRIME_WIDTH, SUP_SIZE, numberHeight, numberPlaces, numbersLeftOut, NUMBER_HEIGHT, NUMBER_LEAST_PX, ballNumberUniforms, placesViewKey } from "./atomNumbers";

describe("atom numbers", () => {
  it("are each atom's place, counted from 1, or its atom-map number where it has one", () => {
    const m = { atoms: [{ el: "C", x: 0, y: 0, z: 0, map: 3 }, { el: "O", x: 1, y: 0, z: 0 }] };
    expect([...atomNumbersOf(m, "order")]).toEqual([1, 2]);
    expect([...atomNumbersOf(m, "map")]).toEqual([3, 0]);
  });

  it("stand as high as a share of the ball, never past a height of their own, and narrower with more digits", () => {
    expect(numberHeight(1, 0.3)).toBe(NUMBER_HEIGHT);
    expect(numberHeight(1, 1.7)).toBeLessThan(NUMBER_HEIGHT);
    expect(numberHeight(4, 0.3)).toBeLessThan(numberHeight(2, 0.3));
  });
});

describe("where a number goes on its ball", () => {
  const placed = (centres: number[], radii: number[]) => {
    const out = new Float32Array(3 * radii.length);
    numberPlaces(centres, radii, radii.map(() => 0.6), radii.map(() => 2), out);
    return [...out].map((v) => Math.round(v * 100) / 100);
  };

  it("is its middle where the ball is seen whole", () => {
    expect(placed([0, 0, 0, 5, 0, 0], [1, 1])).toEqual([0, 0, 1, 0, 0, 1]);
  });

  it("is in the part not behind a ball in front of it, smaller where that part is small, and none where it is hidden", () => {
    // (a ball in front over its left half: the number to the right; the front ball's own in its middle)
    const [x, y, share, ...front] = placed([0, 0, 0, -1, 0, 1], [1, 1]);
    expect(x).toBeGreaterThan(0.2);
    expect(Math.abs(y)).toBeLessThan(0.3);
    expect(share).toBeGreaterThan(0);
    expect(front).toEqual([0, 0, 1]);
    // (a larger ball right in front of it: none)
    expect(placed([0, 0, 0, 0, 0, 3], [1, 2]).slice(0, 3)).toEqual([0, 0, 0]);
  });
});

describe("a number beside a stick", () => {
  it("is moved off a stick seen in front of its ball", () => {
    const out = new Float32Array(6);
    // (a stick from an atom far in front down across the ball's left side)
    numberPlaces([0, 0, 0, -0.4, 0, 3], [1, 0], [0.6, 0.6], [2, 0], out, { bonds: [{ a1: 1, a2: 1 }], r: 0.35 });
    expect(out[0]).toBeGreaterThan(0.1);
  });
});

describe("the numbers a picture leaves out", () => {
  it("counts those the balls' shader leaves out: under three quarters of the least height, or squeezed under 0.4 of their size", () => {
    // (each at 0.78 of its ball's radius, times the share it has room for, drawn 0.7 of that high, against 0.75 of 6, 4.5:
    // a ball of 10 pixels, 5.46 - drawn; of 8, 4.37 - left out; squeezed to 0.39 - left out; to 0.6 on a ball of 20, 6.55 - drawn)
    const h = [0.78, 0.78, 0.78, 0.78, 0.78];
    const shares = [1, 1, 0.39, 0.6, 1];
    const radii = [10, 8, 10, 20, 10];
    const digits = [2, 2, 2, 2, 0];
    expect(NUMBER_LEAST_PX).toBe(6);
    // (left out: the small ball's, and the squeezed one's; not the one without a number)
    expect(numbersLeftOut(h, shares, radii, digits, NUMBER_LEAST_PX)).toBe(2);
    // (an atom the look leaves out - no ball - is none of them)
    expect(numbersLeftOut([0.78], [1], [0], [1], NUMBER_LEAST_PX)).toBe(0);
  });
});

describe("a number on a ball as its glyphs: digits, a locant's letters, primes and superscript (part 16a)", () => {
  it("writes a number as its digits, as wide as they are many, and none past four", () => {
    expect([0, 7, 42, 999, 1000, 10000].map((n) => glyphsWidth(glyphCode(n)))).toEqual([0, 1, 2, 3, 4, 0]);
  });

  it("writes a locant as it is shown: 4a two cells, 1' a cell and a prime, 3a with its superscript 1 smaller", () => {
    expect(glyphsWidth(glyphCode(9, { base: "4a" }))).toBe(2);
    expect(glyphsWidth(glyphCode(7, { base: "1'" }))).toBeCloseTo(1 + PRIME_WIDTH, 9);
    expect(glyphsWidth(glyphCode(12, { base: "1''" }))).toBeCloseTo(1 + 2 * PRIME_WIDTH, 9);
    expect(glyphsWidth(glyphCode(15, { base: "3a", sup: "1" }))).toBeCloseTo(2 + SUP_SIZE, 9);
    expect(glyphsWidth(glyphCode(3, { base: "1", sup: "2" }))).toBeCloseTo(1 + SUP_SIZE, 9);
    // (each text its own code: none taken for another, nor for a number)
    const codes = [glyphCode(9, { base: "4a" }), glyphCode(9, { base: "8a" }), glyphCode(9, { base: "4b" }), glyphCode(9, { base: "1'" }), glyphCode(9, { base: "1", sup: "2" }), glyphCode(9, { base: "12" }), glyphCode(9)];
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("writes the number where its text has a glyph a ball does not draw, or more than four", () => {
    expect(glyphCode(11, { base: "10g" })).toBe(glyphCode(11));
    expect(glyphCode(11, { base: "12a'", sup: "1" })).toBe(glyphCode(11));
    expect(glyphCode(11, { base: "4a", sup: "x" })).toBe(glyphCode(11));
    expect(glyphCode(0, { base: "4a" })).toBe(0);
  });

  it("holds every code exactly in a float, as the ball's attribute is", () => {
    const code = glyphCode(9999, { base: "9f'", sup: "9" });
    expect(Math.fround(code)).toBe(code);
  });

  it("gives a molecule's atom-map numbers its texts in every frame, by number; the order's numbers none", () => {
    const m = { atoms: [{ el: "C", x: 0, y: 0, z: 0, map: 9 }, { el: "C", x: 1, y: 0, z: 0, map: 1 }], mapFrames: [[1, 9]], mapTexts: [[9, { base: "4a" }]] as [number, { base: string }][] };
    expect([...atomGlyphsOf(m, "map")]).toEqual([glyphCode(9, { base: "4a" }), glyphCode(1)]);
    expect([...atomGlyphsOf(m, "map", 1)]).toEqual([glyphCode(1), glyphCode(9, { base: "4a" })]);
    expect([...atomGlyphsOf(m, "order")]).toEqual([glyphCode(1), glyphCode(2)]);
  });
});

describe("atom numbers on the balls on the page", () => {
  it("have no least height there: drawn at any size, scaled with the zoom (a picture sets its own)", () => {
    expect(ballNumberUniforms().least.value).toBe(0);
  });
});

describe("where the numbers go, as the page zooms and pans", () => {
  // (three made-up balls, hiding some of each other as seen)
  const centres = [0, 0, 0, 0.5, 0.1, 0.4, -0.3, 0.45, 0.8];
  const radii = [0.6, 0.5, 0.55];
  const heights = [0.78, 0.78, 0.78];
  const digits = [1, 1, 1];
  const at = (k: number, dx: number, dy: number, dz: number) => {
    const out = new Float32Array(9);
    numberPlaces(
      centres.map((c, i) => c * k + [dx, dy, dz][i % 3]),
      radii.map((r) => r * k),
      heights,
      digits,
      out,
    );
    return [...out];
  };

  it("stand where they stood on their balls, the molecule moved and scaled as a zoom moves and scales it", () => {
    const here = at(1, 0, 0, 0);
    expect(here.some((v, i) => i % 3 !== 2 && v !== 0)).toBe(true);
    for (const [k, x, y, z] of [
      [2, 0, 0, 0],
      [0.5, 3, -2, -7],
      [1.7, -0.25, 0.5, 1],
    ])
      at(k, x, y, z).forEach((v, i) => expect(v).toBeCloseTo(here[i], 6));
  });

  it("are worked out again as the molecule turns, not as its view is moved or scaled", () => {
    const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, -0.9, 0.3));
    const view = (k: number, x: number, y: number, z: number, q = turn) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(k, k, k));
    const key = placesViewKey(view(1, 0, 0, -5));
    expect(placesViewKey(view(1.06, 0.3, -0.2, -5))).toBe(key);
    expect(placesViewKey(view(40, -12, 8, -9))).toBe(key);
    const turned = turn.clone().premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.01));
    expect(placesViewKey(view(1, 0, 0, -5, turned))).not.toBe(key);
    // (a mirror image is not the molecule turned)
    expect(placesViewKey(new THREE.Matrix4().makeScale(1, 1, -1).multiply(view(1, 0, 0, -5)))).not.toBe(key);
  });
});
