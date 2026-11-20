/**
 * Held beside marksOverEdges.test.ts: a dashed line's ends within a fifth of a bond and read either way round; a labelled piece with one
 * bond dashed, or of three bonds, is no mark; a measurement over a figure's background stays a word. (Found in review.)
 */
import { describe, expect, it } from "vitest";
import type { FigureDrawn, FigureLetter, FigurePath, PathStep } from "../../../../lib/figure/drawn";
import type { FigureRead, ReadAtom, ReadBond } from "../../../../lib/figure/read";
import { marksOver, OVER_PICTURE } from "../../../../lib/figure/scheme";
import { figureFrom, type FigureResult } from "./figures";

type Box = [number, number, number, number];
const A: Box = [100, 100, 200, 200];
/** A figure of atoms and bonds a piece wide (`bond` 10), and off every picture a chain of three atoms at x 400, so that no picture is the figure's background. */
const read = (atoms: [number, number][], bonds: [number, number][], labels: Record<number, string> = {}): FigureRead => {
  const all = [...atoms, [400, 150], [410, 155], [420, 150]] as [number, number][];
  const n = atoms.length;
  return {
    atoms: all.map(([x, y], i): ReadAtom => ({ x, y, ...(labels[i] ? { label: labels[i] } : {}) })),
    bonds: [...bonds, [n, n + 1], [n + 1, n + 2]].map(([a, b]): ReadBond => ({ a, b, order: 1 })),
    bond: 10,
    left: { letters: [] },
  };
};
const dash = (x1: number, x2: number) => ({ a: { x: x1, y: 150 }, b: { x: x2, y: 150 } });

describe("a dashed line over a picture", () => {
  const pdO = () => read([[120, 150], [150, 150]], [[0, 1]], { 0: "Pd", 1: "O" });
  it("joins a piece's two atoms where its ends lie within a fifth of a bond of them, not a third", () => {
    expect(marksOver(pdO(), [A], [dash(121.5, 148.5)]).marks).toBe(1);
    expect(marksOver(pdO(), [A], [dash(123, 147)]).marks).toBe(0);
  });
  it("joins them whichever way round it is given", () => {
    expect(marksOver(pdO(), [A], [dash(149, 121)]).marks).toBe(1);
  });
});

describe("a labelled piece over a picture", () => {
  it("is read and said where only one of its two bonds is dashed", () => {
    const r = marksOver(read([[120, 150], [150, 150], [180, 150]], [[0, 1], [1, 2]], { 0: "Pd" }), [A], [dash(121, 149)]);
    expect(r.marks).toBe(0);
    expect(r.read.atoms.slice(0, 3).map((a) => a.unsure)).toEqual([[OVER_PICTURE], [OVER_PICTURE], [OVER_PICTURE]]);
  });
  it("is read as it is, and not said, where it is of three bonds", () => {
    const r = marksOver(read([[120, 150], [140, 150], [160, 150], [180, 150]], [[0, 1], [1, 2], [2, 3]], { 0: "Pd" }), [A]);
    expect(r.marks).toBe(0);
    expect(r.read.atoms.slice(0, 4).map((a) => a.unsure)).toEqual([undefined, undefined, undefined, undefined]);
  });
});

describe("a measurement over a picture that is a figure's whole background", () => {
  const L = 14.4;
  type P = [number, number];
  const stroke = (...pts: P[]): FigurePath => ({ fill: null, stroke: "#000000ff", width: 0.6, d: pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]) });
  const letters = (text: string, [x, y]: P): FigureLetter[] =>
    [...text].map((c, i) => ({ c, box: [x - 3.4 + 6.8 * i, y - 3.6, x + 3.4 + 6.8 * i, y + 3.6], at: [x - 3.4 + 6.8 * i, y + 3.6], size: 10 }));
  /** A zigzag of four bonds with a "2.1" beside it. */
  const figure = (pictures: Box[]): FigureDrawn => {
    const pts: P[] = [0, 1, 2, 3, 4].map((i) => [100 + i * L * 0.866, 200 + (i % 2) * L * 0.5]);
    return { paths: [stroke(...pts)], letters: letters("2.1", [160, 240]), pictures };
  };
  it("stays a word, and nothing is said: the picture takes nothing", () => {
    const whole = figureFrom(figure([[50, 150, 300, 300]]), "a".repeat(64), 0) as FigureResult;
    expect(whole.model.atoms).toHaveLength(5);
    expect(whole.left).toBeUndefined();
  });
});
