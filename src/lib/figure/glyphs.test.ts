import { describe, expect, it } from "vitest";
import type { FigureDrawn, FigurePath, PathStep, Point } from "./drawn";
import { shapesOf } from "./drawn";
import { GRID, glyphShape, inkOf, shapeLetters, type GlyphShape } from "./glyphs";
import { readFigure } from "./read";
import { readDrawnLabel, structureOf, type LabelReader } from "./structure";

// A small typeface of the test's own, in ems, y down, the line at naught,
// its capitals 0.72 tall: an O, an H, an N, a C, an l and a minus.
type Glyph = { parts: [number, number][][]; advance: number };
const ring = (cx: number, cy: number, rx: number, ry: number, n = 24): [number, number][] =>
  Array.from({ length: n }, (_, k) => [cx + rx * Math.cos((2 * Math.PI * k) / n), cy + ry * Math.sin((2 * Math.PI * k) / n)]);
const FACE: Record<string, Glyph> = {
  O: { parts: [ring(0.39, -0.36, 0.36, 0.37), ring(0.39, -0.36, 0.26, 0.28).reverse()], advance: 0.78 },
  H: {
    parts: [[[0.08, -0.72], [0.18, -0.72], [0.18, -0.41], [0.54, -0.41], [0.54, -0.72], [0.64, -0.72], [0.64, 0], [0.54, 0], [0.54, -0.32], [0.18, -0.32], [0.18, 0], [0.08, 0]]],
    advance: 0.72,
  },
  N: { parts: [[[0.08, -0.72], [0.19, -0.72], [0.54, -0.16], [0.54, -0.72], [0.64, -0.72], [0.64, 0], [0.53, 0], [0.18, -0.56], [0.18, 0], [0.08, 0]]], advance: 0.72 },
  C: {
    parts: [
      [
        ...Array.from({ length: 19 }, (_, k): [number, number] => {
          const a = Math.PI / 4 + (k / 18) * (1.5 * Math.PI);
          return [0.4 + 0.35 * Math.cos(a), -0.36 - 0.37 * Math.sin(a)];
        }),
        ...Array.from({ length: 19 }, (_, k): [number, number] => {
          const a = Math.PI / 4 + ((18 - k) / 18) * (1.5 * Math.PI);
          return [0.4 + 0.25 * Math.cos(a), -0.36 - 0.27 * Math.sin(a)];
        }),
      ],
    ],
    advance: 0.72,
  },
  l: { parts: [[[0.07, -0.72], [0.16, -0.72], [0.16, 0], [0.07, 0]]], advance: 0.22 },
  "-": { parts: [[[0.05, -0.3], [0.5, -0.3], [0.5, -0.24], [0.05, -0.24]]], advance: 0.58 },
};
const pts = (ps: [number, number][], k = 1, dx = 0, dy = 0): Point[] => ps.map(([x, y]) => ({ x: x * k + dx, y: y * k + dy }));
const KNOWN: GlyphShape[] = Object.entries(FACE).map(([c, g]) => glyphShape(c, g.parts.map((p) => pts(p)), 0.72));

/** A word drawn as outlines from the line at (x, y), 10 points large: each letter a filled path, its holes in it. */
function outlined(text: string, x: number, y: number, size = 10): FigurePath[] {
  const out: FigurePath[] = [];
  let left = x;
  for (const c of text) {
    const g = FACE[c];
    const d: PathStep[] = g.parts.flatMap((p) => [...pts(p, size, left, y).map((q, i): PathStep => [i ? "L" : "M", q.x, q.y]), ["Z"] as PathStep]);
    out.push({ fill: "#000000ff", stroke: null, width: 0, d });
    left += g.advance * size;
  }
  return out;
}
const stroke = (a: [number, number], b: [number, number]): FigurePath => ({ fill: null, stroke: "#000000ff", width: 0.6, d: [["M", ...a], ["L", ...b]] });
const reads: LabelReader = (label) => {
  const m = /^([A-Z][a-z]?)(H\d*)?([+-]?)$/.exec(label);
  return m && ["C", "N", "O", "Cl"].includes(m[1]) ? { el: m[1], charge: m[3] === "-" ? -1 : m[3] === "+" ? 1 : 0 } : null;
};

