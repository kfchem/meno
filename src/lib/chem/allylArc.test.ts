import { describe, expect, it } from "vitest";
import { allylArc, ARC_DEPTH } from "./allylArc";

/** An allyl as a chain drawn: its ends 1.732 apart, its middle carbon 0.5 above them; the metal below. */
const a = { x: -0.866, y: 0 };
const b = { x: 0.866, y: 0 };
const mid = { x: 0, y: 0.5 };

describe("an η3-allyl's arc", () => {
  it("runs from one end carbon to the other, bulging towards the metal, its middle where the metal's line ends", () => {
    const { points, middle } = allylArc(a, b, mid, { x: 0, y: -2 });
    expect(points[0]).toEqual(a);
    expect(points[points.length - 1]).toEqual(b);
    expect(middle.x).toBeCloseTo(0, 9);
    expect(middle.y).toBeCloseTo(-ARC_DEPTH * 1.732, 9);
    // (every point between the ends on the metal's side of them, none further than the middle)
    for (const p of points.slice(1, -1)) {
      expect(p.y).toBeLessThan(0);
      expect(p.y).toBeGreaterThanOrEqual(middle.y - 1e-9);
    }
  });

  it("bulges towards the metal wherever it stands - away from the middle carbon where the metal is in line with the ends", () => {
    expect(allylArc(a, b, mid, { x: 0.3, y: 3 }).middle.y).toBeGreaterThan(0);
    expect(allylArc(a, b, mid, { x: 5, y: 0 }).middle.y).toBeLessThan(0);
    // (the ends either way round: the same arc, reversed)
    const there = allylArc(b, a, mid, { x: 0, y: -2 });
    expect(there.middle.y).toBeCloseTo(-ARC_DEPTH * 1.732, 9);
  });

  it("is the shallow arc between the ends however the allyl is turned on the page", () => {
    for (let k = 0; k < 24; k++) {
      const th = (k * Math.PI) / 12;
      const turn = (p: { x: number; y: number }) => ({ x: p.x * Math.cos(th) - p.y * Math.sin(th), y: p.x * Math.sin(th) + p.y * Math.cos(th) });
      const { points, middle } = allylArc(turn(a), turn(b), turn(mid), turn({ x: 0, y: -2 }));
      // (every point within the arc's depth of the line between the ends, and between them along it)
      const along = turn({ x: 1, y: 0 });
      for (const p of points) {
        const u = p.x * along.x + p.y * along.y;
        const v = -p.x * along.y + p.y * along.x;
        expect(Math.abs(u)).toBeLessThanOrEqual(0.866 + 1e-9);
        expect(v).toBeLessThanOrEqual(1e-9);
        expect(v).toBeGreaterThanOrEqual(-ARC_DEPTH * 1.732 - 1e-9);
      }
      expect(points[8].x).toBeCloseTo(middle.x, 9);
      expect(points[8].y).toBeCloseTo(middle.y, 9);
    }
  });
});
