/**
 * A bond's end takes the label it points into within a third of a bond - a bond as long as the label's letters say one is drawn,
 * where that is longer than the drawing's own lines: a drawing whose every bond runs between labels, each cut back at both ends,
 * measures its bonds short (found in review: a metal's chlorides set in a serif typeface, whose ink sits a little lower, were read
 * as carbons, and nothing was said).
 */
import { describe, expect, it } from "vitest";
import type { Box, FigureDrawn, FigureLetter, FigurePath, PathStep } from "./drawn";
import { readFigure } from "./read";

type P = [number, number];
const stroke = (...pts: P[]): FigurePath => ({ fill: null, stroke: "#000000ff", width: 0.6, d: pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]) });
/** Letters set from a point, the first's middle there, 10 points high and about as wide as Helvetica's. */
function word(text: string, [x, y]: P): FigureLetter[] {
  return [...text].map((c, i) => {
    const left = x - 3.4 + i * 6.8;
    const box: Box = [left, y + 3.6 - 7.2, left + 6.8, y + 3.6];
    return { c, box, at: [left, y + 3.6], size: 10 };
  });
}
const figure = (paths: FigurePath[], letters: FigureLetter[]): FigureDrawn => ({ paths, letters, pictures: [] });

describe("a bond's end by a label, every bond of the drawing between labels", () => {
  // (a Pt with a Cl below and above it to its left; each bond from just inside the Pt's label to about three points short of a Cl's
  //  ink, along a diagonal - its lines 7.35 long, a third of the bond its letters say)
  const metal = (gap: number) =>
    figure(
      [stroke([96.2, 97.0], [91, 102.2 + gap]), stroke([96.2, 89.0], [91, 83.8 - gap])],
      [...word("Pt", [100, 93]), ...word("Cl", [80, 110]), ...word("Cl", [80, 76])],
    );

  it("takes it where its letters say a bond reaches, though the drawing's lines measure its bonds short", () => {
    const r = readFigure(metal(0));
    expect(r.atoms.map((a) => a.label ?? "C").sort()).toEqual(["Cl", "Cl", "Pt"]);
    expect(r.bonds.length).toBe(2);
  });

  it("keeps the drawing's own bond by a word that is no element's label: a chart's number by its tick, a legend's word", () => {
    const chart = figure(
      [stroke([96.2, 97.0], [91, 102.2]), stroke([96.2, 89.0], [91, 83.8])],
      [...word("Pt", [100, 93]), ...word("0.8", [80, 110]), ...word("Cl", [80, 76])],
    );
    expect(readFigure(chart).atoms.map((a) => a.label ?? "C").sort()).toEqual(["C", "Cl", "Pt"]);
  });

  it("is a carbon still where it stops much further off: a third of that bond and more", () => {
    const r = readFigure(metal(-3));
    expect(r.atoms.filter((a) => !a.label).length).toBe(2);
  });
});
