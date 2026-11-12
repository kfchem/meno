import { describe, expect, it } from "vitest";
import { shapesOf, type FigureDrawn, type FigurePath, type PathStep, type Point } from "./drawn";
import { readFigure } from "./read";

// Made samples: the thin filled polygon a drawing program leaves where it draws a chain's lines joined (corners mitred or rounded; a ring as its outer
// and its inner outline), and the thin polygons that are none: letters, a frame, an arrow, a bracket.
const L = 14.4;
const W = 1.2;
type P = [number, number];
const black = "#000000ff";
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const unit = (v: P): P => [v[0] / Math.hypot(...v), v[1] / Math.hypot(...v)];

/**
 * A polyline `pts` of width `w` drawn as one filled outline, flat ended: its left side forward, its right side back; at each corner the outer side
 * mitred or - `round` - turned by a curve (one cubic) and the inner side its mitre point.
 */
function thick(pts: P[], w: number, join: "mitre" | "round"): FigurePath {
  const h = w / 2;
  const n = (a: P, b: P): P => {
    const u = unit(sub(b, a));
    return [-u[1], u[0]];
  };
  const side = (sign: 1 | -1, order: P[]): PathStep[] => {
    const out: PathStep[] = [];
    order.forEach((p, i) => {
      const prev = order[i - 1];
      const next = order[i + 1];
      if (!prev || !next) {
        const m = prev ? n(prev, p) : n(p, next!);
        out.push([out.length ? "L" : "M", p[0] + sign * m[0] * h, p[1] + sign * m[1] * h]);
        return;
      }
      const [n1, n2] = [n(prev, p), n(p, next)];
      const cross = (p[0] - prev[0]) * (next[1] - p[1]) - (p[1] - prev[1]) * (next[0] - p[0]);
      // (the side the corner turns away from is its outer side)
      const outer = Math.sign(cross) * sign < 0;
      const bis: P = [n1[0] + n2[0], n1[1] + n2[1]];
      const bl = Math.hypot(...bis);
      const k = (2 * h) / (bl * bl) ; // |bis|^2 = 2 + 2 cos: the mitre point is p + sign * bis * h * 2 / |bis|^2
      const mitre: [number, number] = [p[0] + sign * bis[0] * k, p[1] + sign * bis[1] * k];
      if (join === "round" && outer) {
        const a: P = [p[0] + sign * n1[0] * h, p[1] + sign * n1[1] * h];
        const b: P = [p[0] + sign * n2[0] * h, p[1] + sign * n2[1] * h];
        const turn = Math.acos(Math.max(-1, Math.min(1, n1[0] * n2[0] + n1[1] * n2[1])));
        const t = (4 / 3) * Math.tan(turn / 4) * h;
        const [t1, t2] = [unit(sub(p, prev)), unit(sub(next, p))];
        out.push([out.length ? "L" : "M", a[0], a[1]], ["C", a[0] + t1[0] * t, a[1] + t1[1] * t], ["C", b[0] - t2[0] * t, b[1] - t2[1] * t], ["C", b[0], b[1]]);
      } else {
        out.push([out.length ? "L" : "M", mitre[0], mitre[1]]);
      }
    });
    return out;
  };
  const left = side(1, pts);
  const right = side(1, [...pts].reverse()).map((s, i): PathStep => (i === 0 && s[0] === "M" ? ["L", s[1], s[2]] : s));
  return { fill: black, stroke: null, width: 0, d: [...left, ...right, ["Z"]] };
}

/** A hexagon of side L, its outline drawn as ONE filled shape: the outer outline, and the inner outline the other way round. */
function ring(c: P, join: "mitre" | "round"): FigurePath {
  const v = Array.from({ length: 6 }, (_, i): P => [c[0] + L * Math.cos((Math.PI / 3) * i), c[1] + L * Math.sin((Math.PI / 3) * i)]);
  const grown = (by: number): P[] => v.map((p) => unit(sub(p, c)).map((x, i) => p[i] + (x * by) / Math.cos(Math.PI / 6)) as P);
  const [outer, inner] = [grown(W / 2), grown(-W / 2)];
  const steps = (poly: P[], reverse: boolean): PathStep[] => (reverse ? [...poly].reverse() : poly).map((p, i): PathStep => [i ? "L" : "M", p[0], p[1]]);
  void join;
  return { fill: black, stroke: null, width: 0, d: [...steps(outer, false), ["Z"], ...steps(inner, true), ["Z"]] };
}

const zig = (n: number, from: P = [100, 200]): P[] => {
  const out: P[] = [from];
  for (let i = 0; i < n; i++) {
    const [x, y] = out[i];
    out.push([x + L * Math.cos(Math.PI / 6), y + (i % 2 ? -1 : 1) * L * Math.sin(Math.PI / 6)]);
  }
  return out;
};
const figure = (...paths: FigurePath[]): FigureDrawn => ({ paths, letters: [], pictures: [] });
const near = (p: Point, q: P, by = 0.4) => Math.hypot(p.x - q[0], p.y - q[1]) < by;

