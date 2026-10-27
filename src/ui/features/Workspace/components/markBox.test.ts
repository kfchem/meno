import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { boxFill, outlineAround, outlineBand } from "./markBox";

/** Each triangle's points, from x, y pairs. */
const pointsOf = (xy: number[]) => Array.from({ length: xy.length / 2 }, (_, i) => ({ x: xy[2 * i], y: xy[2 * i + 1] }));
const area = (xy: number[]) => {
  let s = 0;
  for (let i = 0; i < xy.length; i += 6) s += Math.abs((xy[i + 2] - xy[i]) * (xy[i + 5] - xy[i + 1]) - (xy[i + 4] - xy[i]) * (xy[i + 3] - xy[i + 1])) / 2;
  return s;
};

describe("a mark's box as WebGL draws it", () => {
  const box = { w: 4, h: 2, radius: 0.3, round: false };

  it("outlines it with a band just inside its edge, as a CSS border is, its corners rounded", () => {
    const band = pointsOf(outlineBand(box, 0.1));
    for (const p of band) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(2 + 1e-9);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(1 + 1e-9);
    }
    expect(Math.max(...band.map((p) => p.x))).toBeCloseTo(2, 9);
    expect(Math.max(...band.map((p) => p.y))).toBeCloseTo(1, 9);
    // (no point in a corner's square past its curve)
    for (const p of band) if (Math.abs(p.x) > 1.7 && Math.abs(p.y) > 0.7) expect(Math.hypot(Math.abs(p.x) - 1.7, Math.abs(p.y) - 0.7)).toBeLessThanOrEqual(0.3 + 1e-6);
    // (the band's area about its length times its width)
    expect(area(outlineBand(box, 0.1))).toBeCloseTo(0.1 * (2 * (4 + 2) - (8 - 2 * Math.PI) * 0.25 - 4 * 0.1), 1);
  });

  it("dashes it where asked, about as much on as the dashes are long against their gaps", () => {
    const whole = area(outlineBand(box, 0.1));
    const dashed = area(outlineBand(box, 0.1, { on: 0.3, off: 0.2 }));
    expect(dashed / whole).toBeGreaterThan(0.5);
    expect(dashed / whole).toBeLessThan(0.7);
  });

  it("makes a round one an ellipse, and fills a box as large as it is", () => {
    const ring = outlineAround({ w: 2, h: 2, radius: 0, round: true }, 0, 0.05);
    for (const p of ring) expect(Math.hypot(p.x, p.y)).toBeCloseTo(1, 9);
    expect(area(boxFill({ w: 2, h: 2, radius: 0, round: false }))).toBeCloseTo(4, 9);
    expect(area(boxFill({ w: 2, h: 2, radius: 0, round: true }))).toBeCloseTo(Math.PI, 1);
  });

  it("is what the canvas draws the marks with: no box nor R, S, E or Z in HTML over the page - only what a box says, pointed at", () => {
    const marks = readFileSync(join(process.cwd(), "src/ui/features/Workspace/components/ChemMarks2D.tsx"), "utf8");
    expect(marks).toContain("<MarkBoxes2D");
    expect(marks).toContain("<Texts2D");
    expect(marks.match(/<PageHtml/g)).toHaveLength(1);
    expect(marks).toMatch(/\{pointed && \(\s+<PageHtml/);
  });
});
