import { describe, expect, it } from "vitest";
import type { FigureDrawn, FigureLetter, FigurePath, PathStep } from "./drawn";
import { LONE_DOUBLE, LONE_TRIPLE, readFigure, withoutStrays, type ReadAtom } from "./read";

// Made samples (bonds 14.4 points, lines 0.6 thick, 10-point letters): the text and the charts set by a figure's structures - a
// hyphen, a comma, the = of an R' = OH, an I drawn as a line, a chart's levels and a dagger's strokes - each read as no structure,
// beside what a structure drawn the same way still reads as.
const L = 14.4;
type P = [number, number];
const line = (a: P, b: P, w = 0.6): FigurePath => ({ fill: null, stroke: "#000000ff", width: w, d: [["M", a[0], a[1]], ["L", b[0], b[1]]] as PathStep[] });
/** A small mark filled - a comma, a colon's dot - its box. */
const mark = (x0: number, y0: number, x1: number, y1: number): FigurePath => ({
  fill: "#000000ff",
  stroke: null,
  width: 0,
  d: [["M", x0, y0], ["L", x1, y0], ["L", x1, y1], ["L", x0, y1], ["Z"]] as PathStep[],
});
const hex = (cx: number, cy: number): P[] => Array.from({ length: 6 }, (_, i) => [cx + L * Math.cos((Math.PI / 3) * i), cy + L * Math.sin((Math.PI / 3) * i)] as P);
/** A ring of six, apart from what is under test: the figure's bond. */
const ring = (): FigurePath[] => hex(60, 60).map((p, i, all) => line(p, all[(i + 1) % 6]));
const figure = (paths: FigurePath[], letters: FigureLetter[] = []): FigureDrawn => ({ paths: [...ring(), ...paths], letters, pictures: [] });

/** A word's letters, set from `x` on the baseline `base`: capitals and digits as tall as 0.72 of the size, small letters 0.5, one letter in 0.68. */
const word = (text: string, x: number, base: number, size = 10): FigureLetter[] =>
  [...text].map((c, i) => {
    const top = base - (/[a-z]/.test(c) && !/[bdfhklt]/.test(c) ? 0.5 : 0.72) * size;
    const x0 = x + 0.68 * size * i;
    return { c, box: [x0, top, x0 + 0.62 * size, base], at: [x0, base], size };
  });
const right = (ls: FigureLetter[]) => ls[ls.length - 1].box[2];
/** What was read of the part under test: its bonds (all of them right of the ring). */
const own = (r: ReturnType<typeof readFigure>) => r.bonds.filter((b) => Math.min(r.atoms[b.a].x, r.atoms[b.b].x) > 150);

describe("a hyphen between words of a line of text", () => {
  const base = 300;
  const mid = base - 3.6;
  /** `a`, a level line `long` from it by `gap`, and `b` as far after it. */
  const hyphened = (a: string, b: string, gap = 0.3, long = 2) => {
    const first = word(a, 200, base);
    const x = right(first) + gap;
    return { paths: [line([x, mid], [x + long, mid])], letters: [...first, ...word(b, x + long + gap, base)], x };
  };

  it("is no bond where a word reads as no label: trans-TS1, and set as a short bond is", () => {
    for (const [gap, long] of [
      [0.3, 2],
      [1.5, 4],
    ]) {
      const { paths, letters } = hyphened("trans", "TS1", gap, long);
      expect(own(readFigure(figure(paths, letters), (l) => l === "TS1"))).toEqual([]);
    }
  });

  it("is a bond, drawn short, between two labels set as close: Me-N", () => {
    const { paths, letters } = hyphened("Me", "N", 1.5, 4);
    const read = readFigure(figure(paths, letters), (l) => l === "Me" || l === "N");
    expect(own(read).map((b) => [read.atoms[b.a].label, read.atoms[b.b].label].sort())).toEqual([["Me", "N"]]);
  });

  it("is no bond to the numeral after it, drawn as lines: cis-II, its two I's no double bond", () => {
    const first = word("cis", 200, base);
    const x = right(first) + 0.3;
    const paths = [line([x, mid], [x + 2, mid]), line([x + 3.2, base - 7.2], [x + 3.2, base], 1), line([x + 5.1, base - 7.2], [x + 5.1, base], 1)];
    const read = readFigure(figure(paths, first), () => false);
    expect(own(read)).toEqual([]);
  });
});

