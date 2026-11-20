/**
 * The edges held beside the new rules of a picture read (lib/figure/tracedRead, trace): the edges the tests of those rules leave open - a
 * carbon of three bonds is no carbon in line, nor a carbon with a label; a small piece with a label beside no larger one is not said; a
 * patch near a structure's line, a V, an equals sign are lines, not a letter; the PDF's letters over a picture lie where the picture is
 * put. (Found in review.)
 */
import { describe, expect, it } from "vitest";
import type { Pixels } from "./inkFit";
import type { GlyphShape } from "./glyphs";
import { glyphShape } from "./glyphs";
import { tracePicture, type Traced } from "./trace";
import { inLineCarbons, readTracedPicture, tinyPieces } from "./tracedRead";
import type { ReadAtom, ReadBond } from "./read";

type Pt = [number, number];
type Shape = (x: number, y: number) => boolean;
const line = (p: Pt, q: Pt, w: number): Shape => (x, y) => {
  const d = [q[0] - p[0], q[1] - p[1]];
  const t = Math.min(Math.max(((x - p[0]) * d[0] + (y - p[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1]), 0), 1);
  return Math.hypot(x - (p[0] + t * d[0]), y - (p[1] + t * d[1])) <= w / 2;
};
function picture(width: number, height: number, shapes: Shape[]): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let n = 0;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (shapes.some((s) => s(x + (i + 0.5) / 4, y + (j + 0.5) / 4))) n++;
      const v = Math.round(255 * (1 - n / 16));
      data.set([v, v, v, 255], 4 * (y * width + x));
    }
  return { width, height, data };
}
function hexagon(c: Pt, bond: number): Pt[] {
  return Array.from({ length: 6 }, (_, k) => [c[0] + bond * Math.sin((k * Math.PI) / 3), c[1] - bond * Math.cos((k * Math.PI) / 3)] as Pt);
}
const traced = (t: Traced | { none: string }): Traced => {
  if ("none" in t) throw new Error(t.none);
  return t;
};
// (the typeface of the tests of the rule: a 7, a 1 with its flag, an l, a minus - and an equals sign, two bars)
const FACE: Record<string, Pt[][]> = {
  "7": [[[0.05, -0.72], [0.5, -0.72], [0.5, -0.65], [0.23, 0], [0.13, 0], [0.4, -0.63], [0.05, -0.63]]],
  "1": [[[0.2, -0.72], [0.28, -0.72], [0.28, 0], [0.19, 0], [0.19, -0.58], [0.06, -0.5], [0.06, -0.59]]],
  l: [[[0.07, -0.72], [0.16, -0.72], [0.16, 0], [0.07, 0]]],
  "-": [[[0.05, -0.3], [0.5, -0.3], [0.5, -0.24], [0.05, -0.24]]],
  "=": [[[0.05, -0.4], [0.5, -0.4], [0.5, -0.34], [0.05, -0.34]], [[0.05, -0.22], [0.5, -0.22], [0.5, -0.16], [0.05, -0.16]]],
};
const KNOWN: GlyphShape[] = Object.entries(FACE).map(([c, parts]) => glyphShape(c, parts.map((ps) => ps.map(([x, y]) => ({ x, y }))), 0.72));
const filled = (parts: Pt[][], at: Pt, size: number): Shape => (x, y) =>
  parts.some((ps0) => {
    const ps = ps0.map(([u, v]): Pt => [at[0] + u * size, at[1] + v * size]);
    let inside = false;
    for (let i = 0, j = ps.length - 1; i < ps.length; j = i++)
      if (ps[i][1] > y !== ps[j][1] > y && x < ((ps[j][0] - ps[i][0]) * (y - ps[i][1])) / (ps[j][1] - ps[i][1]) + ps[i][0]) inside = !inside;
    return inside;
  });

describe("a carbon in line, said only of two single bonds", () => {
  const atom = (x: number, y: number, more: Partial<ReadAtom> = {}): ReadAtom => ({ x, y, ...more });
  const bond = (a: number, b: number): ReadBond => ({ a, b, order: 1 });
  it("is not said of a carbon of three bonds, two of them in line - a branch on a straight chain", () => {
    const read = { atoms: [atom(0, 0), atom(-1, 0), atom(1, 0), atom(0, 1)], bonds: [bond(0, 1), bond(0, 2), bond(0, 3)] };
    expect(inLineCarbons(read)).toEqual([]);
  });
  it("is not said of a carbon with a label", () => {
    const read = { atoms: [atom(0, 0, { label: "CH2" }), atom(-1, 0), atom(1, 0)], bonds: [bond(0, 1), bond(0, 2)] };
    expect(inLineCarbons(read)).toEqual([]);
    expect(inLineCarbons({ atoms: [atom(0, 0), atom(-1, 0), atom(1, 0)], bonds: [bond(0, 1), bond(0, 2)] })).toEqual([0]);
  });
});

