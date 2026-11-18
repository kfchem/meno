import { describe, expect, it } from "vitest";
import type { Pixels } from "./inkFit";
import { readFigure } from "./read";
import type { Point, Shapes } from "./drawn";
import { inkOf, onPage, patchesOf, thinned, tracePicture, type Traced } from "./trace";

type Pt = [number, number];
/** Whether a point of the picture is inked by a shape. */
type Shape = (x: number, y: number) => boolean;

/** A line from one point to another, `w` wide, its ends and joints round - as a drawing program strokes one. */
const line =
  (p: Pt, q: Pt, w: number): Shape =>
  (x, y) => {
    const d = [q[0] - p[0], q[1] - p[1]];
    const t = Math.min(Math.max(((x - p[0]) * d[0] + (y - p[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1]), 0), 1);
    return Math.hypot(x - (p[0] + t * d[0]), y - (p[1] + t * d[1])) <= w / 2;
  };

/** A filled wedge from its tip to the middle of its wide end, `w` wide there. */
const wedge =
  (tip: Pt, base: Pt, w: number): Shape =>
  (x, y) => {
    const l = Math.hypot(base[0] - tip[0], base[1] - tip[1]);
    const u = [(base[0] - tip[0]) / l, (base[1] - tip[1]) / l];
    const t = (x - tip[0]) * u[0] + (y - tip[1]) * u[1];
    const off = Math.abs((x - tip[0]) * u[1] - (y - tip[1]) * u[0]);
    return t >= 0 && t <= l && off <= ((w / 2) * t) / l;
  };

/** A ring's line, round a middle, `w` wide. */
const ring =
  (c: Pt, r: number, w: number): Shape =>
  (x, y) =>
    Math.abs(Math.hypot(x - c[0], y - c[1]) - r) <= w / 2;

/** A picture `width` by `height` of shapes inked in `ink` on `paper`: each pixel as much of the ink as of it is covered, from sixteen samples - as a drawing is drawn smooth. */
function picture(width: number, height: number, shapes: Shape[], ink: Pt | [number, number, number] = [0, 0], paper: [number, number, number] = [255, 255, 255]): Pixels {
  const colour = ink.length === 3 ? ink : [0, 0, 0];
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let n = 0;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (shapes.some((s) => s(x + (i + 0.5) / 4, y + (j + 0.5) / 4))) n++;
      const c = n / 16;
      for (let k = 0; k < 3; k++) data[4 * (y * width + x) + k] = Math.round(paper[k] * (1 - c) + colour[k] * c);
      data[4 * (y * width + x) + 3] = 255;
    }
  return { width, height, data };
}

/** A hexagon's corners round a middle, a bond long, its first at the top. */
function hexagon(c: Pt, bond: number): Pt[] {
  return Array.from({ length: 6 }, (_, k) => [c[0] + bond * Math.sin((k * Math.PI) / 3), c[1] - bond * Math.cos((k * Math.PI) / 3)] as Pt);
}

const traced = (t: Traced | { none: string }): Traced => {
  if ("none" in t) throw new Error(t.none);
  return t;
};
const near = (p: Point, q: Pt, within: number) => Math.hypot(p.x - q[0], p.y - q[1]) <= within;
const ends = (s: Shapes) => [...s.strokes.flatMap((t) => [t.a, t.b]), ...s.wedges.flatMap((w) => [w.tip, w.base])];
const read = (s: Shapes) => readFigure({ paths: [], letters: [], pictures: [] }, () => true, [], s);

describe("the ink of a picture", () => {
  it("is what stands out from the paper, however the paper is coloured", () => {
    const shapes = [line([10, 20], [50, 20], 3)];
    for (const [ink, paper] of [
      [
        [0, 0, 0],
        [255, 255, 255],
      ],
      [
        [200, 30, 30],
        [255, 255, 255],
      ],
      [
        [255, 255, 255],
        [0, 0, 0],
      ],
    ] as [number, number, number][][]) {
      const got = inkOf(picture(60, 40, shapes, ink as [number, number, number], paper))!;
      expect(got.ink[20 * 60 + 30]).toBe(1);
      expect(got.ink[5 * 60 + 30]).toBe(0);
      expect(got.cover[20 * 60 + 30]).toBeCloseTo(1, 1);
    }
  });

  it("is none where nothing is drawn", () => {
    expect(inkOf(picture(30, 30, []))).toBeNull();
    expect(tracePicture(picture(30, 30, []))).toEqual({ none: "Nothing is drawn in the picture." });
  });

  it("falls into patches, those touching at a corner one", () => {
    const ink = new Uint8Array([1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1]);
    const { patch, count } = patchesOf(ink, 4, 3);
    expect(count).toBe(2);
    expect(patch[0]).toBe(patch[5 - 0 - 1]);
    expect(patch[10]).toBe(patch[11]);
    expect(patch[10]).not.toBe(patch[0]);
  });

  it("thins to a line a pixel wide, as long as it was", () => {
    const p = picture(50, 20, [line([5, 10], [45, 10], 5)]);
    const s = thinned(inkOf(p)!.ink, 50, 20);
    for (let x = 10; x < 40; x++) {
      let n = 0;
      for (let y = 0; y < 20; y++) n += s[y * 50 + x];
      expect(n).toBe(1);
    }
  });
});