describe("the = of a variable's name and what it is", () => {
  const base = 300;
  /** `name`, then an = a space from it - two lines half a letter long, level - and `what` a space after. */
  const named = (name: FigureLetter[], what: string) => {
    const x = right(name) + 3;
    const sign = [line([x, base - 4.5], [x + 4.7, base - 4.5]), line([x, base - 2.7], [x + 4.7, base - 2.7])];
    return figure(sign, [...name, ...word(what, x + 4.7 + 3, base)]);
  };
  const prime: FigureLetter = { c: "'", box: [207, base - 7.2, 208, base - 5.2], at: null, size: 3 };

  it("is no double bond after an R': R' = OH says what R' is", () => {
    const read = readFigure(named([...word("R", 200, base), prime], "OH"));
    expect(own(read)).toEqual([]);
  });

  it("is a double bond between two labels that name no variable: S=O drawn the same", () => {
    const read = readFigure(named(word("S", 200, base), "O"));
    expect(own(read).map((b) => b.order)).toEqual([2]);
  });
});

describe("an I drawn as a line on a line of text", () => {
  // (a label over a line of reagents - "Bn" - and on the line under it an n, then an I drawn as a line as tall as a capital, then its
  // small 2: the I stands under the label, its top a third of a letter off it)
  const letters = [...word("Bn", 203, 290), ...word("n", 200, 303), { c: "2", box: [211.2, 300, 213.6, 304.4] as [number, number, number, number], at: null, size: 6 }];

  it("is that letter, no bond to the label over it", () => {
    const read = readFigure(figure([line([209.5, 295.8], [209.5, 303])], letters));
    expect(own(read)).toEqual([]);
  });

  it("is a bond where it is as tall as the letters' size, standing on the same baseline: a capital is under nine tenths of it", () => {
    const read = readFigure(figure([line([209.5, 294], [209.5, 303])], letters));
    expect(own(read)).toHaveLength(1);
  });

  it("is a bond where it is a bond long: no capital is so tall", () => {
    const read = readFigure(figure([line([209.5, 295.8], [209.5, 295.8 + L])], letters));
    expect(own(read)).toHaveLength(1);
  });
});

describe("a mark between two words", () => {
  const base = 300;
  const between = (a: string, b: string, y0: number, y1: number, reads: (l: string) => boolean = () => true) => {
    const first = word(a, 200, base);
    const x = right(first) + 1;
    return readFigure(figure([mark(x, y0, x + 0.8, y1)], [...first, ...word(b, x + 3.5, base)]), reads);
  };

  it("at their foot is a comma, no bond: Cs2CO3, acetone", () => {
    expect(own(between("Cs2CO3", "acetone", base - 0.8, base + 0.9))).toEqual([]);
  });

  it("at their middle is a bond between labels drawn so short that little of it is left: S-O", () => {
    expect(own(between("S", "O", base - 4.4, base - 2.8))).toHaveLength(1);
  });

  it("at their middle is none where a word reads as no label: key: O", () => {
    expect(own(between("key", "O", base - 4.4, base - 2.8, (l) => l === "O"))).toEqual([]);
  });
});

describe("a line alone by the structures", () => {
  it("is no structure three bonds long: a chart's level, its energy over it, the chart's long lines on from its ends", () => {
    const [p, q]: P[] = [
      [200, 300],
      [200 + 3 * L, 300],
    ];
    const on = (from: P, dx: number): FigurePath => line(from, [from[0] + dx * 7 * L * Math.cos(Math.PI / 12), from[1] - 7 * L * Math.sin(Math.PI / 12)], 0.8);
    const read = readFigure(figure([line(p, q, 1.6), on(p, -1), on(q, 1)], word("12", 210, 296)), () => false);
    expect(own(read)).toEqual([]);
  });

  it("is no structure half a bond long, single or double: a dagger's strokes", () => {
    const read = readFigure(figure([line([210, 290], [210, 297.5]), line([207.8, 292], [212.2, 292]), line([207.8, 294.5], [212.2, 294.5])]));
    expect(own(read)).toEqual([]);
  });

  it("is a structure a bond long, double or triple, and said: an ethylene, an ethyne beside a scheme's +", () => {
    const read = readFigure(
      figure([
        line([200, 300], [200 + L, 300]),
        line([200 + 0.1 * L, 300 + 0.18 * L], [200 + 0.9 * L, 300 + 0.18 * L]),
        line([200, 340], [200 + L, 340]),
        line([200, 340 + 0.18 * L], [200 + L, 340 + 0.18 * L]),
        line([200, 340 - 0.18 * L], [200 + L, 340 - 0.18 * L]),
      ]),
    );
    expect(own(read).map((b) => [b.order, b.unsure])).toEqual([
      [2, [LONE_DOUBLE]],
      [3, [LONE_TRIPLE]],
    ]);
    expect(read.left.lines).toBeUndefined();
  });

  it("is no ethane a bond long and single: left out, and counted to be said", () => {
    const read = readFigure(figure([line([200, 300], [200 + L, 300]), line([200, 340], [200 + L, 340])]));
    expect(own(read)).toEqual([]);
    expect(read.left.lines).toBe(2);
    // (the ring by them is read as it is)
    expect(read.bonds).toHaveLength(6);
  });
});

