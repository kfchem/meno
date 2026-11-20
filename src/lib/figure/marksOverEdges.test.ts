/**
 * The edges of `marksOver` (scheme.ts): a piece is a mark only where all its atoms lie within ONE picture - a picture's height counts as
 * its width does, a piece across two pictures is kept, and each piece is one mark - and only where it is a mark by the chemistry check's
 * ruling: a dashed line, a bare line of one or two bonds, an atom alone; a labelled piece of one or two bonds read and said; a ring or
 * three bonds a structure; nothing taken where the picture is the whole figure's background. (Found in review.)
 */
import { describe, expect, it } from "vitest";
import type { FigureRead, ReadAtom, ReadBond } from "./read";
import { MEASUREMENT, marksOver, OVER_PICTURE } from "./scheme";

type Box = [number, number, number, number];
/** A structure off every picture - a chain at x 400 - so that no picture is the figure's background. */
const OFF: [number, number][] = [
  [400, 150],
  [410, 155],
  [420, 150],
];
const read = (atoms: [number, number][], bonds: [number, number][], labels: Record<number, string> = {}, off = true): FigureRead => {
  const all = off ? [...atoms, ...OFF] : atoms;
  const n = atoms.length;
  return {
    atoms: all.map(([x, y], i): ReadAtom => ({ x, y, ...(labels[i] ? { label: labels[i] } : {}) })),
    bonds: [...bonds, ...(off ? [[n, n + 1], [n + 1, n + 2]] : [])].map(([a, b]): ReadBond => ({ a, b, order: 1 })),
    bond: 10,
    left: { letters: [] },
  };
};
const A: Box = [100, 100, 200, 200];
const B: Box = [210, 100, 310, 200];

describe("a piece wholly within a picture's box", () => {
  it("is left out and counted once where it is a bare line of two bonds - an angle's two lines", () => {
    const r = marksOver(read([[120, 120], [140, 130], [160, 120]], [[0, 1], [1, 2]]), [A]);
    expect(r.marks).toBe(1);
    expect(r.read.atoms).toHaveLength(3);
    expect(r.read.bonds).toHaveLength(2);
  });

  it("is kept where it lies over the picture's width but not within its height: above it, or under it", () => {
    for (const y of [60, 240]) {
      const r = marksOver(read([[120, y], [140, y + 10]], [[0, 1]]), [A]);
      expect(r.marks, `${y}`).toBe(0);
      expect(r.read.atoms, `${y}`).toHaveLength(5);
    }
  });

  it("is kept where its atoms are in two pictures, a bond between them: no one picture holds it", () => {
    const r = marksOver(read([[190, 150], [220, 150]], [[0, 1]]), [A, B]);
    expect(r.marks).toBe(0);
    expect(r.read.atoms).toHaveLength(5);
  });

  it("is left out where it is within the second picture of two; the piece beside it, outside, is kept", () => {
    const r = marksOver(read([[230, 150], [260, 150]], [[0, 1]]), [A, B]);
    expect(r.marks).toBe(1);
    expect(r.read.atoms.map((a) => a.x)).toEqual([400, 410, 420]);
  });

  it("is a structure, read as before, where it holds a ring or three bonds", () => {
    const ring = marksOver(read([[120, 120], [140, 120], [130, 135]], [[0, 1], [1, 2], [2, 0]]), [A]);
    expect([ring.marks, ring.read.atoms.length]).toEqual([0, 6]);
    const chain = marksOver(read([[120, 120], [130, 125], [140, 120], [150, 125]], [[0, 1], [1, 2], [2, 3]]), [A]);
    expect([chain.marks, chain.read.atoms.length]).toEqual([0, 7]);
  });

  it("is read and said where it is labelled and of one or two bonds - Pd1 and O2 joined by a plain line - and a mark where the line is dashed", () => {
    const pdO = read([[120, 150], [150, 150]], [[0, 1]], { 0: "Pd", 1: "O" });
    const plain = marksOver(pdO, [A]);
    expect(plain.marks).toBe(0);
    expect(plain.read.atoms.slice(0, 2).map((a) => a.unsure)).toEqual([[OVER_PICTURE], [OVER_PICTURE]]);
    const dashed = marksOver(pdO, [A], [{ a: { x: 121, y: 150 }, b: { x: 149, y: 150 } }]);
    expect(dashed.marks).toBe(1);
    expect(dashed.read.atoms).toHaveLength(3);
  });

  it("is never taken where nothing of the figure lies outside the pictures: the picture is a background", () => {
    const r = marksOver(read([[120, 120], [140, 130]], [[0, 1]], {}, false), [A]);
    expect([r.marks, r.background, r.read.atoms.length]).toEqual([0, true, 2]);
  });
});

describe("a word written over a picture", () => {
  it("is a measurement where it has a decimal point or a unit, and no compound's number", () => {
    expect(["2.1 Å", "1.98", "109.5°", "2,1", "12 kcal", "3 kJ/mol", "150 pm"].map((t) => MEASUREMENT.test(t))).toEqual(Array(7).fill(true));
    expect(["3", "12a", "4'", "(2b)", "21, 83%", "Pd1", "O2"].map((t) => MEASUREMENT.test(t))).toEqual(Array(7).fill(false));
  });
});
