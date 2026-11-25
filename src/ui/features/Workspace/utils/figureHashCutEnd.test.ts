/**
 * A hash whose wide-end line, where it meets the bonds at its atom, comes out of a picture traced cut short - its ink run into
 * theirs - so that its two end lines look alike: its narrow end is still told, by the line inside the cut one (lib/figure/read
 * `hashesOf`). Answers stated: a hash drawn so, as lines, and kainic acid drawn by Meno in the RSC style as a 300 dpi picture of it
 * - its formula and its identity, stereocentres and all, those of the structure typed in.
 */
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { FigureDrawn, FigureLetter, FigurePath, PathStep } from "../../../../lib/figure/drawn";
import { readFigure } from "../../../../lib/figure/read";
import { readDrawnLabel } from "../../../../lib/figure/structure";
import { readTracedPicture } from "../../../../lib/figure/tracedRead";
import { partFormula } from "../chem/cleanUp";
import { identityOfDrawn } from "../chem/identityOf";
import { figureLabels, pictureResult } from "./figures";
import { drawnFromSmiles } from "./smilesDrawn";
import { measured } from "../../../../testing/timeouts";
import kainicAt from "../../../../lib/figure/fixtures/pictures/kainic-acid-rsc-300dpi.json";

const SHA = "a".repeat(64);
const KAINIC_ACID = "CC(=C)[C@H]1CN[C@@H]([C@H]1CC(=O)O)C(=O)O";

/** A grey PNG of the fixtures (8 bits, no filter on any row) as the RGBA pixels a picture is traced from. */
function greyPng(path: string): { width: number; height: number; data: Uint8ClampedArray } {
  const png = readFileSync(path);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const idat: Buffer[] = [];
  for (let at = 8; at < png.length; ) {
    const n = png.readUInt32BE(at);
    if (png.toString("latin1", at + 4, at + 8) === "IDAT") idat.push(png.subarray(at + 8, at + 8 + n));
    at += 12 + n;
  }
  const rows = inflateSync(Buffer.concat(idat));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const v = rows[y * (width + 1) + 1 + x];
      data.set([v, v, v, 255], 4 * (y * width + x));
    }
  return { width, height, data };
}

type P = [number, number];
const L = 14.4;
const line = (...pts: P[]): FigurePath => ({ fill: null, stroke: "#000000ff", width: 0.6, d: pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]) });
/** A carbon N at (100,100) and W one bond on to the right, a hash between them, and two bonds more at each: the hash's lines at `at` along it, `long` long (in bonds). */
function drawn(at: number[], long: number[]): FigureDrawn {
  const [nx, ny, wx, wy] = [100, 100, 100 + L, 100];
  const bars = at.map((t, k) => {
    const [cx, h] = [nx + L * t, (L * long[k]) / 2];
    return line([cx, ny - h], [cx, ny + h]);
  });
  const step = (x: number, y: number, deg: number): P => [x + L * Math.cos((deg * Math.PI) / 180), y + L * Math.sin((deg * Math.PI) / 180)];
  return { paths: [line([nx, ny], step(nx, ny, 120)), line([nx, ny], step(nx, ny, 240)), line([wx, wy], step(wx, wy, 60)), line([wx, wy], step(wx, wy, -60)), ...bars], letters: [], pictures: [] } as unknown as FigureDrawn;
}
const hashOf = (d: FigureDrawn) => {
  const r = readFigure(d, () => true);
  const h = r.bonds.filter((b) => b.stereo === "down");
  expect(h).toHaveLength(1);
  return { narrowX: r.atoms[h[0].a].x, either: h[0].either };
};

describe("a hash whose wide-end line is cut short where it meets its atom's bonds", () => {
  it("is narrow where its lines are shortest, the cut line at its wide end passed over", () => {
    // (a dot, then lines growing 0.08, 0.12, 0.15 of a bond, the last cut to 0.08: narrow at N, not either)
    const h = hashOf(drawn([0.25, 0.42, 0.6, 0.78, 0.95], [0.01, 0.08, 0.12, 0.15, 0.08]));
    expect(h.narrowX).toBeLessThan(100 + L / 2);
    expect(h.either).toBeUndefined();
    // (the same drawn the other way round: narrow at W)
    const back = hashOf(drawn([0.05, 0.22, 0.4, 0.58, 0.75], [0.08, 0.15, 0.12, 0.08, 0.01]));
    expect(back.narrowX).toBeGreaterThan(100 + L / 2);
    expect(back.either).toBeUndefined();
  });

  it("leaves a hash of even lines even, an end line short of the one inside it by less than a line's width", () => {
    const h = hashOf(drawn([0.2, 0.35, 0.5, 0.65, 0.8], [0.14, 0.14, 0.14, 0.14, 0.12]));
    expect(h.either).toBe(true);
  });

  it("reads kainic acid drawn by Meno (RSC style) as a 300 dpi picture with both its hashes' narrow ends: every stereocentre", () => {
    const pixels = greyPng(new URL("../../../../lib/figure/fixtures/pictures/kainic-acid-rsc-300dpi.png", import.meta.url).pathname);
    const read = readTracedPicture(pixels, kainicAt.at, [], (l) => readDrawnLabel(l, figureLabels).read, kainicAt.letters as FigureLetter[]);
    if ("none" in read) throw new Error(read.none);
    expect(read.bonds.filter((b) => b.stereo === "down" && !b.either)).toHaveLength(2);
    const got = pictureResult(read, (x, y) => ({ sha256: SHA, page: 0, x, y, bond: read.bond }));
    if ("none" in got) throw new Error(got.none);
    const m = drawnFromSmiles(KAINIC_ACID);
    expect(partFormula(m)).toBe("C10H15NO4");
    expect(partFormula(got.model)).toBe("C10H15NO4");
    expect(identityOfDrawn(got.model).text).toBe(identityOfDrawn(m).text);
  }, measured(1500));
});
