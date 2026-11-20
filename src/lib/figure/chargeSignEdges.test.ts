// Held beside read.test.ts: a charge's sign set alone by a label - its count, a second sign on the same label, the nearer of two labels, a circled plus, the edges of its place, and the sign no longer a word left over.
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
const right = stroke(along(c, step(c, 0), 0.35), step(c, 0));
const EN = "\u2013";

describe("a charge's sign set alone by a label, at its edges", () => {
  it("takes its count: 2 and a dash over the O are -2", () => {
    expect(chargeOf(figure([right], [...word("O", c), ...word(`2${EN}`, [c[0] - 3.4, c[1] - 10])]), "O")).toBe(-2);
  });

  it("adds a second sign to the first: a dash over the O and one under it are -2", () => {
    expect(chargeOf(figure([right], [...word("O", c), ...word(EN, [c[0], c[1] - 10]), ...word(EN, [c[0], c[1] + 10])]), "O")).toBe(-2);
  });

  it("gives a sign to the nearer of two labels, one over the other", () => {
    // (an O at y 60 and an N at y 86, each with its bond: the dash at y 72, 4.8 points from the O's letters and 6.8 from the N's)
    const n: P = [60, 86];
    const f = figure([right, stroke(along(n, step(n, 0), 0.35), step(n, 0))], [...word("O", c), ...word("N", n), ...word(EN, [60, 72])]);
    expect([chargeOf(f, "O"), chargeOf(f, "N")]).toEqual([-1, 0]);
  });

  it("takes a circled plus beside, set high, as a plus", () => {
    const four = [45, 135, 225, 315].map((d) => stroke(along(c, step(c, d), 0.35), step(c, d)));
    expect(chargeOf(figure(four, [...word("N", c), ...word("\u2295", [c[0] + 11, c[1] - 5])]), "N")).toBe(1);
  });

  it("is a sign beside the label only within its place: not set two letters high, nor with its letters across the label's", () => {
    expect(chargeOf(figure([right], [...word("O", c), ...word(EN, [c[0] - 8, c[1] - 14])]), "O")).toBe(0);
    expect(chargeOf(figure([right], [...word("O", c), ...word(EN, [c[0] - 4, c[1] - 4])]), "O")).toBe(0);
  });

  it("is a sign over the label only a letter's height off at most, its box not across the label's", () => {
    expect(chargeOf(figure([right], [...word("O", c), ...word(EN, [c[0], c[1] - 2])]), "O")).toBe(0);
  });

  it("is no word left over once it is a charge", () => {
    const left = readFigure(figure([right], [...word("O", c), ...word(EN, [c[0], c[1] - 10])]), (l) => readDrawnLabel(l, reads).read).left;
    expect(left.letters).toHaveLength(0);
  });
});
