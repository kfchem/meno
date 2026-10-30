import { describe, expect, it } from "vitest";
import { mirrorLines, MIRROR_TOL, pt } from "./geometry";
import { layout2D } from "./engine";
import { fromSmiles } from "./testdata/fromSmiles";

const deg = (lines: number[]) => lines.map((t) => Math.round((t * 180) / Math.PI)).sort((a, b) => a - b);

describe("mirrorLines", () => {
  it("finds every line a drawing is its own mirror image in", () => {
    // (a square of one kind: its two diagonals and its two midlines)
    const square = [pt(0, 0), pt(1, 0), pt(1, 1), pt(0, 1)];
    const sides: [number, number, string][] = [[0, 1, "1"], [1, 2, "1"], [2, 3, "1"], [3, 0, "1"]];
    expect(deg(mirrorLines(square, ["C", "C", "C", "C"], sides, 0.01))).toEqual([0, 45, 90, 135]);
  });

  it("keeps the kinds of points and edges: a different atom, or a double bond on one side, breaks a mirror", () => {
    const square = [pt(0, 0), pt(1, 0), pt(1, 1), pt(0, 1)];
    const sides: [number, number, string][] = [[0, 1, "1"], [1, 2, "1"], [2, 3, "1"], [3, 0, "1"]];
    // (an N at one corner: only the diagonal through it)
    expect(deg(mirrorLines(square, ["N", "C", "C", "C"], sides, 0.01))).toEqual([45]);
    // (a double bond along one side: only the midline across it)
    const double: [number, number, string][] = [[0, 1, "2"], [1, 2, "1"], [2, 3, "1"], [3, 0, "1"]];
    expect(deg(mirrorLines(square, ["C", "C", "C", "C"], double, 0.01))).toEqual([90]);
  });

  it("finds none in a drawing tilted off its own shape", () => {
    // (a bent three-atom chain with its ends of two kinds)
    expect(mirrorLines([pt(0, 0), pt(1, 0.5), pt(2, 0)], ["C", "C", "O"], [[0, 1, "1"], [1, 2, "1"]], 0.01)).toEqual([]);
  });
});

describe("MIRROR_TOL, the engine's", () => {
  it("takes N-bromosuccinimide as laid out for its own mirror image, and not with its Br a tenth of a bond off the mirror", () => {
    const input = fromSmiles("O=C1CCC(=O)N1Br");
    const { x, y } = layout2D(input);
    const kinds = input.atoms.map((a) => a.el);
    const edges = input.bonds.map((b) => [b.a, b.b, `${b.order}`] as const);
    const points = x.map((_, i) => pt(x[i], y[i]));
    expect(mirrorLines(points, kinds, edges, MIRROR_TOL)).toHaveLength(1);
    // (its Br moved a tenth of a bond across the mirror: N-Br no longer on it)
    const br = kinds.indexOf("Br");
    const n = kinds.indexOf("N");
    const along = { x: x[br] - x[n], y: y[br] - y[n] };
    const off = points.map((p, i) => (i === br ? pt(p.x - 0.1 * along.y, p.y + 0.1 * along.x) : p));
    expect(mirrorLines(off, kinds, edges, MIRROR_TOL)).toEqual([]);
  });
});
