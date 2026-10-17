import { describe, expect, it } from "vitest";
import { allylCurve, CURVE_GAP } from "./allylArc";

/** An allyl as drawn: a "^", its bonds of length 1 at 120 degrees, its middle carbon on top. */
const a = { x: -0.866, y: 0 };
const mid = { x: 0, y: 0.5 };
const b = { x: 0.866, y: 0 };

/** How far a point is from the line through two others. */
const off = (p: { x: number; y: number }, u: { x: number; y: number }, v: { x: number; y: number }) =>
  Math.abs((v.x - u.x) * (p.y - u.y) - (v.y - u.y) * (p.x - u.x)) / Math.hypot(v.x - u.x, v.y - u.y);

describe("an η3-allyl's delocalisation curve", () => {
  it("runs just inside the chain, parallel to it - convex the same way - its middle under the middle carbon", () => {
    const { points, middle } = allylCurve(a, mid, b);
    expect(middle.x).toBeCloseTo(0, 9);
    // (inside the angle, below the middle carbon, above the line between the end carbons)
    expect(middle.y).toBeLessThan(mid.y);
    expect(middle.y).toBeGreaterThan(0);
    // (its middle on the bisector, at least the gap from both bonds)
    expect(off(middle, mid, a)).toBeCloseTo(off(middle, mid, b), 9);
    expect(off(middle, mid, a)).toBeGreaterThanOrEqual(CURVE_GAP - 1e-4);
    // (its ends as far inside their bonds, short of the end carbons)
    expect(off(points[0], mid, a)).toBeCloseTo(CURVE_GAP, 4);
    expect(off(points[points.length - 1], mid, b)).toBeCloseTo(CURVE_GAP, 4);
    expect(Math.abs(points[0].x)).toBeLessThan(0.866);
    // (convex away from the line between the ends - a "∩" under the "^" - its middle its highest point)
    for (const p of points) expect(p.y).toBeLessThanOrEqual(middle.y + 1e-9);
    for (const p of points.slice(1, -1)) expect(p.y).toBeGreaterThan(Math.min(points[0].y, points[points.length - 1].y) - 1e-9);
  });

  it("keeps the gap it is given from the chain's bonds where it comes nearest, and reaches as far along them as asked", () => {
    for (const gap of [0.1, 0.18, 0.25]) {
      const { points } = allylCurve(a, mid, b, gap, 0.68);
      const nearest = Math.min(...points.map((p) => Math.min(off(p, mid, a), off(p, mid, b))));
      expect(nearest).toBeCloseTo(gap, 6);
      // (its ends 0.68 of the way along their bonds from the middle carbon)
      const along = ((points[0].x - mid.x) * (a.x - mid.x) + (points[0].y - mid.y) * (a.y - mid.y)) / Math.hypot(a.x - mid.x, a.y - mid.y);
      expect(along).toBeCloseTo(0.68, 4);
    }
  });

  it("is the same curve however the allyl is turned on the page, and either way round", () => {
    const base = allylCurve(a, mid, b);
    for (let k = 0; k < 24; k++) {
      const th = (k * Math.PI) / 12;
      const turn = (p: { x: number; y: number }) => ({ x: p.x * Math.cos(th) - p.y * Math.sin(th), y: p.x * Math.sin(th) + p.y * Math.cos(th) });
      const { points, middle } = allylCurve(turn(a), turn(mid), turn(b));
      expect(middle.x).toBeCloseTo(turn(base.middle).x, 9);
      expect(middle.y).toBeCloseTo(turn(base.middle).y, 9);
      points.forEach((p, i) => {
        expect(p.x).toBeCloseTo(turn(base.points[i]).x, 9);
        expect(p.y).toBeCloseTo(turn(base.points[i]).y, 9);
      });
    }
    const back = allylCurve(b, mid, a);
    expect(back.middle.y).toBeCloseTo(base.middle.y, 9);
    expect(back.points[0].x).toBeCloseTo(base.points[base.points.length - 1].x, 9);
  });
});