describe("a small piece of carbons, said beside a larger piece only", () => {
  it("is not said where it holds a label and no piece larger is there: only the piece of bare carbons is", () => {
    const atoms: ReadAtom[] = [0, 1, 2].map((k) => ({ x: k, y: 0 }) as ReadAtom).concat([{ x: 10, y: 0, label: "OH" }, { x: 11, y: 0 }]);
    const bonds: ReadBond[] = [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 }, { a: 3, b: 4, order: 1 }];
    expect(tinyPieces({ atoms, bonds })).toEqual([{ atoms: [0, 1, 2], apart: false }]);
  });
});

describe("a patch beside a structure, a V and an equals sign, where letters are given", () => {
  // (a ring a bond of 40 long, its lowest corner at 100, 110)
  const ring = hexagon([100, 70], 40).map((p, k, all) => line(p, all[(k + 1) % 6], 3));
  it("a 7 a few pixels - under a third of a bond, its lines' ends - from the ring's line is lines, not a letter: it is not standing apart", { timeout: 30_000 }, () => {
    const t = traced(tracePicture(picture(200, 170, [...ring, filled(FACE["7"], [90, 143.4], 40)]), [], KNOWN));
    expect(t.shapes.blobs).toHaveLength(0);
    expect(t.shapes.strokes).toHaveLength(8);
  });
  it("a V - two lines meeting at a corner, letter-sized, standing apart - matched by none of the letters stays lines", { timeout: 30_000 }, () => {
    const t = traced(tracePicture(picture(200, 200, [...ring, line([80, 150], [90, 178], 3), line([90, 178], [100, 150], 3)]), [], KNOWN));
    expect(t.shapes.blobs).toHaveLength(0);
    expect(t.shapes.strokes).toHaveLength(8);
  });
  it("an equals sign - two bars side by side, no corner - is lines, though the letters hold one", { timeout: 30_000 }, () => {
    const t = traced(tracePicture(picture(200, 200, [...ring, filled(FACE["="], [80, 190], 40)]), [], KNOWN));
    expect(t.shapes.blobs).toHaveLength(0);
    expect(t.shapes.strokes).toHaveLength(8);
  });
});

describe("a picture's pixels put where the page has them, a PDF's letters over it", () => {
  it("a letter's box, in the page's points, drops the ink under it - the picture's pixels begin at the place given, not at the page's corner", { timeout: 30_000 }, () => {
    // (a ring with a chain of four bonds from it, and a filled square of ink 14 pixels across below them, where the PDF gives a letter: a pixel is a quarter of a point, the picture's top left at 100, 100)
    const ringLines = hexagon([80, 80], 40).map((p, k, all) => line(p, all[(k + 1) % 6], 3));
    const chain = [line([114.6, 60], [149.2, 40], 3), line([149.2, 40], [183.8, 60], 3), line([183.8, 60], [218.4, 40], 3), line([218.4, 40], [253, 60], 3)];
    const square: Shape = (x, y) => x >= 200 && x <= 214 && y >= 120 && y <= 134;
    const px = picture(270, 160, [...ringLines, ...chain, square]);
    const at = { scale: 0.25, x: 100, y: 100 };
    // (the square's box in points: 100 + 200/4 ... 100 + 214/4, 100 + 120/4 ... 100 + 134/4)
    const letter = { c: "x", box: [150, 130, 153.5, 133.5] as [number, number, number, number], at: null, size: 4 };
    const withLetter = readTracedPicture(px, at, [], () => true, [letter]);
    const without = readTracedPicture(px, at, [], () => true, []);
    if ("none" in withLetter || "none" in without) throw new Error("none");
    const marked = (r: typeof withLetter) => r.atoms.filter((a) => a.unsure?.length).length;
    expect(withLetter.atoms).toHaveLength(10);
    expect(marked(withLetter)).toBe(0);
    expect(marked(without)).toBeGreaterThan(0);
  });
});
