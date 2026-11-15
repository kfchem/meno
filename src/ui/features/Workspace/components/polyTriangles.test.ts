import { describe, expect, it } from "vitest";
import { polyTriangles } from "./polyTriangles";
import {
  buildAllPrimitives,
  type Atom,
  type Bond,
  type Vec2,
} from "../../../../lib/chem/layout2d";
import { acsWorldOptions } from "../../../../lib/chem/acs";

const area = (pts: Vec2[]) => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
};

const triArea = (pts: Vec2[], idx: number[]) => {
  let s = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = [pts[idx[i]], pts[idx[i + 1]], pts[idx[i + 2]]];
    s += Math.abs(
      (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y),
    ) / 2;
  }
  return s;
};

describe("polyTriangles", () => {
  // a wedge used to be one triangle, and the canvas drew only points 0-2
  const trapezoid: Vec2[] = [
    { x: 0, y: -0.25 },
    { x: 0, y: 0.25 },
    { x: 1.5, y: 0.04 },
    { x: 1.5, y: -0.04 },
  ];

  it("covers the whole outline, not just the first three points", () => {
    const idx = polyTriangles(trapezoid);
    expect(idx.length).toBe(6);
    expect(triArea(trapezoid, idx)).toBeCloseTo(area(trapezoid), 9);
  });

  it("handles a dented outline and either winding", () => {
    // the wide end dips inwards between two bonds
    const dented: Vec2[] = [
      { x: 0, y: -0.25 },
      { x: 0.1, y: 0 },
      { x: 0, y: 0.25 },
      { x: 1.5, y: 0.04 },
      { x: 1.5, y: -0.04 },
    ];
    for (const pts of [dented, [...dented].reverse()]) {
      const idx = polyTriangles(pts);
      expect(idx.length).toBe((pts.length - 2) * 3);
      expect(triArea(pts, idx)).toBeCloseTo(area(pts), 9);
    }
  });
});

describe("a wedge as the canvas draws it", () => {
  // a wedge whose wide end carries two bonds on, so its outline is cut,
  // dented and rounded - the canvas has to cover all of it
  const atoms: Atom[] = [
    { id: 1, x: 0, y: 1.5, el: "C" },
    { id: 2, x: 0, y: 0, el: "C" },
    { id: 3, x: 1.3, y: -0.75, el: "C" },
    { id: 4, x: -1.3, y: -0.75, el: "C" },
  ];
  const bonds: Bond[] = [
    { a1: 0, a2: 1, order: 1, stereo: "up", narrow: 0 },
    { a1: 1, a2: 2, order: 1, stereo: "none" },
    { a1: 1, a2: 3, order: 1, stereo: "none" },
  ];

  it("triangulates the whole outline", () => {
    const opts = acsWorldOptions(atoms, bonds, { units: "world" });
    const { polys } = buildAllPrimitives(atoms, bonds, opts, 40);
    expect(polys.length).toBeGreaterThan(0);
    for (const p of polys) {
      const idx = polyTriangles(p.points);
      expect(idx.length).toBe((p.points.length - 2) * 3);
      expect(triArea(p.points, idx)).toBeCloseTo(area(p.points), 9);
    }
  });
});
