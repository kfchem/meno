import { describe, expect, it } from "vitest";
import type { FigureDrawn, FigureLetter, FigurePath, PathStep } from "./drawn";
import { readScheme } from "./scheme";
import { readDrawnLabel, structureOf, type LabelReader } from "./structure";
import { turnFigure, turnOf, turnPoint, uprightFigure } from "./turn";

// As in read.test.ts: points from the page's top left, y down; bonds 14.4 long, letters 10 points.
const L = 14.4;
type P = [number, number];
const stroke = (...pts: P[]): FigurePath => ({ fill: null, stroke: "#000000ff", width: 0.6, d: pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]) });
/** Letters set from a point - the first's middle there - each starting its baseline at its box's bottom left. */
function word(text: string, [x, y]: P): FigureLetter[] {
  return [...text].map((c, i) => {
    const left = x - 3.4 + i * 6.8;
    const w = c === "l" ? 1 : 5.6;
    return { c, box: [left + 0.5, y - 3.6, left + 0.5 + w, y + 3.6], at: [left, y + 3.6], size: 10 };
  });
}
const reads: LabelReader = (label) => (["C", "Cl", "N", "O"].includes(label) ? { el: label } : null);
const elements = (f: FigureDrawn) => structureOf(readScheme(f, (l) => readDrawnLabel(l, reads).read).figure, reads).atoms.map((a) => a.el).sort();

/** A chain of two carbons to a chlorine, its label at the chain's end. */
const chloride = (): FigureDrawn => {
  const a: P = [60, 60];
  const b: P = [a[0] + L * 0.866, a[1] - L / 2];
  const cl: P = [b[0] + L * 0.866 + 3, b[1] + L / 2];
  return { paths: [stroke(a, b, [cl[0] - 5, cl[1] - 2.5])], letters: word("Cl", cl), pictures: [] };
};

describe("a figure's words turned", () => {
  it("tells how its letters are turned by where their baselines start", () => {
    const f = chloride();
    expect(turnOf(f.letters)).toBe(0);
    for (const t of [1, 2, 3]) expect(turnOf(turnFigure(f, t, { x: 80, y: 60 }).letters)).toBe(t);
  });

  it("reads a figure on a page turned a quarter either way, or a half, as it reads upright", () => {
    const f = chloride();
    expect(elements(f)).toEqual(["C", "C", "Cl"]);
    for (const t of [1, 2, 3]) {
      const turned = turnFigure(f, t, { x: 80, y: 60 });
      expect(elements(uprightFigure(turned).drawn)).toEqual(["C", "C", "Cl"]);
    }
    // (left turned, its letters one over another: no Cl)
    expect(elements(turnFigure(f, 1, { x: 80, y: 60 }))).not.toEqual(["C", "C", "Cl"]);
  });

  it("ties each point read upright to where it lies on the page", () => {
    const turned = turnFigure(chloride(), 1, { x: 80, y: 60 });
    const { drawn, onPage } = uprightFigure(turned);
    const mid = (l: FigureLetter) => ({ x: (l.box[0] + l.box[2]) / 2, y: (l.box[1] + l.box[3]) / 2 });
    const back = onPage(mid(drawn.letters[0]));
    expect(back.x).toBeCloseTo(mid(turned.letters[0]).x, 6);
    expect(back.y).toBeCloseTo(mid(turned.letters[0]).y, 6);
    expect(turnPoint(turnPoint({ x: 3, y: 4 }, 1, { x: 0, y: 0 }), 3, { x: 0, y: 0 })).toEqual({ x: 3, y: 4 });
  });
});
