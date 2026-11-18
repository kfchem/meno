import { describe, expect, it } from "vitest";
import { shapesOf, type FigureDrawn, type FigurePath, type PathStep, type Point } from "./drawn";
import { barBond, readFigure, sizedOutlines } from "./read";
import { readScheme } from "./scheme";

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
function ring(c: P, join: "mitre" | "round", bond = L, width = W): FigurePath {
  const v = Array.from({ length: 6 }, (_, i): P => [c[0] + bond * Math.cos((Math.PI / 3) * i), c[1] + bond * Math.sin((Math.PI / 3) * i)]);
  const grown = (by: number): P[] => v.map((p) => unit(sub(p, c)).map((x, i) => p[i] + (x * by) / Math.cos(Math.PI / 6)) as P);
  const [outer, inner] = [grown(width / 2), grown(-width / 2)];
  const steps = (poly: P[], reverse: boolean): PathStep[] => (reverse ? [...poly].reverse() : poly).map((p, i): PathStep => [i ? "L" : "M", p[0], p[1]]);
  void join;
  return { fill: black, stroke: null, width: 0, d: [...steps(outer, false), ["Z"], ...steps(inner, true), ["Z"]] };
}

const zig = (n: number, from: P = [100, 200], bond = L): P[] => {
  const out: P[] = [from];
  for (let i = 0; i < n; i++) {
    const [x, y] = out[i];
    out.push([x + bond * Math.cos(Math.PI / 6), y + (i % 2 ? -1 : 1) * bond * Math.sin(Math.PI / 6)]);
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

  it("is a chain's outline with a lobe of its own in the same shape - a box beside it - no bars: the bars must fill the shape, neither much less nor much more", () => {
    const chain = thick(zig(3), W, "mitre");
    const box: PathStep[] = [["M", 160, 180], ["L", 164.5, 180], ["L", 164.5, 184.5], ["L", 160, 184.5], ["Z"]];
    expect(shapesOf(figure(chain)).strokes.filter((s) => s.bar)).toHaveLength(3);
    // (a small box drawn one way round, its area taken from the chain's - the bars then more than the shape; a larger one the other way,
    //  added - the bars then much less)
    const other: PathStep[] = [["M", 160, 180], ["L", 160, 188], ["L", 168, 188], ["L", 168, 180], ["Z"]];
    for (const lobe of [box, other]) expect(shapesOf(figure({ ...chain, d: [...chain.d, ...lobe] })).strokes.filter((s) => s.bar)).toHaveLength(0);
  });

  it("is an arrow drawn as one polygon, its shaft and its head: no bond of it", () => {
    const arrow = polygon([[100, 100], [160, 100], [160, 96], [172, 101], [160, 106], [160, 102], [100, 102]]);
    expect(shapesOf(figure(arrow)).strokes).toHaveLength(0);
  });
});

describe("a chain whose end bars are cut short by labels", () => {
  it("is its three bars: the O-CH2-CH2-O of a dioxolane, end bars about half a bond, the middle one a whole bond - read as bonds beside a structure of ten-point bonds", () => {
    const stroked = (pts: P[]): FigurePath => ({ fill: null, stroke: black, width: 0.6, d: pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]) });
    const c = zig(5, [50, 50], 10);
    const hex = Array.from({ length: 6 }, (_, i): P => [250 + 10 * Math.cos((Math.PI / 3) * i), 170 + 10 * Math.sin((Math.PI / 3) * i)]);
    const structure = [stroked(c.slice(0, 4)), stroked(c.slice(3, 6)), stroked([...hex, hex[0]])];
    // (three bars: 5, 10 and 5 points, level, slope, level - the ends cut short where an O is set)
    const outline = thick([[300, 300], [305, 300], [314.7, 304.5], [319.7, 304.5]], 0.6, "mitre");
    expect(shapesOf(figure(outline)).strokes.filter((s) => s.bar)).toHaveLength(3);
    expect(readFigure(figure(...structure, outline)).bonds).toHaveLength(11 + 3);
  });

  it("is its three bars where the ring stands so that the chain is 1.2 bonds across: a dioxolane's O-CH2-CH2-O turned in its five-ring, each end bar cut 0.45 of a bond short", () => {
    const stroked = (pts: P[]): FigurePath => ({ fill: null, stroke: black, width: 0.6, d: pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]) });
    const c = zig(5, [50, 50], 10);
    const hex = Array.from({ length: 6 }, (_, i): P => [250 + 10 * Math.cos((Math.PI / 3) * i), 170 + 10 * Math.sin((Math.PI / 3) * i)]);
    const structure = [stroked(c.slice(0, 4)), stroked(c.slice(3, 6)), stroked([...hex, hex[0]])];
    // (a regular five-ring of ten-point bonds turned 27 degrees: O, CH2, CH2, O its corners; the chain 11.97 points across, under 1.3 bonds)
    const outline = thick([[303.57, 305.9], [298.67, 308.4], [291.6, 301.33], [294.1, 296.43]], 0.6, "mitre");
    expect(shapesOf(figure(outline)).strokes.filter((s) => s.bar)).toHaveLength(3);
    expect(readFigure(figure(...structure, outline)).bonds).toHaveLength(11 + 3);
  });

  it("is its two bars where one is cut short at its label: a bond of 0.9 and one of half a bond, at 120 degrees, 1.23 bonds across", () => {
    const stroked = (pts: P[]): FigurePath => ({ fill: null, stroke: black, width: 0.6, d: pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]) });
    const c = zig(5, [50, 50], 10);
    const hex = Array.from({ length: 6 }, (_, i): P => [250 + 10 * Math.cos((Math.PI / 3) * i), 170 + 10 * Math.sin((Math.PI / 3) * i)]);
    const structure = [stroked(c.slice(0, 4)), stroked(c.slice(3, 6)), stroked([...hex, hex[0]])];
    const outline = thick([[300, 300], [303.865, 296.83], [312.29, 300]], 0.6, "mitre");
    expect(shapesOf(figure(outline)).strokes.filter((s) => s.bar)).toHaveLength(2);
    expect(readFigure(figure(...structure, outline)).bonds).toHaveLength(11 + 2);
  });

  it("gives up a large Z beside a structure of ten-point bonds: three bars, one of them a bond long, but 0.9 of a bond across", () => {
    const stroked = (pts: P[]): FigurePath => ({ fill: null, stroke: black, width: 0.6, d: pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]) });
    const c = zig(5, [50, 50], 10);
    const hex = Array.from({ length: 6 }, (_, i): P => [250 + 10 * Math.cos((Math.PI / 3) * i), 170 + 10 * Math.sin((Math.PI / 3) * i)]);
    const structure = [stroked(c.slice(0, 4)), stroked(c.slice(3, 6)), stroked([...hex, hex[0]])];
    const z = thick([[300, 300], [309, 300], [300, 306], [309, 306]], 0.8, "mitre");
    expect(shapesOf(figure(z)).strokes.filter((s) => s.bar)).toHaveLength(3);
    expect(readFigure(figure(...structure, z)).bonds).toHaveLength(11);
  });
});