describe("a picture traced", () => {
  it("gives a line as one stroke, end to end, as wide as it is drawn", () => {
    for (const w of [2.5, 5]) {
      const t = traced(tracePicture(picture(100, 100, [line([20, 30], [80, 65], w)])));
      expect(t.shapes.strokes).toHaveLength(1);
      const [s] = t.shapes.strokes;
      const [a, b] = near(s.a, [20, 30], 10) ? [s.a, s.b] : [s.b, s.a];
      // (to the ink's end: its round end half its width on)
      expect(near(a, [20, 30], w / 2 + 1)).toBe(true);
      expect(near(b, [80, 65], w / 2 + 1)).toBe(true);
      expect(Math.abs(s.w - w)).toBeLessThan(0.5);
      expect(t.line).toBeCloseTo(s.w, 5);
    }
  });

  it("gives bonds meeting as strokes ending where they meet, at the atom", () => {
    // (a zigzag and a branch: bends and a join of three)
    const atoms: Pt[] = [
      [30, 90],
      [82, 60],
      [134, 90],
      [186, 60],
      [134, 150],
    ];
    const bonds: [number, number][] = [
      [0, 1],
      [1, 2],
      [2, 3],
      [2, 4],
    ];
    for (const w of [2.5, 5]) {
      const t = traced(tracePicture(picture(220, 180, bonds.map(([a, b]) => line(atoms[a], atoms[b], w)))));
      expect(t.shapes.strokes).toHaveLength(4);
      for (const k of [1, 2]) expect(ends(t.shapes).filter((p) => near(p, atoms[k], 1)).length).toBe(k === 2 ? 3 : 2);
      expect(t.bond).toBeGreaterThan(55);
      expect(t.bond).toBeLessThan(65);
    }
  });

  it("gives a ring with its double bonds' inner lines that the figure reader reads as benzene", { timeout: 30_000 }, () => {
    for (const [bond, w] of [
      [60, 2.5],
      [120, 5],
    ]) {
      const c: Pt = [bond * 1.6, bond * 1.6];
      const h = hexagon(c, bond);
      const shapes: Shape[] = h.map((p, k) => line(p, h[(k + 1) % 6], w));
      // (every other bond's second line, inside the ring, shortened at both ends)
      for (const k of [0, 2, 4]) {
        const [p, q] = [h[k], h[(k + 1) % 6]];
        const inward = (v: Pt): Pt => [v[0] + (c[0] - v[0]) * 0.2, v[1] + (c[1] - v[1]) * 0.2];
        const [pi, qi] = [inward(p), inward(q)];
        const cut = (u: Pt, v: Pt): Pt => [u[0] + (v[0] - u[0]) * 0.12, u[1] + (v[1] - u[1]) * 0.12];
        shapes.push(line(cut(pi, qi), cut(qi, pi), w));
      }
      const t = traced(tracePicture(picture(Math.round(bond * 3.2), Math.round(bond * 3.2), shapes)));
      const r = read(t.shapes);
      expect(r.atoms).toHaveLength(6);
      expect(r.bonds).toHaveLength(6);
      expect(r.bonds.filter((b) => b.order === 2)).toHaveLength(3);
      for (const p of h) expect(r.atoms.some((a) => near(a, p, 1.5))).toBe(true);
    }
  });

  it("gives a line widening from one end as a wedge, narrow at the stereocentre", { timeout: 30_000 }, () => {
    for (const [bond, w] of [
      [60, 2.5],
      [120, 5],
    ]) {
      const c: Pt = [bond * 1.4, bond * 1.4];
      const h = hexagon(c, bond);
      const out: Pt = [h[1][0] + bond * Math.sin(Math.PI / 3), h[1][1] - bond * Math.cos(Math.PI / 3)];
      const shapes: Shape[] = [...h.map((p, k) => line(p, h[(k + 1) % 6], w)), wedge(h[1], out, 0.22 * bond)];
      const t = traced(tracePicture(picture(Math.round(bond * 3.4), Math.round(bond * 2.8), shapes)));
      expect(t.shapes.wedges).toHaveLength(1);
      const [wg] = t.shapes.wedges;
      // (its tip where its ink begins: drawn to a point, the first pixel or two of it too faint to be ink)
      expect(near(wg.tip, h[1], 0.06 * bond)).toBe(true);
      expect(near(wg.base, out, 1.5)).toBe(true);
      expect(Math.abs(wg.w - 0.22 * bond)).toBeLessThan(0.15 * 0.22 * bond);
      const r = read(t.shapes);
      expect(r.atoms).toHaveLength(7);
      const b = r.bonds.find((x) => x.stereo === "up")!;
      expect(near(r.atoms[b.a], h[1], 0.06 * bond)).toBe(true);
    }
  });

  it("gives a line much wider than the rest as a bold one", () => {
    const atoms: Pt[] = [
      [30, 90],
      [82, 60],
      [134, 90],
      [186, 60],
    ];
    const t = traced(tracePicture(picture(220, 140, [line(atoms[0], atoms[1], 2.5), line(atoms[1], atoms[2], 10), line(atoms[2], atoms[3], 2.5)])));
    expect(t.shapes.wedges).toHaveLength(0);
    const r = read(t.shapes);
    expect(r.bonds).toHaveLength(3);
    expect(r.bonds.filter((b) => b.bold)).toHaveLength(1);
  });

  it("gives a hash's short bars each as a stroke of its own, read as a bond behind the page", () => {
    const bond = 60;
    const c: Pt = [84, 84];
    const h = hexagon(c, bond);
    const [from, to]: Pt[] = [h[1], [h[1][0] + bond * Math.sin(Math.PI / 3), h[1][1] - bond * Math.cos(Math.PI / 3)]];
    const shapes: Shape[] = h.map((p, k) => line(p, h[(k + 1) % 6], 2.5));
    const u = [(to[0] - from[0]) / bond, (to[1] - from[1]) / bond];
    for (let k = 1; k <= 6; k++) {
      const t = k / 6.5;
      const half = 1.5 + 6 * t;
      const m: Pt = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
      shapes.push(line([m[0] - u[1] * half, m[1] + u[0] * half], [m[0] + u[1] * half, m[1] - u[0] * half], 2));
    }
    const t = traced(tracePicture(picture(210, 170, shapes)));
    expect(t.shapes.strokes).toHaveLength(12);
    const r = read(t.shapes);
    expect(r.atoms).toHaveLength(7);
    const b = r.bonds.find((x) => x.stereo === "down")!;
    expect(b).toBeTruthy();
    // (narrow at the ring's atom - set where the reader joins the hash's narrow end to it - wide at the other)
    expect(near(r.atoms[b.a], from, 0.1 * bond)).toBe(true);
    expect(near(r.atoms[b.b], to, 0.06 * bond)).toBe(true);
  });

  it("gives a round closed line as a curve, and a small shape that is no line as its outlines", () => {
    const c: Pt = [100, 100];
    const h = hexagon(c, 60);
    const shapes: Shape[] = [...h.map((p, k) => line(p, h[(k + 1) % 6], 2.5)), ring(c, 36, 2.5)];
    // (an O, a letter's size, apart from the rest)
    const o = ring([190, 30], 8, 2.5);
    const t = traced(tracePicture(picture(220, 200, [...shapes, o])));
    expect(t.shapes.curves).toHaveLength(1);
    expect(t.shapes.blobs).toHaveLength(1);
    expect(t.shapes.blobs[0].parts).toHaveLength(2);
    expect(t.shapes.strokes).toHaveLength(6);
    // (the letters a PDF gives over the picture left out of it)
    const without = traced(tracePicture(picture(220, 200, [...shapes, o]), [[178, 18, 202, 42]]));
    expect(without.shapes.blobs).toHaveLength(0);
    expect(without.shapes.strokes).toHaveLength(6);
  });

  it("lays its shapes on a page: its pixels made points", () => {
    const t = traced(tracePicture(picture(100, 60, [line([20, 30], [80, 30], 4)])));
    const s = onPage(t.shapes, 0.5, 100, 200).strokes[0];
    const xs = [s.a.x, s.b.x].sort((p, q) => p - q);
    expect(xs[0]).toBeCloseTo(100 + 18 * 0.5, 0);
    expect(xs[1]).toBeCloseTo(100 + 82 * 0.5, 0);
    expect(s.a.y).toBeCloseTo(215, 0);
    expect(s.w).toBeCloseTo(2, 0);
  });
});