describe("withoutStrays", () => {
  const at = (x: number, y: number, more: Partial<ReadAtom> = {}): ReadAtom => ({ x, y, ...more });

  it("leaves out a point with no label and no bond, and a bare line alone not a bond long; keeps the rest, its bonds renumbered", () => {
    const atoms = [at(0, 0), at(10, 0), at(20, 0), at(100, 100), at(200, 0), at(230, 0), at(300, 0, { label: "O" }), at(300, 50), at(330, 50)];
    const bonds = [
      { a: 0, b: 1, order: 1 as const },
      { a: 1, b: 2, order: 1 as const },
      { a: 4, b: 5, order: 1 as const },
      { a: 7, b: 8, order: 2 as const },
    ];
    const kept = withoutStrays(atoms, bonds, 10);
    expect(kept.atoms.map((a) => [a.x, a.y])).toEqual([
      [0, 0],
      [10, 0],
      [20, 0],
      [300, 0],
    ]);
    expect(kept.bonds).toEqual([
      { a: 0, b: 1, order: 1 },
      { a: 1, b: 2, order: 1 },
    ]);
  });

  it("counts a bare single line alone a bond long, left out; keeps a double or triple one, said; a line bonded on is as it was", () => {
    const atoms = [at(0, 0), at(10, 0), at(100, 0), at(109, 0), at(200, 0), at(211, 0), at(300, 0), at(310, 0), at(320, 0), at(400, 0), at(410, 0, { label: "O" })];
    const bonds = [
      { a: 0, b: 1, order: 1 as const },
      { a: 2, b: 3, order: 2 as const },
      { a: 4, b: 5, order: 3 as const, unsure: ["Drawn twice over: read as one bond."] },
      { a: 6, b: 7, order: 1 as const },
      { a: 7, b: 8, order: 1 as const },
      { a: 9, b: 10, order: 2 as const },
    ];
    const kept = withoutStrays(atoms, bonds, 10);
    expect(kept.lone).toBe(1);
    expect(kept.bonds).toEqual([
      { a: 0, b: 1, order: 2, unsure: [LONE_DOUBLE] },
      { a: 2, b: 3, order: 3, unsure: ["Drawn twice over: read as one bond.", LONE_TRIPLE] },
      { a: 4, b: 5, order: 1 },
      { a: 5, b: 6, order: 1 },
      { a: 7, b: 8, order: 2 },
    ]);
    // (said once, read again)
    expect(withoutStrays(kept.atoms, kept.bonds, 10).bonds[0].unsure).toEqual([LONE_DOUBLE]);
    // (none left out: the lines said all the same, none counted)
    expect(withoutStrays(atoms.slice(2, 4), [{ a: 0, b: 1, order: 2 }], 10)).toEqual({ atoms: atoms.slice(2, 4), bonds: [{ a: 0, b: 1, order: 2, unsure: [LONE_DOUBLE] }], lone: 0 });
  });

  it("keeps a point alone that has a label, a charge drawn by it, or a radical's dot", () => {
    const atoms = [at(0, 0, { label: "Na+" }), at(50, 0, { marked: 1 }), at(100, 0, { dots: 1 })];
    expect(withoutStrays(atoms, [], 10).atoms).toHaveLength(3);
  });
});
