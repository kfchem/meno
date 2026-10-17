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
});
