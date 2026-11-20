// Held beside read.test.ts: the line drawn between a charge's sign and its label - a bracket's side - and where it must stand to be one: upright, in the gap between them (a tenth of the size beyond either edge), leaning under a third of its height, reaching the sign's height.
import { describe, expect, it } from "vitest";
import type { Box, FigureDrawn, FigureLetter, FigurePath, PathStep } from "./drawn";
import { readFigure } from "./read";
import { readDrawnLabel, structureOf, type LabelReader } from "./structure";

const L = 14.4;
type P = [number, number];
const stroke = (...pts: P[]): FigurePath => ({ fill: null, stroke: "#000000ff", width: 0.6, d: pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]) });
/** Letters set from a point, as the tests of read.test.ts set them: 10 points tall, 6.8 wide, the first's left edge 3.4 left of the point. */
function word(text: string, [x, y]: P): FigureLetter[] {
  const out: FigureLetter[] = [];
  let left = x - 3.4;
  for (const c of text) {
    out.push({ c, box: [left, y + 3.6 - 7.2, left + 6.8, y + 3.6] as Box, at: [left, y + 3.6], size: 10 });
    left += 6.8;
  }
  return out;
}
const step = (p: P, deg: number): P => [p[0] + L * Math.cos((deg * Math.PI) / 180), p[1] - L * Math.sin((deg * Math.PI) / 180)];
const along = (p: P, q: P, t: number): P => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
const figure = (paths: FigurePath[], letters: FigureLetter[] = []): FigureDrawn => ({ paths, letters, pictures: [] });
const reads: LabelReader = (label) => {
  const m = /^([A-Z][a-z]?)(H\d*)?([+-]?)$/.exec(label);
  return m && ["C", "H", "N", "O", "S", "Cl", "I"].includes(m[1]) ? { el: m[1], charge: m[3] === "+" ? 1 : m[3] === "-" ? -1 : 0 } : null;
};
const read = (f: FigureDrawn) => structureOf(readFigure(f, (l) => readDrawnLabel(l, reads).read), reads);
const chargeOf = (f: FigureDrawn, el: string) => read(f).atoms.find((a) => a.el === el)?.charge ?? 0;

const c: P = [60, 60];
const EN = "\u2013";
/** An alkoxide O with its bond straight down, and an en dash after it, set high: the O's minus (-1). */
const down = stroke(along(c, step(c, 270), 0.35), step(c, 270));
const upBond = stroke(along(c, step(c, 90), 0.35), step(c, 90));
const AFTER: P = [c[0] + 11, c[1] - 3.5];
const BEFORE: P = [c[0] - 11, c[1] - 3.5];
const upright = (x: number, top: number, bottom: number) => stroke([c[0] + x, c[1] + top], [c[0] + x, c[1] + bottom]);
const withLine = (line: FigurePath | null, at: P = AFTER, bond: FigurePath = down) => figure(line ? [bond, line] : [bond], [...word("O", c), ...word(EN, at)]);
const o = (f: FigureDrawn) => chargeOf(f, "O");

describe("a bracket's side drawn between a sign and its label", () => {
  it("is the ion's sign, not the label's: an upright line in the gap, as high as the sign", () => {
    expect(o(withLine(null))).toBe(-1);
    expect(o(withLine(upright(5, -4.5, 4.5)))).toBe(0);
    expect(o(withLine(upright(5, -4.5, 4.5), BEFORE))).toBe(-1);
    expect(o(withLine(upright(-5, -4.5, 4.5), BEFORE))).toBe(0);
  });

  it("is a bracket only while it is upright: a line leaning a third of its height or more is a bond's, one leaning under that is a bracket's", () => {
    // (the O's bond to its left; the dash 12 right of it, 2 high; the line 9 tall, its two ends 4.5 and 1.8 right of each other)
    const left = stroke(along(c, step(c, 180), 0.35), step(c, 180));
    const dash: P = [c[0] + 12, c[1] - 2];
    const lean = (run: number) => stroke([c[0] + 5 - run / 2, c[1] - 4.5], [c[0] + 5 + run / 2, c[1] + 4.5]);
    expect(o(withLine(lean(4.5), dash, left))).toBe(-1);
    expect(o(withLine(lean(2.8), dash, left))).toBe(-1);
    expect(o(withLine(lean(2.6), dash, left))).toBe(0);
    expect(o(withLine(lean(1.8), dash, left))).toBe(0);
  });

  it("is a bracket only between them: not one at the label's far side, nor one beyond the sign", () => {
    expect(o(withLine(upright(-6, -4.5, 4.5)))).toBe(-1);
    expect(o(withLine(upright(16, -4.5, 4.5)))).toBe(-1);
  });

  it("is a bracket at the label's edge or a little inside it, and not the label's own bond through its middle", () => {
    expect(o(withLine(upright(3, -4.5, 4.5)))).toBe(0);
    // (an alkoxide's bond straight up from its O, the minus set high beside it: the bond is no bracket)
    expect(o(withLine(null, [c[0] + 11, c[1] - 8], upBond))).toBe(-1);
  });

  it("is a bracket only where it reaches the sign's height: not one wholly above it, nor wholly below it", () => {
    expect(o(withLine(upright(5, -12, -6)))).toBe(-1);
    expect(o(withLine(upright(5, -1, 8)))).toBe(-1);
  });
});
