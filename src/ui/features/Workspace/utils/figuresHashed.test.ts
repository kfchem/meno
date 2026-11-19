/**
 * A figure's even hashes, placed in the workspace, are a bond drawn hashed - no stereo, no narrow end - for the reader's rule (found in review).
 */
import { describe, expect, it } from "vitest";
import type { FigureDrawn, FigurePath, PathStep } from "../../../../lib/figure/drawn";
import { readFigure } from "../../../../lib/figure/read";
import { modelOf } from "./figures";

const L = 14.4;
type P = [number, number];
const stroke = (...pts: P[]): FigurePath => ({ fill: null, stroke: "#000000ff", width: 0.6, d: pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]) });
const step = (p: P, deg: number): P => [p[0] + L * Math.cos((deg * Math.PI) / 180), p[1] - L * Math.sin((deg * Math.PI) / 180)];
/** Even hashes from `from` to `to`: strokes across, all as wide. */
const evenHashes = (from: P, to: P): FigurePath[] => {
  const l = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const [ux, uy] = [(to[0] - from[0]) / l, (to[1] - from[1]) / l];
  return Array.from({ length: 7 }, (_, k) => {
    const c: P = [from[0] + ((to[0] - from[0]) * k) / 6, from[1] + ((to[1] - from[1]) * k) / 6];
    return stroke([c[0] - uy * 1.4, c[1] + ux * 1.4], [c[0] + uy * 1.4, c[1] - ux * 1.4]);
  });
};

describe("a figure's even hashes, placed in the workspace", () => {
  it("are a bond drawn hashed: display hashed, no stereo, no narrow end", () => {
    const c: P = [40, 40];
    const down = step(c, -90);
    const f: FigureDrawn = { paths: [stroke(step(c, 150), c, step(c, 30)), stroke(c, step(c, 90)), ...evenHashes(c, down)], letters: [], pictures: [] };
    const m = modelOf(readFigure(f, () => true), (x, y) => ({ sha256: "s", page: 0, x, y, bond: L }) as never);
    const lines = m.bonds.filter((b) => b.display === "hashed");
    expect(lines).toHaveLength(1);
    expect(lines[0].stereo).toBeUndefined();
    expect(lines[0].narrow).toBeUndefined();
  });
});