describe("which chains of bars are bonds: told by the drawing's own bond, not by points", () => {
  const stroked = (pts: P[], w = 0.6): FigurePath => ({ fill: null, stroke: black, width: w, d: pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]) });
  /** A structure drawn with lines, bonds of `bond` points: what gives the figure its bond length. */
  const structure = (bond: number, from: P = [50, 50]): FigurePath[] => {
    const c = zig(5, from, bond);
    // (a chain of five bonds, and a hexagon: eleven lines of the bond's length)
    const hex = Array.from({ length: 6 }, (_, i): P => [from[0] + 200 + bond * Math.cos((Math.PI / 3) * i), from[1] + 120 + bond * Math.sin((Math.PI / 3) * i)]);
    return [stroked(c.slice(0, 4)), stroked(c.slice(3, 6)), stroked([...hex, hex[0]])];
  };

  it("reads a ring and a chain of bonds ten points long, as small as a journal's, drawn as outlines", () => {
    // (ring: 17.9 x 20.7 points across - under the twenty a letter was told by - and bonds of 10)
    const small = readFigure(figure(ring([200, 200], "mitre", 10, 0.8), thick(zig(3, [50, 50], 10), 0.8, "mitre")));
    expect(small.bonds).toHaveLength(9);
    expect(Math.round(small.bond)).toBe(10);
  });

  it("gives up a chain whose bars are several bonds long - a chart's line drawn as one outline - and reads it as before", () => {
    const chart = thick([[40, 300], [75, 300], [90, 350], [120, 350], [135, 270], [170, 270], [185, 330]], 0.8, "mitre");
    const read = readFigure(figure(...structure(10), chart));
    // (only the structure's own bonds: five)
    expect(read.bonds).toHaveLength(11);
    expect(shapesOf(figure(chart)).strokes.some((s) => s.bar)).toBe(true);
  });

  it("gives up a speck: a chain of bars a third of a bond long", () => {
    const speck = thick([[300, 300], [303, 301.5], [306, 300]], 0.4, "mitre");
    const bigger = { ...speck, d: speck.d.map((st): PathStep => (st[0] === "Z" ? st : [st[0], st[1] + 0, st[2] + 0])) };
    const read = readFigure(figure(...structure(10), bigger));
    expect(read.bonds).toHaveLength(11);
  });

  it("keeps a chain whose bars are 0.5 to 1.8 bonds long, and gives up one a bar over 1.9 or under 0.45", () => {
    const keep = (long: number, bonds = 3) => readFigure(figure(...structure(10), thick(zig(bonds, [200, 200], long), Math.min(0.8, 0.07 * long), "mitre"))).bonds.length;
    expect(keep(10)).toBe(11 + 3);
    expect(keep(18)).toBe(11 + 3);
    expect(keep(20)).toBe(11);
    expect(keep(5, 6)).toBe(11 + 6);
    expect(keep(4, 8)).toBe(11);
    // (and a chain under 1.3 bonds across - three bars of half a bond - is no chain)
    expect(keep(5)).toBe(11);
  });

  it("gives up the thin stems of a letter set beside a structure of ten-point bonds, a seven-point W or M drawn as one outline: the polygon stays a shape, the label can be read", () => {
    // (stems 5 long and 0.4 across: bars all the same, joined at corners, filling the polygon - a chain but for its size: 1.3 bonds across at the least)
    const wLetter = thick([[300, 300], [302.5, 305], [305, 300], [307.5, 305], [310, 300]], 0.4, "mitre");
    const mLetter = thick([[320, 305], [320, 300], [323, 304], [326, 300], [326, 305]], 0.4, "mitre");
    for (const letter of [wLetter, mLetter]) {
      const drawn = figure(...structure(10), letter);
      expect(shapesOf(drawn).strokes.filter((s) => s.bar).length).toBeGreaterThan(1);
      expect(readFigure(drawn).bonds).toHaveLength(11);
    }
  });

  it("keeps a chain 1.3 bonds across at the least - two bars at a right angle, 1.4 across - and gives up a thin V 1.2 bonds tall, its bars a bond long", () => {
    // (two bars a bond long at a right angle, lying across: 1.41 bonds across)
    const corner = thick([[200, 200], [207.07, 207.07], [214.14, 200]], 0.7, "mitre");
    expect(readFigure(figure(...structure(10), corner)).bonds).toHaveLength(11 + 2);
    // (a V of two strokes 1.24 bonds long, 1.2 bonds tall and 0.6 wide: a large letter, under 1.3 across)
    const v = thick([[300, 300], [303, 312], [306, 300]], 1, "mitre");
    expect(shapesOf(figure(v)).strokes.filter((s) => s.bar)).toHaveLength(2);
    expect(readFigure(figure(...structure(10), v)).bonds).toHaveLength(11);
  });

  it("judges every bar of a chain: one bar two bonds long among bars a bond long gives the chain up", () => {
    const chart = thick([[200, 200], [208.66, 205], [217.32, 200], [237.32, 200]], 0.8, "mitre");
    expect(shapesOf(figure(chart)).strokes.filter((s) => s.bar)).toHaveLength(3);
    expect(readFigure(figure(...structure(10), chart)).bonds).toHaveLength(11);
  });

  it("leaves out, of a chain kept, what its polygon was read as before: its bars alone stand for it", () => {
    const chain = thick(zig(3, [200, 200], 10), 0.8, "mitre");
    const kept = sizedOutlines(shapesOf(figure(...structure(10), chain)));
    expect([kept.strokes.length, kept.blobs.length, kept.wedges.length]).toEqual([11 + 3, 0, 0]);
  });

  it("takes the figure's bond from what is drawn besides its chains: a structure's lines, not a chart line given up beside them; the bars, where they are most of it, for telling its chains", () => {
    const chart = thick([[40, 300], [75, 300], [90, 350], [120, 350], [135, 270], [170, 270], [185, 330]], 0.8, "mitre");
    expect(Math.round(readFigure(figure(...structure(10), chart)).bond)).toBe(10);
    // (a ring and a chain drawn as outlines, bonds of 10, and two stray lines of 30)
    const stray = [stroked([[400, 400], [430, 400]]), stroked([[400, 420], [430, 420]])];
    expect(Math.round(barBond(shapesOf(figure(ring([200, 200], "mitre", 10, 0.8), thick(zig(3, [50, 50], 10), 0.8, "mitre"), ...stray))))).toBe(10);
  });

  it("takes the figure's bond from what is drawn besides its chains even where chains kept are more: four rings of 13-point bonds as outlines beside a structure of 10", () => {
    const rings = [0, 1, 2, 3].map((i) => ring([400 + 50 * i, 400], "mitre", 13, 0.9));
    const read = readFigure(figure(...structure(10), ...rings));
    expect(read.bonds).toHaveLength(11 + 24);
    expect(Math.round(read.bond)).toBe(10);
  });

  it("is read the same way in a scheme: a chart line drawn as one outline beside a structure stays no bonds", () => {
    const chart = thick([[40, 300], [75, 300], [90, 350], [120, 350], [135, 270], [170, 270], [185, 330]], 0.8, "mitre");
    expect(readScheme(figure(...structure(10), chart)).figure.bonds).toHaveLength(11);
    expect(readScheme(figure(...structure(10), thick(zig(3, [200, 200], 10), 0.8, "mitre"))).figure.bonds).toHaveLength(11 + 3);
  });

  it("gives up a level-slope-level polyline whose bars are four to six bonds long - an energy profile's line", () => {
    const profile = thick([[200, 300], [250, 300], [300, 340], [350, 340]], 0.8, "mitre");
    expect(shapesOf(figure(profile)).strokes.filter((s) => s.bar).length).toBeGreaterThan(1);
    expect(readFigure(figure(...structure(10), profile)).bonds).toHaveLength(11);
  });
});
