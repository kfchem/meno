/**
 * Two cages read back from drawings Meno made of them (fixtures: Meno's own drawing printed to PDF, as the PDF reader gives it, and
 * the same kind of drawing as a 300 dpi picture of it): each read as the molecule drawn - its formula and its identity those of the
 * structure typed in - where two drawn things meet in a way the reader once took for one.
 *
 * - Ginkgolide B, in Meno's own style: two hashed bonds drawn end to end at a ring carbon - one hash's wide end where the next
 *   one's narrow end starts - are two hashes (lib/figure/read `hashesApart`), not one long hash through the carbon.
 * - Gibberellic acid, in the Nature style, as a picture: a bond ending where a double bond ends is not carried on, across that
 *   joint, into a hash's bar lying on its line (`brokenAcross`): a joint is an atom, not a line cut short round one in front.
 * - Picrotoxinin, in Meno's own style: a bond cut short round a bond drawn in front of it, where a third bond meets the cut line
 *   just beyond the gap, is still read as one bond carried across (`brokenAcross`): the line in front crosses the gap, and the one
 *   ending beside it does not undo that.
 */
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { FigureDrawn, FigureLetter } from "../../../../lib/figure/drawn";
import { readDrawnLabel } from "../../../../lib/figure/structure";
import { readTracedPicture } from "../../../../lib/figure/tracedRead";
import type { Model } from "../store/types";
import { partFormula } from "../chem/cleanUp";
import { identityOfDrawn } from "../chem/identityOf";
import { figureFrom, figureLabels, pictureResult } from "./figures";
import { drawnFromSmiles } from "./smilesDrawn";
import { measured } from "../../../../testing/timeouts";
import ginkgolideB from "../../../../lib/figure/fixtures/ginkgolide-b-meno.json";
import picrotoxinin from "../../../../lib/figure/fixtures/picrotoxinin-meno.json";
import gibberellicAt from "../../../../lib/figure/fixtures/pictures/gibberellic-acid-nature-300dpi.json";

const SHA = "a".repeat(64);
const GINKGOLIDE_B = "C[C@@H]1C(=O)O[C@@H]2[C@]1([C@@]34C(=O)O[C@H]5[C@]3([C@@H]2O)[C@@]6([C@@H](C5)C(C)(C)C)[C@H](C(=O)O[C@H]6O4)O)O";
const PICROTOXININ = "CC(=C)[C@@H]1[C@@H]2[C@@H]3[C@@]4([C@]([C@H]1C(=O)O2)(C[C@@H]5[C@]4(O5)C(=O)O3)O)C";
const GIBBERELLIC_ACID = "C[C@@]12[C@H](C=C[C@@]3([C@@H]1[C@@H]([C@]45[C@H]3CC[C@](C4)(C(=C)C5)O)C(=O)O)OC2=O)O";

/** A grey PNG of the fixtures (8 bits, no filter on any row) as the RGBA pixels a picture is traced from. */
function greyPng(path: URL): { width: number; height: number; data: Uint8ClampedArray } {
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

/** The molecule's identity and formula, as typed in. */
const truth = (smiles: string) => {
  const m = drawnFromSmiles(smiles);
  return { identity: identityOfDrawn(m).text, formula: partFormula(m) };
};

describe("a cage drawn by Meno, read back", () => {
  it("ginkgolide B with two hashes end to end at a ring carbon: two hashes, the carbon and its ring kept", () => {
    const got = figureFrom(ginkgolideB as unknown as FigureDrawn, SHA, 0);
    if ("none" in got) throw new Error(got.none);
    const m: Model = got.model;
    expect(partFormula(m)).toBe("C20H24O10");
    expect(identityOfDrawn(m).text).toBe(truth(GINKGOLIDE_B).identity);
    // (no hash longer than a bond and a half: each of the two its own)
    const at = new Map(m.atoms.map((a) => [a.id, a]));
    const lengths = m.bonds.filter((b) => b.stereo === "down").map((b) => Math.hypot(at.get(b.a)!.x - at.get(b.b)!.x, at.get(b.a)!.y - at.get(b.b)!.y));
    const plain = m.bonds.filter((b) => !b.stereo).map((b) => Math.hypot(at.get(b.a)!.x - at.get(b.b)!.x, at.get(b.a)!.y - at.get(b.b)!.y));
    const bond = plain.sort((p, q) => p - q)[plain.length >> 1];
    expect(lengths.length).toBe(3);
    for (const l of lengths) expect(l).toBeLessThan(1.5 * bond);
  }, measured(1500));

  it("picrotoxinin with a bond broken round one in front, a third bond meeting it by the gap: one bond across", () => {
    const got = figureFrom(picrotoxinin as unknown as FigureDrawn, SHA, 0);
    if ("none" in got) throw new Error(got.none);
    const t = truth(PICROTOXININ);
    expect(t.formula).toBe("C15H16O6");
    expect(partFormula(got.model)).toBe(t.formula);
    expect(identityOfDrawn(got.model).text).toBe(t.identity);
  }, measured(1500));

  it("gibberellic acid as a 300 dpi picture: the bond to the double bond's end stops there, not in the hash beyond it", () => {
    const pixels = greyPng(new URL("../../../../lib/figure/fixtures/pictures/gibberellic-acid-nature-300dpi.png", import.meta.url));
    const read = readTracedPicture(pixels, gibberellicAt.at, [], (l) => readDrawnLabel(l, figureLabels).read, gibberellicAt.letters as FigureLetter[]);
    if ("none" in read) throw new Error(read.none);
    const got = pictureResult(read, (x, y) => ({ sha256: SHA, page: 0, x, y, bond: read.bond }));
    if ("none" in got) throw new Error(got.none);
    const t = truth(GIBBERELLIC_ACID);
    expect(t.formula).toBe("C19H22O6");
    expect(partFormula(got.model)).toBe(t.formula);
    expect(identityOfDrawn(got.model).text).toBe(t.identity);
  }, measured(1500));
});