describe("a chain of bonds drawn as one filled outline", () => {
  for (const join of ["mitre", "round"] as const) {
    it(`is its bars, one line to each bond, ${join}ed corners: ends at the corners, a line's width`, () => {
      const pts = zig(3);
      const strokes = shapesOf(figure(thick(pts, W, join))).strokes;
      expect(strokes).toHaveLength(3);
      for (let i = 0; i < 3; i++) {
        const s = strokes.find((t) => (near(t.a, pts[i]) && near(t.b, pts[i + 1])) || (near(t.b, pts[i]) && near(t.a, pts[i + 1])));
        expect(s, `bond ${i}`).toBeDefined();
        expect(s!.w).toBeCloseTo(W, 1);
      }
    });
  }

  it("is a hexagon's six bonds where its outline is drawn as an outer and an inner outline", () => {
    const c: P = [200, 200];
    const strokes = shapesOf(figure(ring(c, "mitre"))).strokes;
    expect(strokes).toHaveLength(6);
    for (const s of strokes) expect(Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)).toBeCloseTo(L, 0);
  });

  it("is read the same drawn beside other bonds, and keeps its colour", () => {
    const ink = { ...thick(zig(2), W, "mitre"), fill: "#ff0000ff" };
    const strokes = shapesOf(figure(ink)).strokes;
    expect(strokes.every((s) => s.ink === "#ff0000ff")).toBe(true);
  });
});

describe("a figure drawn as filled outlines is read as a structure", () => {
  it("reads a chain of four bonds and a ring, each one filled outline, as it reads the same drawn with lines", () => {
    const stroked = (pts: P[]): FigurePath => ({ fill: null, stroke: black, width: W, d: pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]) });
    const chain = zig(4);
    for (const join of ["mitre", "round"] as const) {
      const filled = readFigure(figure(thick(chain, W, join)));
      const lines = readFigure(figure(stroked(chain)));
      expect([filled.atoms.length, filled.bonds.length]).toEqual([lines.atoms.length, lines.bonds.length]);
      expect(filled.bonds).toHaveLength(4);
    }
    const c: P = [200, 200];
    const hex = readFigure(figure(ring(c, "mitre")));
    expect([hex.atoms.length, hex.bonds.length]).toEqual([6, 6]);
  });
});

describe("a thin polygon that is no chain of bonds is left as it was", () => {
  const blobs = (d: FigureDrawn) => shapesOf(d).blobs.length;
  const polygon = (pts: P[]): FigurePath => ({ fill: black, stroke: null, width: 0, d: [...pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]), ["Z"]] });

  it("is a letter drawn as an outline - a W, an H, an E, a ten-point size - no bars", () => {
    const w = polygon([[100, 100], [101.2, 100], [102.6, 106], [104, 100], [105.4, 106], [106.8, 100], [108, 100], [106, 108], [104.8, 108], [103.4, 102], [102.2, 108], [101, 108]]);
    const h = polygon([[100, 100], [101.2, 100], [101.2, 103.4], [105, 103.4], [105, 100], [106.2, 100], [106.2, 108], [105, 108], [105, 104.6], [101.2, 104.6], [101.2, 108], [100, 108]]);
    for (const l of [w, h]) {
      expect(shapesOf(figure(l)).strokes).toHaveLength(0);
      expect(blobs(figure(l))).toBe(1);
    }
  });

  it("is a big heavy H: two stems and a crossbar meet at no corner a chain's bars do", () => {
    const h = polygon([[100, 100], [104, 100], [104, 115], [122, 115], [122, 100], [126, 100], [126, 140], [122, 140], [122, 119], [104, 119], [104, 140], [100, 140]]);
    expect(shapesOf(figure(h)).strokes.filter((s) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) > 30)).toHaveLength(0);
  });

  it("is a frame drawn as an outer and an inner outline - a long thin rectangle each: read as before, one fat bar for each outline, no thin bars of it", () => {
    const outer: P[] = [[50, 50], [350, 50], [350, 80], [50, 80]];
    const inner: P[] = [[52, 52], [52, 78], [348, 78], [348, 52]];
    const frame: FigurePath = { fill: black, stroke: null, width: 0, d: [...outer.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]), ["Z"], ...inner.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]), ["Z"]] };
    const strokes = shapesOf(figure(frame)).strokes;
    expect(strokes.every((s) => s.w > 20)).toBe(true);
  });

  it("is an arrow drawn as one polygon, its shaft and its head: no bond of it", () => {
    const arrow = polygon([[100, 100], [160, 100], [160, 96], [172, 101], [160, 106], [160, 102], [100, 102]]);
    expect(shapesOf(figure(arrow)).strokes).toHaveLength(0);
  });
});
