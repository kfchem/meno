import { describe, expect, it } from "vitest";
import { inLineCarbons, lostLabelEnds, LOST_LABEL_REACH, pictureDpi, tinyPieces, TINY_PIECE } from "./tracedRead";
import type { ReadAtom, ReadBond } from "./read";

describe("how finely a box holding pictures is drawn to be traced", () => {
  // (a picture an inch across and half an inch high: 72 by 36 points)
  const inch: [number, number, number, number] = [100, 100, 172, 136];

  it("is as finely as its picture is stored, however the picture is turned", () => {
    expect(pictureDpi({ pictures: [inch], pixels: [[300, 150]] }, inch, 300, 600)).toBeCloseTo(300, 6);
    expect(pictureDpi({ pictures: [inch], pixels: [[150, 300]] }, inch, 300, 600)).toBeCloseTo(300, 6);
    // (a picture stored coarser than the reader was measured at: drawn as coarse, never enlarged)
    expect(pictureDpi({ pictures: [inch], pixels: [[150, 75]] }, inch, 300, 600)).toBeCloseTo(150, 6);
  });

  it("is at most the most, and where the PDF does not say, the otherwise", () => {
    expect(pictureDpi({ pictures: [inch], pixels: [[1200, 600]] }, inch, 300, 600)).toBe(600);
    expect(pictureDpi({ pictures: [inch], pixels: [null] }, inch, 300, 600)).toBe(300);
    expect(pictureDpi({ pictures: [inch] }, inch, 300, 600)).toBe(300);
  });

  it("is the picture's that covers most of the box", () => {
    const beside: [number, number, number, number] = [172, 100, 180, 136];
    const box: [number, number, number, number] = [100, 100, 180, 136];
    expect(pictureDpi({ pictures: [beside, inch], pixels: [[800, 3600], [300, 150]] }, box, 300, 600)).toBeCloseTo(300, 6);
    expect(pictureDpi({ pictures: [inch, beside], pixels: [[300, 150], [800, 3600]] }, box, 300, 600)).toBeCloseTo(300, 6);
  });
});

describe("a small piece of a picture read, of carbons alone", () => {
  /** A chain of `n` atoms from `from`, each `el` where given, joined in a row - and closed where `ring`. */
  const piece = (from: number, n: number, ring = false, el: (k: number) => Partial<ReadAtom> = () => ({})) => ({
    atoms: Array.from({ length: n }, (_, k): ReadAtom => ({ x: from + k, y: 0, ...el(k) })),
    bonds: Array.from({ length: ring ? n : n - 1 }, (_, k): ReadBond => ({ a: from + k, b: from + ((k + 1) % n), order: 1 })),
  });
  const read = (...ps: ReturnType<typeof piece>[]) => ({ atoms: ps.flatMap((p) => p.atoms), bonds: ps.flatMap((p) => p.bonds) });

  it("is said where it is six atoms or fewer - a 1 or a 7 traced as a line, and a cyclohexane or a hexane drawn alone, which still come through", () => {
    expect(TINY_PIECE).toBe(6);
    const bare = (atoms: number[]) => [{ atoms, apart: false }];
    expect(tinyPieces(read(piece(0, 2)))).toEqual(bare([0, 1]));
    expect(tinyPieces(read(piece(0, 6, true)))).toEqual(bare([0, 1, 2, 3, 4, 5]));
    expect(tinyPieces(read(piece(0, 6)))).toEqual(bare([0, 1, 2, 3, 4, 5]));
  });

  it("is not said, alone, where it has a label or another element, or is larger", () => {
    expect(tinyPieces(read(piece(0, 3, false, (k) => (k === 2 ? { label: "OH" } : {}))))).toEqual([]);
    expect(tinyPieces(read(piece(0, 3, false, (k) => (k === 2 ? { el: "N" } : {}))))).toEqual([]);
    expect(tinyPieces(read(piece(0, 7)))).toEqual([]);
  });

  it("is told piece by piece: beside a structure, only the small piece is said", () => {
    const big = piece(0, 12, true);
    const bonds = big.bonds.map((b) => ({ ...b }));
    const two = piece(12, 2);
    expect(tinyPieces({ atoms: [...big.atoms, ...two.atoms], bonds: [...bonds, ...two.bonds] })).toEqual([{ atoms: [12, 13], apart: false }]);
  });

  it("is said beside a larger piece where it holds a carbon with no label - a group whose bond to the structure was not read", () => {
    const big = piece(0, 12, true);
    // (an OH come off with a stray carbon: C-O)
    const co = piece(12, 2, false, (k) => (k === 1 ? { label: "OH" } : {}));
    expect(tinyPieces(read(big, co))).toEqual([{ atoms: [12, 13], apart: true }]);
    // (alone, the same piece is a drawing of its own: not said)
    expect(tinyPieces(read(piece(0, 2, false, (k) => (k === 1 ? { label: "OH" } : {}))))).toEqual([]);
    // (a piece of labels only beside it - a counterion written - is not)
    const salt = piece(12, 2, false, (k) => ({ label: k ? "Cl" : "H" }));
    expect(tinyPieces(read(big, salt))).toEqual([]);
  });
});