describe("letters drawn as their outlines", () => {
  it("lays a shape's ink on the grid, holes left empty", () => {
    const o = FACE.O.parts.map((p) => pts(p));
    const ink = inkOf(o, [0.03, -0.73, 0.75, 0.01]);
    expect(ink).toHaveLength(GRID * GRID);
    // (the middle is the O's hole; its side is ink)
    expect(ink[(GRID / 2) * GRID + GRID / 2]).toBe(0);
    expect(ink[(GRID / 2) * GRID + 0]).toBeGreaterThan(0.5);
  });

  it("reads each shape as the letter it matches, a hole with its letter", () => {
    const f: FigureDrawn = { paths: [...outlined("NOH", 100, 100), stroke([60, 96], [99, 96]), stroke([40, 106], [60, 96])], letters: [], pictures: [] };
    const read = shapeLetters(shapesOf(f), 14.4, KNOWN);
    expect([...read].sort((p, q) => p.box[0] - q.box[0]).map((l) => l.c).join("")).toBe("NOH");
    expect(read.every((l) => l.sure > 0.8)).toBe(true);
  });

  it("reads a figure whose labels are outlines: OH on a chain, N in a ring", () => {
    const f: FigureDrawn = {
      paths: [
        stroke([60, 112], [80, 100]),
        stroke([80, 100], [100, 112]),
        // (to the O, cut short of its letters)
        stroke([100, 112], [114, 104]),
        ...outlined("OH", 115, 104),
      ],
      letters: [],
      pictures: [],
    };
    const s = structureOf(readFigure(f, (l) => readDrawnLabel(l, reads).read, KNOWN), reads);
    expect(s.atoms.map((a) => a.el).sort()).toEqual(["C", "C", "C", "O"]);
    expect(s.atoms.some((a) => a.unsure)).toBe(false);
  });

  it("takes an upright bar beside a letter as a letter's stem: Cl", () => {
    const f: FigureDrawn = { paths: [stroke([60, 96], [99, 96]), stroke([40, 106], [60, 96]), ...outlined("C", 100, 100), { ...outlined("l", 107.2, 100)[0] }], letters: [], pictures: [] };
    const s = structureOf(readFigure(f, (l) => readDrawnLabel(l, reads).read, KNOWN), reads);
    expect(s.atoms.map((a) => a.el).sort()).toEqual(["C", "C", "Cl"]);
  });

  it("reads no solid round dot as a letter: a mark set at a chain's end", () => {
    // (a filled disc, its round outline given as the points along its curve, at the chain's free end - as a scheme marks where a
    // group goes)
    const disc = (cx: number, cy: number, r: number): FigurePath => ({
      fill: "#073f80ff",
      stroke: null,
      width: 0,
      d: [...ring(cx, cy, r, r, 32).map(([x, y], i): PathStep => [i ? "C" : "M", x, y]), ["Z"]],
    });
    const f: FigureDrawn = {
      paths: [disc(60, 112, 2.6), stroke([60, 112], [80, 100]), stroke([80, 100], [100, 112]), stroke([100, 112], [114, 104]), ...outlined("OH", 115, 104)],
      letters: [],
      pictures: [],
    };
    // (the typeface's own e, heavy - nearly all ink but for its small eye - as like a dot as any letter is)
    const e = glyphShape("e", [pts(ring(0.3, -0.27, 0.27, 0.27)), pts(ring(0.3, -0.3, 0.03, 0.02).reverse())], 0.72);
    expect(shapeLetters(shapesOf(f), 14.4, [e, ...KNOWN]).map((l) => l.c).sort()).toEqual(["H", "O"]);
    const s = structureOf(readFigure(f, (l) => readDrawnLabel(l, reads).read, [e, ...KNOWN]), reads);
    expect(s.atoms.map((a) => a.el).sort()).toEqual(["C", "C", "C", "O"]);
  });

  it("tells a round letter set alone by the figure's capitals: an O at a bond's end, as tall as the NH elsewhere", () => {
    // (a small o drawn as the capital is, only smaller - matched as well as the O, and taken first)
    const o = glyphShape("o", FACE.O.parts.map((p) => pts(p)), 0.72);
    const f: FigureDrawn = {
      paths: [stroke([60, 112], [80, 100]), stroke([80, 100], [100, 112]), stroke([100, 112], [114, 104]), ...outlined("O", 115, 104), stroke([40, 106], [60, 112]), ...outlined("NH", 20, 112)],
      letters: [],
      pictures: [],
    };
    const read = shapeLetters(shapesOf(f), 14.4, [o, ...KNOWN]);
    expect([...read].sort((p, q) => p.box[0] - q.box[0]).map((l) => l.c).join("")).toBe("NHO");
  });

  it("reads nothing as letters without the letters' shapes to match", () => {
    const f: FigureDrawn = { paths: outlined("OH", 100, 100), letters: [], pictures: [] };
    expect(shapeLetters(shapesOf(f), 14.4, [])).toEqual([]);
  });
});
