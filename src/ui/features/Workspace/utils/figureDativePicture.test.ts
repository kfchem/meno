/**
 * Read as structure on a picture (readFigure.ts `readPicture` -> lib/figure/tracedRead `readTracedPicture`): cisplatin drawn by Meno
 * with two dative arrows H3N -> Pt, as a 300 dpi picture of it. Each arrow - a short line, a filled head on it, between two labels - is
 * traced as one piece; it is read as its line and its head (lib/figure/trace `arrowOf`), and so as a dative bond from the N. Answers
 * stated: 5 atoms and 4 bonds, two dative N -> Pt, each N with its three hydrogens.
 */
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { FigureLetter } from "../../../../lib/figure/drawn";
import { arrowOf } from "../../../../lib/figure/trace";
import { readDrawnLabel } from "../../../../lib/figure/structure";
import { readTracedPicture } from "../../../../lib/figure/tracedRead";
import { hydrogensOn } from "../../../../lib/chem/perception/hydrogens";
import { figureLabels, pictureResult } from "./figures";
import { measured } from "../../../../testing/timeouts";

/** A grey PNG of the fixtures (8 bits, no filter on any row) as the RGBA pixels a picture is traced from. */
function greyPng(path: string): { width: number; height: number; data: Uint8ClampedArray } {
  const png = readFileSync(path);
  const [width, height] = [png.readUInt32BE(16), png.readUInt32BE(20)];
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

/** The cisplatin's letters, where the picture has them (its pixels its points): given, as a PDF's letters over a picture are. */
const letter = (c: string, box: [number, number, number, number], small = false): FigureLetter =>
  ({ c, box, at: [box[0], small ? box[3] - 8 : box[3]], size: small ? 29 : 42, dir: 0, font: "Helvetica" }) as FigureLetter;
const LETTERS: FigureLetter[] = [
  letter("N", [656, 293, 678, 323]),
  letter("H", [686, 293, 708, 323]),
  letter("3", [713, 310, 727, 333], true),
  letter("H", [548, 353, 570, 383]),
  letter("3", [575, 370, 590, 393], true),
  letter("N", [596, 353, 618, 383]),
  letter("P", [651, 353, 671, 383]),
  letter("t", [673, 355, 685, 383]),
  letter("C", [716, 353, 738, 384]),
  letter("l", [743, 352, 750, 383]),
  letter("C", [656, 413, 678, 444]),
  letter("l", [683, 412, 690, 443]),
];

describe("a dative bond's arrow in a picture", () => {
  it("reads cisplatin drawn by Meno at 300 dpi: two dative bonds N -> Pt, each N with three hydrogens, two Cl", () => {
    const pixels = greyPng(new URL("../../../../lib/figure/fixtures/pictures/cisplatin-isothiocyanates-300dpi.png", import.meta.url).pathname);
    const read = readTracedPicture(pixels, { scale: 1, x: 0, y: 0 }, [], (l) => readDrawnLabel(l, figureLabels).read, LETTERS);
    if ("none" in read) throw new Error(read.none);
    const got = pictureResult(read, (x, y) => ({ sha256: "a".repeat(64), x, y, bond: read.bond }));
    if ("none" in got) throw new Error(got.none);
    const m = got.model;
    const pt = m.atoms.find((a) => a.el === "Pt")!;
    const on = m.bonds.filter((b) => b.a === pt.id || b.b === pt.id);
    const other = (b: (typeof on)[number]) => m.atoms.find((a) => a.id === (b.a === pt.id ? b.b : b.a))!;
    expect(on.map((b) => other(b).el).sort()).toEqual(["Cl", "Cl", "N", "N"]);
    const dative = on.filter((b) => b.dative);
    expect(dative.map((b) => [m.atoms.find((a) => a.id === b.a)!.el, m.atoms.find((a) => a.id === b.b)!.el])).toEqual([
      ["N", "Pt"],
      ["N", "Pt"],
    ]);
    const at = new Map(m.atoms.map((a, i) => [a.id, i]));
    const bonds = m.bonds.map((b) => ({ a: at.get(b.a)!, b: at.get(b.b)!, order: b.order, ...(b.dative ? { dative: true } : {}) }));
    for (const b of dative) expect(hydrogensOn(m.atoms, bonds, at.get(b.a)!)).toBe(3);
  }, measured(1500));

  it("tells a line with a head from a wedge and from a line, by its widths along it", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 20, y: 0 };
    const along = (ws: number[]) => ws.map((w, k) => ({ t: k + 0.5, w }));
    // (a line, then a head square at its base, thinning to its point: its line to the base, its head's point at b)
    const arrow = arrowOf(along([2, 2.4, 2.3, 2.3, 2.3, 2.3, 2.3, 2.3, 5.3, 7, 6.4, 5.8, 4.9, 3.9, 3.3, 2.7, 2.1, 1.5, 0.9]), a, b, 2.4);
    expect(arrow?.head.tip).toEqual(b);
    expect(arrow?.stroke.a).toEqual(a);
    // (the same the other way round: its point at a)
    const back = arrowOf(along([0.9, 1.5, 2.1, 2.7, 3.3, 3.9, 4.9, 5.8, 6.4, 7, 5.3, 2.3, 2.3, 2.3, 2.3, 2.3, 2.3, 2.4, 2]), a, b, 2.4);
    expect(back?.head.tip).toEqual(a);
    // (a wedge widening to its end, a plain line, and a line swelling evenly both ways: none an arrow)
    expect(arrowOf(along([2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8]), a, b, 2.4)).toBeNull();
    expect(arrowOf(along([2.3, 2.3, 2.3, 2.3, 2.3, 2.3, 2.3, 2.3, 2.3]), a, b, 2.4)).toBeNull();
    expect(arrowOf(along([2.3, 2.3, 2.3, 4, 6, 7, 6, 4, 2.3, 2.3, 2.3]), a, b, 2.4)).toBeNull();
  });
});