describe("a carbon between two single bonds in line, in a picture read", () => {
  /** Atoms at the points given, each `el` where given, joined in a row by bonds of the orders given. */
  const row = (pts: [number, number][], orders: (1 | 2 | 3)[], els: (string | undefined)[] = []) => ({
    atoms: pts.map(([x, y], k): ReadAtom => ({ x, y, ...(els[k] ? { el: els[k] } : {}) })),
    bonds: orders.map((order, k): ReadBond => ({ a: k, b: k + 1, order })),
  });

  it("is said: a bond traced as two, the extra CH2 of a chain read too long", () => {
    // (a zigzag, its middle bond read as two in line)
    expect(inLineCarbons(row([[0, 0], [1, 0.5], [1.5, 0.5], [2, 0.5], [3, 0]], [1, 1, 1, 1]))).toEqual([2]);
    // (within ten degrees of a line, as a broken bond lies)
    expect(inLineCarbons(row([[0, 0], [1, 0], [2, Math.tan((8 * Math.PI) / 180)]], [1, 1]))).toEqual([1]);
  });

  it("is not said of a zigzag, a bend past ten degrees, a heteroatom, or a carbon in line on a triple or cumulated bond", () => {
    expect(inLineCarbons(row([[0, 0], [0.87, 0.5], [1.73, 0]], [1, 1]))).toEqual([]);
    expect(inLineCarbons(row([[0, 0], [1, 0], [2, Math.tan((12 * Math.PI) / 180)]], [1, 1]))).toEqual([]);
    expect(inLineCarbons(row([[0, 0], [1, 0], [2, 0]], [1, 1], [undefined, "O"]))).toEqual([]);
    // (ethyne's and a nitrile's carbons, an allene's middle, a cumulene's: their straight carbons kept)
    expect(inLineCarbons(row([[0, 0], [1, 0], [2, 0], [3, 0]], [1, 3, 1]))).toEqual([]);
    expect(inLineCarbons(row([[0, 0], [1, 0], [2, 0]], [1, 3], [undefined, undefined, "N"]))).toEqual([]);
    expect(inLineCarbons(row([[0, 0], [1, 0], [2, 0]], [2, 2]))).toEqual([]);
    expect(inLineCarbons(row([[0, 0], [1, 0], [2, 0], [3, 0]], [2, 2, 2]))).toEqual([]);
  });
});

describe("bonds stopping short of one point where nothing was read - a label lost", () => {
  /** Atoms at points, bonds between them by index, single; a bond 10 long. */
  const read = (pts: [number, number][], bonds: [number, number][], el: (k: number) => Partial<ReadAtom> = () => ({})) => ({
    atoms: pts.map(([x, y], k): ReadAtom => ({ x, y, ...el(k) })),
    bonds: bonds.map(([a, b]): ReadBond => ({ a, b, order: 1 })),
    bond: 10,
  });
  // (a ring corner at the origin, its two bonds from (-8.66, -5) and (8.66, -5), each stopping `short` of a bond before it)
  const corner = (short: number, more: [number, number][] = []) => {
    const ends: [number, number][] = [[-8.66 * short, -5 * short], [8.66 * short, -5 * short]];
    return read([[-8.66, -5], [8.66, -5], ...ends, ...more], [[0, 2], [1, 3]]);
  };

  it("marks both ends where the two bonds, carried on, cross within the reach of each", () => {
    expect(LOST_LABEL_REACH).toBe(0.75);
    expect(lostLabelEnds(corner(0.4)).sort()).toEqual([2, 3]);
    expect(lostLabelEnds(corner(0.7)).sort()).toEqual([2, 3]);
  });

  it("marks nothing where they cross farther than the reach, or where an atom was read at the point", () => {
    expect(lostLabelEnds(corner(0.8))).toEqual([]);
    expect(lostLabelEnds(corner(0.4, [[0, 0]]))).toEqual([]);
  });

  it("marks nothing where the ends point apart (two methyls on one carbon, or on two), or one end has a label", () => {
    // (a carbon at the origin, two methyls out of it, up-left and up-right: their lines carried on part)
    expect(lostLabelEnds(read([[0, 0], [-8.66, -5], [8.66, -5]], [[0, 1], [0, 2]]))).toEqual([]);
    // (two methyls on the two ends of a bond, pointing away from it)
    expect(lostLabelEnds(read([[0, 0], [10, 0], [-5, -8.66], [15, -8.66]], [[0, 1], [0, 2], [1, 3]]))).toEqual([]);
    const labelled = corner(0.4);
    labelled.atoms[3] = { ...labelled.atoms[3], label: "OH" };
    expect(lostLabelEnds(labelled)).toEqual([]);
  });
});
