/**
 * Pictures holding more than one structure, made from Meno's own drawings (lib/figure/fixtures: each a structure typed in, drawn by
 * Meno in its own style and printed to PDF, as the PDF reader gives it), painted at 300 dpi with their letters given, and read as a
 * picture is (lib/figure/tracedRead `readTracedPicture`). What stands apart is read right, or said:
 * - a salt drawn as two ions apart, its acetate's minus lost: the O left with one bond says so (`openLabels`), however far the Na stands,
 *   and the Na, read as no atom, is said by the atom nearest it (`wordsApart`);
 * - two neutral molecules apart, alanine beside a ring: each read right, nothing said;
 * - ibuprofen with the bond to its carboxyl left out: the carboxyl, one bond off, is said to be apart (`tinyPieces`).
 */
import { describe, expect, it } from "vitest";
import type { FigureDrawn, FigurePath, PathStep } from "../../../../lib/figure/drawn";
import type { FigureRead } from "../../../../lib/figure/read";
import { readDrawnLabel } from "../../../../lib/figure/structure";
import { APART_SAID, OPEN_SAID, readTracedPicture } from "../../../../lib/figure/tracedRead";
import { partFormula } from "../chem/cleanUp";
import { identityOfDrawn } from "../chem/identityOf";
import { figureLabels, pictureResult } from "./figures";
import { drawnFromSmiles } from "./smilesDrawn";
import { measured } from "../../../../testing/timeouts";
import { painted } from "../../../../testing/paintedFigure";
import sodiumAcetate from "../../../../lib/figure/fixtures/sodium-acetate-meno.json";
import alanine from "../../../../lib/figure/fixtures/l-alanine-meno.json";
import dimethylcyclohexane from "../../../../lib/figure/fixtures/dimethylcyclohexane-meno.json";
import ibuprofen from "../../../../lib/figure/fixtures/ibuprofen-meno.json";

const SHA = "a".repeat(64);

/** A drawing moved by `dx`, `dy` points: its paths and its letters. */
function moved(f: FigureDrawn, dx: number, dy = 0): FigureDrawn {
  const step = (s: PathStep): PathStep => [s[0], ...s.slice(1).map((v, i) => (v as number) + (i % 2 ? dy : dx))] as PathStep;
  return {
    paths: f.paths.map((p): FigurePath => ({ ...p, d: p.d.map(step) })),
    letters: f.letters.map((l) => ({ ...l, box: [l.box[0] + dx, l.box[1] + dy, l.box[2] + dx, l.box[3] + dy], ...(l.at ? { at: [l.at[0] + dx, l.at[1] + dy] } : {}), ...(l.loose ? { loose: [l.loose[0] + dx, l.loose[1] + dy, l.loose[2] + dx, l.loose[3] + dy] } : {}) })),
    pictures: [],
  } as FigureDrawn;
}

/** Drawings set side by side in one picture. */
const together = (...fs: FigureDrawn[]): FigureDrawn => ({ paths: fs.flatMap((f) => f.paths), letters: fs.flatMap((f) => f.letters), pictures: [] });

/** Whether all a path's points lie within `r` of a point. */
const within = (p: FigurePath, x: number, y: number, r: number) => p.d.every((s) => s.length < 3 || Math.hypot((s[s.length - 2] as number) - x, (s[s.length - 1] as number) - y) <= r);

function read(f: FigureDrawn): FigureRead {
  const { pixels, at } = painted(f);
  const r = readTracedPicture(pixels, at, [], (l) => readDrawnLabel(l, figureLabels).read, f.letters);
  if ("none" in r) throw new Error(r.none);
  return r;
}

const truth = (smiles: string) => {
  const m = drawnFromSmiles(smiles);
  return { identity: identityOfDrawn(m).text, formula: partFormula(m) };
};

describe("a picture of structures standing apart, made from Meno's drawings", () => {
  it("a salt as two ions far apart, the acetate's minus lost: its O with one bond is said, not read as an acid's", () => {
    const salt = sodiumAcetate as unknown as FigureDrawn;
    // (Meno draws a charge as its sign in a ring beside the atom: the acetate's minus by its single-bonded O, the sodium's plus by the Na)
    const minus = (p: FigurePath) => within(p, 106.9, 96.8, 3.2);
    const plus = (p: FigurePath) => within(p, 146.7, 86, 3.2);
    const anion: FigureDrawn = { paths: salt.paths.filter((p) => !minus(p) && !plus(p)), letters: salt.letters.filter((l) => l.c === "O"), pictures: [] };
    const cation: FigureDrawn = { paths: salt.paths.filter(plus), letters: salt.letters.filter((l) => l.c !== "O"), pictures: [] };
    for (const off of [0, 60, 150]) {
      const r = read(together(anion, moved(cation, off)));
      const open = r.atoms.filter((a) => a.unsure?.includes(OPEN_SAID));
      expect(open.map((a) => a.label), String(off)).toEqual(["O"]);
      // (the Na, apart, read as no atom: said by the atom nearest it, never left out in silence)
      expect(r.atoms.some((a) => a.unsure?.some((u) => u.startsWith('"Na') ))).toBe(true);
    }
  }, measured(6000));

  it("two neutral molecules apart, alanine beside a ring: each read right, nothing said", () => {
    const r = read(together(alanine as unknown as FigureDrawn, moved(dimethylcyclohexane as unknown as FigureDrawn, 90)));
    expect(r.atoms.filter((a) => a.unsure?.length).map((a) => [a.label ?? "C", a.unsure])).toEqual([]);
    const got = pictureResult(r, (x, y) => ({ sha256: SHA, page: 0, x, y, bond: r.bond }));
    if ("none" in got) throw new Error(got.none);
    const t = truth("C[C@@H](C(=O)O)N.C[C@@H]1CCCC[C@H]1C");
    expect(partFormula(got.model)).toBe(t.formula);
    expect(identityOfDrawn(got.model).text).toBe(t.identity);
  }, measured(3000));

  it("ibuprofen with the bond to its carboxyl left out: the carboxyl, a bond off, is said to be apart", () => {
    const f = ibuprofen as unknown as FigureDrawn;
    // (the bond from the CH to the carboxyl's carbon: from (150.1, 104.1) to (162.6, 96.9))
    const cut = (p: FigurePath) => !!p.stroke && within(p, 156.35, 100.5, 7.3) && p.d.length === 2;
    expect(f.paths.filter(cut)).toHaveLength(1);
    const r = read({ ...f, paths: f.paths.filter((p) => !cut(p)) });
    const apart = r.atoms.filter((a) => a.unsure?.includes(APART_SAID));
    expect(apart.map((a) => a.label ?? "C").sort()).toEqual(["C", "O", "OH"]);
  }, measured(3000));
});
