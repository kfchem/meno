/**
 * Held beside textAndCharts.test.ts: a lone line is counted - as ethane, as ethyne - only where it is about a bond long; a double line of
 * any other length is left out, not kept; the = of a variable's name is a sign only where its two lines are level. (Found in review.)
 */
import { describe, expect, it } from "vitest";
import type { FigureDrawn, FigureLetter, FigurePath, PathStep } from "./drawn";
import { readFigure, withoutStrays, type ReadAtom, type ReadBond } from "./read";

const L = 14.4;
type P = [number, number];
const line = (a: P, b: P, w = 0.6): FigurePath => ({ fill: null, stroke: "#000000ff", width: w, d: [["M", a[0], a[1]], ["L", b[0], b[1]]] as PathStep[] });
const hex = (cx: number, cy: number): P[] => Array.from({ length: 6 }, (_, i) => [cx + L * Math.cos((Math.PI / 3) * i), cy + L * Math.sin((Math.PI / 3) * i)] as P);
const ring = (): FigurePath[] => hex(60, 60).map((p, i, all) => line(p, all[(i + 1) % 6]));
const figure = (paths: FigurePath[], letters: FigureLetter[] = []): FigureDrawn => ({ paths: [...ring(), ...paths], letters, pictures: [] });
const word = (text: string, x: number, base: number, size = 10): FigureLetter[] =>
  [...text].map((c, i) => {
    const top = base - (/[a-z]/.test(c) && !/[bdfhklt]/.test(c) ? 0.5 : 0.72) * size;
    const x0 = x + 0.68 * size * i;
    return { c, box: [x0, top, x0 + 0.62 * size, base], at: [x0, base], size };
  });
const right = (ls: FigureLetter[]) => ls[ls.length - 1].box[2];
const own = (r: ReturnType<typeof readFigure>) => r.bonds.filter((b) => Math.min(r.atoms[b.a].x, r.atoms[b.b].x) > 150);

describe("a line alone, counted where it is about a bond long", () => {
  const strays = (len: number, order: number) => {
    const atoms: ReadAtom[] = [{ x: 0, y: 0 }, { x: len, y: 0 }];
    const bonds: ReadBond[] = [{ a: 0, b: 1, order: order as 1 | 2 | 3 }];
    return withoutStrays(atoms, bonds, L);
  };
  it("a single line of a bond is one, counted; half a bond long, or one and a half, it is left out and not counted", () => {
    expect(strays(L, 1)).toMatchObject({ lone: 1, triples: 0, bonds: [], atoms: [] });
    for (const len of [0.5 * L, 1.5 * L]) expect(strays(len, 1), `${len}`).toMatchObject({ lone: 0, triples: 0, bonds: [], atoms: [] });
  });
  it("a triple line of a bond is one, counted; half a bond long it is left out and not counted", () => {
    expect(strays(L, 3)).toMatchObject({ lone: 0, triples: 1, bonds: [] });
    expect(strays(0.5 * L, 3)).toMatchObject({ lone: 0, triples: 0, bonds: [] });
  });
  it("a double line of a bond is kept, said; half a bond long it is left out", () => {
    expect(strays(L, 2).bonds).toHaveLength(1);
    expect(strays(0.5 * L, 2)).toMatchObject({ lone: 0, triples: 0, bonds: [], atoms: [] });
  });
});

describe("the = of a variable's name, a sign where it is level", () => {
  const base = 300;
  const prime: FigureLetter = { c: "'", box: [207, base - 7.2, 208, base - 5.2], at: null, size: 3 };
  /** R' (or `name`), an = `gap` from it - two lines 4.7 long, `slant` points off level - and OH a space after. */
  const named = (gap: number, slant: number) => {
    const name = [...word("R", 200, base), prime];
    const x = right(name) + gap;
    const sign = [line([x, base - 4.5], [x + 4.7, base - 4.5 - slant]), line([x, base - 2.7], [x + 4.7, base - 2.7 - slant])];
    return figure(sign, [...name, ...word("OH", x + 4.7 + gap, base)]);
  };
  it("is no double bond as the tests have it: level, 3 points from the words", () => {
    expect(own(readFigure(named(3, 0)))).toEqual([]);
  });
  it("is a bond where its lines are slanted, 2.5 points off level over 4.7 along", () => {
    expect(own(readFigure(named(3, 2.5))).length).toBeGreaterThan(0);
  });
});
