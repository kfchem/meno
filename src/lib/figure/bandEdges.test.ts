// Held beside read.test.ts: how wide a line may be and be a bond is the figure's usual letter size - the median of its letters, not the smallest or the largest - and a line exactly as wide as the bound allows (1.2 of it) is a bond.
import { describe, expect, it } from "vitest";
import type { Box, FigureDrawn, FigureLetter, FigurePath, PathStep } from "./drawn";
import { readFigure } from "./read";

type P = [number, number];
const L = 14.4;
const stroke = (...pts: P[]): FigurePath => ({ fill: null, stroke: "#000000ff", width: 0.6, d: pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]) });
const wide = (p: P, q: P, width: number, ink: string): FigurePath => ({ ...stroke(p, q), width, stroke: ink });
/** Letters set from a point at `size` points: 0.72 of it tall, 0.68 wide, the first's left edge 0.34 left of the point. */
function word(text: string, [x, y]: P, size = 10): FigureLetter[] {
  const out: FigureLetter[] = [];
  let left = x - 0.34 * size;
  for (const c of text) {
    out.push({ c, box: [left, y + 0.36 * size - 0.72 * size, left + 0.68 * size, y + 0.36 * size] as Box, at: [left, y + 0.36 * size], size });
    left += 0.68 * size;
  }
  return out;
}
const step = (p: P, deg: number): P => [p[0] + L * Math.cos((deg * Math.PI) / 180), p[1] - L * Math.sin((deg * Math.PI) / 180)];
const figure = (paths: FigurePath[], letters: FigureLetter[] = []): FigureDrawn => ({ paths, letters, pictures: [] });
const hexagon = (from: P): FigurePath[] => {
  const pts: P[] = [from];
  for (let k = 1; k < 6; k++) pts.push(step(pts[k - 1], 60 * k));
  return pts.map((p, i) => stroke(p, pts[(i + 1) % 6]));
};
const ring = hexagon([100, 120]);
const side: [P, P] = [[100, 120], step([100, 120], 60)];
/** A hexagon whose one side is drawn only as a pale line `width` wide, "L1" in 10-point letters inside, and `extra` letters elsewhere on the page. */
const onlyHighlight = (width: number, extra: FigureLetter[] = []) => readFigure(figure([...ring.slice(1), wide(side[0], side[1], width, "#e7e7e7ff")], [...word("L1", [130, 160]), ...extra]));

describe("how wide a line may be and be a bond", () => {
  it("is 1.2 of the figure's letters, the line exactly as wide as that allows a bond, one wider not", () => {
    expect(onlyHighlight(12).bonds).toHaveLength(6);
    expect(onlyHighlight(12.5).bonds).toHaveLength(5);
  });

  it("is of the usual letter size, not the smallest: a small letter among 10-point ones does not make an 11-wide highlight a band", () => {
    expect(onlyHighlight(11, word("2", [300, 300], 6)).bonds).toHaveLength(6);
  });

  it("is of the usual letter size, not the largest: a large letter among 10-point ones does not make a 14-wide row a table's", () => {
    const band = [[40, 130], [130, 175], [175, 215], [215, 255]].map(([a, b]) => wide([a, 300], [b, 300], 14, "#e6e6e6ff"));
    const headings = [...word("strain", [60, 300]), ...word("1a", [150, 300]), ...word("1b", [190, 300]), ...word("1c", [230, 300]), ...word("T", [100, 200], 24)];
    const r = readFigure(figure(band, headings));
    expect(r.atoms).toHaveLength(0);
    expect(r.bonds).toHaveLength(0);
  });
});
