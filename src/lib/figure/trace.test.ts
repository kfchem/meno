import { describe, expect, it } from "vitest";
import type { Pixels } from "./inkFit";
import { readFigure } from "./read";
import type { Blob, Point, Shapes } from "./drawn";
import { closedJoints, widening, inkOf, onPage, patchesOf, shadedOf, thinned, tracePicture, unreadInk, type Piece, type Traced, type Vertex } from "./trace";
import type { FigureRead } from "./read";
import { LOST_LABEL_SAID, readTracedPicture } from "./tracedRead";
import { glyphShape, type GlyphShape } from "./glyphs";
import { measured } from "../../testing/timeouts";

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

/** A line from one point to another, `w` wide, its ends cut flat - as a drawing program strokes a bond with butt caps: where two meet, a notch. */
const flat =
  (p: Pt, q: Pt, w: number): Shape =>
  (x, y) => {
    const d = [q[0] - p[0], q[1] - p[1]];
    const t = ((x - p[0]) * d[0] + (y - p[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1]);
    return t >= 0 && t <= 1 && Math.hypot(x - (p[0] + t * d[0]), y - (p[1] + t * d[1])) <= w / 2;
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

  it("keeps a slanting line two pixels thick: thinned to a line its whole length, not to nothing", () => {
    // (a line at 45 degrees, its ink a staircase two pixels thick - as a bond 2.5 wide is inked at 300 dpi)
    const [w, h] = [40, 40];
    const ink = new Uint8Array(w * h);
    for (let i = 5; i < 35; i++) {
      ink[i * w + i] = 1;
      ink[i * w + i + 1] = 1;
    }
    const s = thinned(ink, w, h);
    const rows = Array.from({ length: h }, (_, y) => s.subarray(y * w, (y + 1) * w).some((v) => v));
    expect(rows.slice(7, 33).every((r) => r)).toBe(true);
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

  it("closes a joint thinning left open: a wedge's wide end, cut along the bond into it, where the chain goes on - one atom there", { timeout: 30_000 }, () => {
    // (as a page is drawn at 300 dpi: bonds 60 pixels, lines 2.5, cut flat; the wedge's wide end 16 across, cut along the bond that
    // goes on from it - its far corner a point standing out, which thinning leaves as a spur and a second node)
    const tri =
      (a: Pt, b: Pt, c: Pt): Shape =>
      (x, y) => {
        const s = (p: Pt, q: Pt) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
        const [d1, d2, d3] = [s(a, b), s(b, c), s(c, a)];
        return (d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0);
      };
    const j: Pt = [100, 110];
    const tip: Pt = [160, 110];
    const d: Pt = [-0.5, -0.866];
    const up: Pt = [j[0] + 60 * d[0], j[1] + 60 * d[1]];
    const shapes = [tri(tip, [j[0] + 8 * d[0], j[1] + 8 * d[1]], [j[0] - 8 * d[0], j[1] - 8 * d[1]]), flat(j, up, 2.5), flat(up, [up[0] - 60, up[1]], 2.5), flat(tip, [190, 58.1], 2.5), flat(tip, [190, 161.9], 2.5)];
    const t = traced(tracePicture(picture(220, 180, shapes)));
    // (four lines and the wedge: no short piece left between the joint's two nodes)
    expect([t.shapes.strokes.length, t.shapes.wedges.length]).toEqual([4, 1]);
    const r = read(t.shapes);
    expect(r.atoms.filter((a) => near(a, j, 15))).toHaveLength(1);
    expect([r.atoms.length, r.bonds.length]).toEqual([6, 5]);
    expect(r.bonds.filter((b) => b.stereo === "up")).toHaveLength(1);
  });

  it("closes a joint left open into one atom where the lines into it cross, a fork's two lines each ending on its own line", () => {
    // (a joint left as two nodes a short piece apart: into one, a double bond's two lines side by side; into the other, a line from below)
    const v = (x: number, y: number, free = false): Vertex => ({ at: { x, y }, deep: 1, free, pieces: [] });
    const [p, q] = [v(100, 100), v(104, 103)];
    const lay = (a: Vertex, b: Vertex, from: Point, to: Point) => ({ piece: { a, b, pts: [], patch: 0 } as Piece, a: from, b: to, length: Math.hypot(to.x - from.x, to.y - from.y) });
    const laid = [
      lay(p, q, p.at, q.at),
      lay(v(40, 97, true), p, { x: 40, y: 97 }, { x: 100, y: 97 }),
      lay(v(40, 103, true), p, { x: 40, y: 103 }, { x: 100, y: 103 }),
      lay(q, v(104, 160, true), { x: 104, y: 103 }, { x: 104, y: 160 }),
    ];
    const gone = closedJoints(laid, 60);
    expect([...gone]).toEqual([0]);
    // (the line from below ends where it crosses the fork's middle line, y 100; each of the fork's lines ends at that x on its own line)
    expect(laid[3].a.x).toBeCloseTo(104, 5);
    expect(laid[3].a.y).toBeCloseTo(100, 5);
    expect([laid[1].b, laid[2].b].map((e) => [Math.round(e.x), Math.round(e.y)])).toEqual([
      [104, 97],
      [104, 103],
    ]);
    // (a piece as short with a free end is a line's end, not a joint: kept)
    const kept = [lay(v(10, 10), v(14, 10, true), { x: 10, y: 10 }, { x: 14, y: 10 })];
    expect(closedJoints(kept, 60).size).toBe(0);
  });

  it("tells a wedge by how its widths rise one way, however unevenly the pixels' grid measures them; a line as wide all along, unevenly measured, is none", () => {
    // (a wedge 60 long widening from 3 to 12, measured in ten bins from 18 to 54, every other bin a fifth off - a straight line's fit of
    // them is poor, their ranks rise)
    const bins = Array.from({ length: 10 }, (_, k) => 18 + 4 * k);
    const wedge = bins.map((t, k) => ({ t, w: (3 + (9 * t) / 60) * (k % 2 ? 1.15 : 0.8) }));
    const w = widening(wedge, 60)!;
    expect(w).not.toBeNull();
    expect(w.wa).toBeLessThan(0.5 * w.wb);
    expect(w.wb).toBeGreaterThan(9);
    // (its ends where most of its widths put them: 3.45 and 13.8, about the 3 and 12 drawn - not where its first width alone would; one
    // bin far off - a joint's ink at its wide end, 30 - moves them not at all)
    expect(w.wa).toBeCloseTo(3.45, 1);
    expect(w.wb).toBeCloseTo(13.8, 1);
    const off = widening(wedge.map((q, k) => (k === 9 ? { ...q, w: 30 } : q)), 60)!;
    expect(off.wa).toBeCloseTo(3.45, 1);
    expect(off.wb).toBeCloseTo(13.8, 1);
    // (the same wedge measured the other way round, every other bin a fifth over and under: its widths agree less - Kendall's 0.51 - and
    // it is a wedge still)
    expect(widening(bins.map((t, k) => ({ t, w: (3 + (9 * t) / 60) * (k % 2 ? 0.8 : 1.15) })), 60)).not.toBeNull();
    // (widths all the same: no way it widens)
    expect(widening(bins.map((t) => ({ t, w: 8 })), 60)).toBeNull();
    // (as many widths falling along it as rising: no way it widens)
    const even = bins.map((t, k) => ({ t, w: 8 * [1, 1.2, 0.85, 1.15, 0.9, 1.1, 0.8, 1.2, 0.95, 1][k] }));
    expect(widening(even, 60)).toBeNull();
    // (a trend too faint: two of three pairs of widths not agreeing)
    const faint = bins.map((t, k) => ({ t, w: [8, 9.5, 7.5, 9, 8.5, 10, 7.8, 9.8, 8.6, 9.4][k] }));
    expect(widening(faint, 60)).toBeNull();
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

/** An H, `h` tall and three fifths as wide, its foot at `foot` (its left stem's): three lines `w` wide. */
const letterH = (foot: Pt, h: number, w: number): Shape[] => {
  const [x, y] = foot;
  const r = x + 0.6 * h;
  return [line([x, y], [x, y - h], w), line([r, y], [r, y - h], w), line([x, y - h / 2], [r, y - h / 2], w)];
};

/** An N, `h` tall and three fifths as wide, its foot at `foot` (its left stem's): three lines `w` wide, joined at its corners. */
const letterN = (foot: Pt, h: number, w: number): Shape[] => {
  const [x, y] = foot;
  const r = x + 0.6 * h;
  return [line([x, y], [x, y - h], w), line([x, y - h], [r, y], w), line([r, y], [r, y - h], w)];
};

/** A C, `h` tall: most of a ring's line, open to the right, its foot on `foot`'s line, its left at `foot`'s x. */
const letterC =
  (foot: Pt, h: number, w: number): Shape =>
  (x, y) => {
    const c = [foot[0] + h * 0.42, foot[1] - h / 2];
    const a = Math.atan2(y - c[1], x - c[0]);
    return Math.abs(Math.hypot((x - c[0]) / 0.84, y - c[1]) - h / 2 + w / 2) <= w / 2 && Math.abs(a) > Math.PI / 4;
  };

describe("a picture's letters", () => {
  it("takes a round closed line at a bond's end for a letter however large, and one with a ring's bonds round it for the ring's circle", { timeout: 30_000 }, () => {
    const c: Pt = [100, 180];
    const h = hexagon(c, 60);
    // (a bond out of the top corner, an O at its end four fifths of a bond tall: as large as a ring's circle is wide)
    const top = h[0];
    const end: Pt = [top[0], top[1] - 60];
    const o = ring([end[0], end[1] - 26], 24, 2.5);
    const shapes: Shape[] = [...h.map((p, k) => line(p, h[(k + 1) % 6], 2.5)), ring(c, 34, 2.5), line(top, [end[0], end[1] + 8], 2.5), o];
    const t = traced(tracePicture(picture(220, 260, shapes)));
    expect(t.shapes.curves).toHaveLength(1);
    expect(Math.hypot(t.shapes.curves[0].pts[0].x - c[0], t.shapes.curves[0].pts[0].y - c[1])).toBeGreaterThan(25);
    expect(t.shapes.blobs).toHaveLength(1);
    expect(t.shapes.blobs[0].box[1]).toBeLessThan(end[1]);
  });

  it("measures the bond on the structure, not on its letters' many short strokes; a letter four fifths of a bond tall is a letter", { timeout: 30_000 }, () => {
    // (a chain of two bonds of 60, an H at each of its ends and two more beside it: twelve strokes of letters for two of bonds)
    const [a, b, c]: Pt[] = [
      [70, 120],
      [122, 90],
      [174, 120],
    ];
    const shapes: Shape[] = [line(a, b, 2.5), line(b, c, 2.5), ...letterH([30, 150], 48, 3), ...letterH([186, 150], 48, 3), ...letterH([30, 60], 48, 3), ...letterH([186, 60], 48, 3)];
    const t = traced(tracePicture(picture(240, 180, shapes)));
    expect(t.bond).toBeGreaterThan(50);
    expect(t.bond).toBeLessThan(70);
    expect(t.shapes.blobs).toHaveLength(4);
    expect(t.shapes.strokes).toHaveLength(2);
    // (an N as tall: its stems and its slant each four fifths of a bond or more, one piece each - a letter's strokes still)
    const n = traced(tracePicture(picture(240, 180, [line(a, b, 2.5), line(b, c, 2.5), ...letterN([30, 150], 48, 3), ...letterN([186, 150], 48, 3)])));
    expect(n.shapes.blobs).toHaveLength(2);
    expect(n.shapes.strokes).toHaveLength(2);
  });

  it("takes a round closed line for a letter where the lines round it point at it, or are a letter's own: a ring's bonds run across the way out of its circle", { timeout: 30_000 }, () => {
    const c: Pt = [150, 150];
    const o = ring(c, 24, 2.5);
    // (a ring elsewhere, for the bond)
    const h = hexagon([60, 60], 60).map((p, k, all) => line(p, all[(k + 1) % 6], 2.5));
    // (four bonds each pointing at the O, each a patch of its own)
    const spokes = [0, 1, 2, 3].map((k) => {
      const t = (k * Math.PI) / 2 + Math.PI / 4;
      return line([c[0] + 32 * Math.cos(t), c[1] + 32 * Math.sin(t)], [c[0] + 100 * Math.cos(t), c[1] + 100 * Math.sin(t)], 2.5);
    });
    const pointing = traced(tracePicture(picture(300, 300, [...h, o, ...spokes])));
    expect(pointing.shapes.curves).toHaveLength(0);
    expect(pointing.shapes.blobs).toHaveLength(1);
    // (an H either side of it, their stems running across the way out of it: a letter's lines, not a ring's)
    const hs = [...letterH([c[0] - 60, c[1] + 20], 40, 3), ...letterH([c[0] + 34, c[1] + 20], 40, 3)];
    const lettered = traced(tracePicture(picture(300, 300, [...h, o, ...hs])));
    expect(lettered.shapes.curves).toHaveLength(0);
    expect(lettered.shapes.blobs).toHaveLength(3);
  });

  it("takes an upright line alone, as tall as a letter beside it on its line, for a letter - the l of a Cl; one with no letter beside it stays a line", { timeout: 30_000 }, () => {
    const c: Pt = [90, 110];
    const h = hexagon(c, 60);
    const ringLines = h.map((p, k) => line(p, h[(k + 1) % 6], 2.5));
    // (a C and an l beside it, as tall, on its line, to the ring's right)
    const cl: Shape[] = [letterC([170, 130], 36, 3.5), line([205, 130], [205, 94], 3.5)];
    const withC = traced(tracePicture(picture(240, 220, [...ringLines, ...cl])));
    expect(withC.shapes.blobs).toHaveLength(2);
    expect(withC.shapes.strokes).toHaveLength(6);
    // (the l alone: a line)
    const alone = traced(tracePicture(picture(240, 220, [...ringLines, cl[1]])));
    expect(alone.shapes.blobs).toHaveLength(0);
    expect(alone.shapes.strokes).toHaveLength(7);
  });
});

describe("a picture not read", () => {
  it("is drawn too small to read where its bond is under 25 of its pixels", () => {
    const at = (bond: number) => {
      const c: Pt = [bond * 1.6, bond * 1.6];
      const h = hexagon(c, bond);
      return tracePicture(picture(Math.round(bond * 3.2), Math.round(bond * 3.2), h.map((p, k) => line(p, h[(k + 1) % 6], 2))));
    };
    expect(at(22)).toEqual({ none: "The picture is drawn too small to read." });
    expect("none" in at(28)).toBe(false);
  });

  it("is shaded, as a photograph or a rendering is, where a tenth of its ink lies in grey fields; a drawing's grey is at its lines' edges", () => {
    const c: Pt = [100, 100];
    const h = hexagon(c, 60);
    const lines = h.map((p, k) => line(p, h[(k + 1) % 6], 2.5));
    const drawn = picture(200, 200, lines);
    expect(shadedOf(inkOf(drawn)!)).toBeLessThan(0.01);
    // (a ball shaded from grey at its rim to darker at its middle, beside the ring)
    const shaded = picture(200, 200, lines);
    const data = shaded.data as Uint8ClampedArray;
    for (let y = 0; y < 200; y++)
      for (let x = 0; x < 200; x++) {
        const d = Math.hypot(x - 150, y - 150);
        if (d > 40) continue;
        const v = Math.round(110 + 80 * (d / 40));
        for (let k = 0; k < 3; k++) data[4 * (y * 200 + x) + k] = Math.min(data[4 * (y * 200 + x) + k], v);
      }
    expect(shadedOf(inkOf(shaded)!)).toBeGreaterThan(0.1);
    // (a small grey dot beside it - a twentieth of its ink in a grey field - is a drawing still)
    const dotted = picture(200, 200, [...lines, (x, y) => Math.hypot(x - 170, y - 170) <= 5]);
    const dd = dotted.data as Uint8ClampedArray;
    for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) if (Math.hypot(x - 170, y - 170) <= 5) for (let k = 0; k < 3; k++) dd[4 * (y * 200 + x) + k] = 128;
    expect(shadedOf(inkOf(dotted)!)).toBeGreaterThan(0.01);
    expect("none" in tracePicture(dotted)).toBe(false);
    expect(tracePicture(shaded)).toEqual({ none: "The picture is shaded, as a photograph or a rendering is: it is not a drawing to read." });
  });
});

describe("ink read as nothing beside a structure read", () => {
  // (a chain of three atoms a bond of 60 apart)
  const read = (letters: FigureRead["left"]["letters"] = []): FigureRead => ({
    atoms: [
      { x: 0, y: 0 },
      { x: 52, y: 30 },
      { x: 104, y: 0 },
    ],
    bonds: [],
    bond: 60,
    left: { letters },
  });
  const blob = (x: number, y: number): Blob => {
    const pts = [
      { x, y },
      { x: x + 10, y },
      { x: x + 10, y: y + 20 },
      { x, y: y + 20 },
    ];
    return { pts, parts: [pts], box: [x, y, x + 10, y + 20], curved: true };
  };
  const shapes = (blobs: Blob[]): Shapes => ({ strokes: [], wedges: [], curves: [], blobs });

  it("leaves the atom nearest a patch no letter matches unsure, within 0.6 of a bond of it; farther, nothing; a patch read as a letter, nothing", () => {
    // (its middle 33 below the atom at 104, 0: 0.55 of the bond; 39 below: 0.65)
    expect([...unreadInk(read(), shapes([blob(99, 23)]), []).keys()]).toEqual([2]);
    expect(unreadInk(read(), shapes([blob(99, 29)]), []).size).toBe(0);
    const matched = blob(99, 23);
    expect(unreadInk(read(), shapes([matched]), [], [{ from: [matched] }]).size).toBe(0);
  });

  it("leaves the atom nearest a letter read in no label unsure, within 1.2 bonds of it: a label whose bond was not read", () => {
    const letter = (x: number, y: number) => ({ c: "O", box: [x - 5, y - 10, x + 5, y + 10] as [number, number, number, number], at: null, size: 10 });
    const near = unreadInk(read([letter(170, 0)]), shapes([]), []);
    expect([...near.keys()]).toEqual([2]);
    expect(near.get(2)).toBe('"O" beside it in the picture was read in no label.');
    expect(unreadInk(read([letter(180, 0)]), shapes([]), []).size).toBe(0);
  });
});

// (found in review, #1277: the edges of the numbers of the joint rule and the wedge rule)
const vx = (x: number, y: number, free = false): Vertex => ({ at: { x, y }, deep: 1, free, pieces: [] });
const layx = (a: Vertex, b: Vertex, from: Point, to: Point) => ({ piece: { a, b, pts: [], patch: 0 } as Piece, a: from, b: to, length: Math.hypot(to.x - from.x, to.y - from.y) });

describe("the edges of the numbers of the joint rule and the wedge rule", () => {
  it("a piece between two joints is no bond under 0.35 of the bond, and is one over it: 20 and 22.5 of a bond of 60", () => {
    const piece = (d: number) => [layx(vx(100, 100), vx(100 + d, 100), { x: 100, y: 100 }, { x: 100 + d, y: 100 })];
    expect([...closedJoints(piece(20), 60)]).toEqual([0]);
    expect(closedJoints(piece(22.5), 60).size).toBe(0);
  });

  // (a joint left as two nodes 5 apart; two lines come into the one from the left, the second turned from the first by `deg` degrees; each ends at the
  //  joint: a fork - within 15 degrees - keeps each on its own line, the two ends apart; else both ends are one joint)
  const endsOf = (deg: number) => {
    const t = (deg * Math.PI) / 180;
    const [p, q] = [vx(100, 97), vx(105, 100)];
    const laid = [
      layx(p, q, p.at, q.at),
      layx(vx(40, 97, true), p, { x: 40, y: 97 }, { x: 100, y: 97 }),
      layx(vx(100 - 60 * Math.cos(t), 103 + 60 * Math.sin(t), true), p, { x: 100 - 60 * Math.cos(t), y: 103 + 60 * Math.sin(t) }, { x: 100, y: 103 }),
    ];
    closedJoints(laid, 60);
    return [laid[1].b, laid[2].b];
  };

  it("two lines 14 degrees apart are a fork: each ends on its own line, the two ends apart", () => {
    const [a, b] = endsOf(14);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(1);
  });

  it("two lines 16 degrees apart are no fork: both end at the one joint", () => {
    const [a, b] = endsOf(16);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-6);
  });

  it("a width rises one way surely enough where Kendall's rank correlation is 0.3 or more: 0.333 is a wedge, 0.289 none (ten widths, 15 and 16 of 45 pairs against)", () => {
    // (ten places along a line 60 long, the widths a permutation of 0 to 9 with `inversions` pairs against the rise: tau = (45 - 2 x inversions) / 45)
    const series = (inversions: number) => {
      const left = Array.from({ length: 10 }, (_, k) => k);
      const out: number[] = [];
      let rest = inversions;
      for (let k = 0; k < 10; k++) {
        const take = Math.min(rest, 9 - k);
        out.push(left.splice(left.length - 1 - take, 1)[0]);
        rest -= take;
      }
      return out.map((w, k) => ({ t: 6 * k + 3, w: 3 + w }));
    };
    expect(widening(series(15), 60)).not.toBeNull();
    expect(widening(series(16), 60)).toBeNull();
  });
});

describe("a scheme's picture", () => {
  it("measures its bond on its structures, not on a reaction arrow far longer than any of them", { timeout: 30_000 }, () => {
    // (three rings a bond of 30 long, apart, and an arrow of eight bonds across the picture under them, its head two short lines)
    const rings = [60, 160, 260].flatMap((x) => hexagon([x, 70], 30).map((p, k, all) => line(p, all[(k + 1) % 6], 2.5)));
    const arrow = [line([20, 170], [300, 170], 2.5), line([300, 170], [288, 162], 2.5), line([300, 170], [288, 178], 2.5)];
    const t = traced(tracePicture(picture(330, 200, [...rings, ...arrow])));
    expect(t.bond).toBeGreaterThan(25);
    expect(t.bond).toBeLessThan(35);
    // (each ring's six bonds lines, none taken for a letter)
    expect(t.shapes.blobs).toHaveLength(0);
  });
});

describe("a letter-sized patch of one or two lines, standing apart", () => {
  // (a typeface of the test's own, in ems, y down, the line at naught, its capitals 0.72 tall: a 7, a 1 with its flag, an l, a minus)
  const FACE: Record<string, Pt[]> = {
    "7": [[0.05, -0.72], [0.5, -0.72], [0.5, -0.65], [0.23, 0], [0.13, 0], [0.4, -0.63], [0.05, -0.63]],
    "1": [[0.2, -0.72], [0.28, -0.72], [0.28, 0], [0.19, 0], [0.19, -0.58], [0.06, -0.5], [0.06, -0.59]],
    l: [[0.07, -0.72], [0.16, -0.72], [0.16, 0], [0.07, 0]],
    "-": [[0.05, -0.3], [0.5, -0.3], [0.5, -0.24], [0.05, -0.24]],
  };
  const KNOWN: GlyphShape[] = Object.entries(FACE).map(([c, ps]) => glyphShape(c, [ps.map(([x, y]) => ({ x, y }))], 0.72));
  /** A glyph of the face filled, `size` pixels to the em, its line's left at `at`. */
  const glyph =
    (c: string, at: Pt, size: number): Shape =>
    (x, y) => {
      const ps = FACE[c].map(([u, v]): Pt => [at[0] + u * size, at[1] + v * size]);
      let inside = false;
      for (let i = 0, j = ps.length - 1; i < ps.length; j = i++)
        if (ps[i][1] > y !== ps[j][1] > y && x < ((ps[j][0] - ps[i][0]) * (y - ps[i][1])) / (ps[j][1] - ps[i][1]) + ps[i][0]) inside = !inside;
      return inside;
    };
  const within = (p: Point, box: readonly number[]) => p.x >= box[0] - 2 && p.x <= box[2] + 2 && p.y >= box[1] - 2 && p.y <= box[3] + 2;
  // (a ring a bond of 40 long, and a 17 under it a bond and more away, as a compound's number is set)
  const ringLines = hexagon([100, 70], 40).map((p, k, all) => line(p, all[(k + 1) % 6], 3));
  const number = [glyph("1", [80, 175], 40), glyph("7", [94, 175], 40)];
  const numberBox = [80, 145, 116, 175];

  it("is read as a letter where the system's letters match it - a compound's number is words, not bonds", { timeout: 30_000 }, () => {
    const t = traced(tracePicture(picture(200, 190, [...ringLines, ...number]), [], KNOWN));
    expect(t.shapes.strokes.filter((s) => within(s.a, numberBox) && within(s.b, numberBox))).toHaveLength(0);
    expect(t.shapes.blobs.filter((b) => within({ x: b.box[0], y: b.box[1] }, numberBox))).toHaveLength(2);
    // (the ring's six bonds lines still)
    expect(t.shapes.strokes).toHaveLength(6);
  });

  it("is lines where no letters are given, as before", { timeout: 30_000 }, () => {
    const t = traced(tracePicture(picture(200, 190, [...ringLines, ...number])));
    expect(t.shapes.strokes.filter((s) => within(s.a, numberBox) && within(s.b, numberBox)).length).toBeGreaterThan(0);
  });

  it("is never one straight line alone - a bond from a label to its free end, as a methyl's is - which would read as an l", { timeout: 30_000 }, () => {
    // (the ring, and under it a line as long as a bond to a label, upright, alone)
    const t = traced(tracePicture(picture(200, 190, [...ringLines, line([100, 145], [100, 175], 3)]), [], KNOWN));
    expect(t.shapes.blobs).toHaveLength(0);
    expect(t.shapes.strokes).toHaveLength(7);
  });

  it("is never a double bond's inner line, which lies by its outer one", { timeout: 30_000 }, () => {
    // (the ring's bottom right bond doubled within it, its inner line shorter, a sixth of a bond in)
    const corners = hexagon([100, 70], 40);
    const [p, q] = [corners[2], corners[3]];
    const m: Pt = [100, 70];
    const inward = (r: Pt): Pt => [r[0] + (m[0] - r[0]) * 0.2, r[1] + (m[1] - r[1]) * 0.2];
    const [pi, qi] = [inward(p), inward(q)];
    const shorten = (a: Pt, b: Pt): Pt => [a[0] + (b[0] - a[0]) * 0.12, a[1] + (b[1] - a[1]) * 0.12];
    const t = traced(tracePicture(picture(200, 140, [...ringLines, line(shorten(pi, qi), shorten(qi, pi), 3)]), [], KNOWN));
    expect(t.shapes.blobs).toHaveLength(0);
    expect(t.shapes.strokes).toHaveLength(7);
  });
});

// (found in review: the edges of the numbers of the letters, the shading and the circle's lines, each held on both sides)
describe("the edges of the new numbers", () => {
  it("a ball a seventh or so of the ink in grey is shaded, and refused so; a twentieth is not", () => {
    const c: Pt = [100, 100];
    const h = hexagon(c, 60);
    const lines = h.map((p, k) => line(p, h[(k + 1) % 6], 2.5));
    const ball = (r: number) => {
      const pic = picture(200, 200, [...lines, (x, y) => Math.hypot(x - 170, y - 170) <= r]);
      const d = pic.data as Uint8ClampedArray;
      for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) if (Math.hypot(x - 170, y - 170) <= r) for (let k = 0; k < 3; k++) d[4 * (y * 200 + x) + k] = 128;
      return pic;
    };
    const share = shadedOf(inkOf(ball(10))!);
    expect(share).toBeGreaterThan(0.1);
    expect(share).toBeLessThan(0.3);
    expect(tracePicture(ball(10))).toEqual({ none: "The picture is shaded, as a photograph or a rendering is: it is not a drawing to read." });
    expect("none" in tracePicture(ball(4))).toBe(false);
  });

  it("a patch a bond across or more is no letter, however short its pieces: a zigzag of five short strokes 1.2 bonds across stays lines; 0.9 across is a letter", () => {
    const bond = 60;
    const ring6 = hexagon([90, 110], bond).map((p, k, all) => line(p, all[(k + 1) % 6], 2.5));
    const zig = (across: number): Shape[] => {
      // (six points up and down, each stroke 0.4 of a bond or less, a zigzag as a made letter's strokes are)
      const dx = across / 5;
      const pts: Pt[] = Array.from({ length: 6 }, (_, k) => [190 + k * dx, 120 + (k % 2 ? -0.3 * bond : 0.3 * bond)]);
      return pts.slice(1).map((p, k) => line(pts[k], p, 3));
    };
    const wide = traced(tracePicture(picture(340, 220, [...ring6, ...zig(1.2 * bond)])));
    expect(wide.shapes.blobs).toHaveLength(0);
    const narrow = traced(tracePicture(picture(340, 220, [...ring6, ...zig(0.9 * bond)])));
    expect(narrow.shapes.blobs).toHaveLength(1);
  }, measured(850));

  it("a letter's pieces are up to 0.85 of a bond: a T whose stem is 0.9 of the measured bond is lines, one of 0.7 is a letter (both under a bond across)", () => {
    const ring6 = hexagon([90, 110], 60).map((p, k, all) => line(p, all[(k + 1) % 6], 2.5));
    const bond = traced(tracePicture(picture(300, 220, ring6))).bond;
    const T = (h: number): Shape[] => [line([200, 170], [200, 170 - h], 3), line([200 - 0.25 * h, 170 - h], [200 + 0.25 * h, 170 - h], 3)];
    const tall = traced(tracePicture(picture(300, 220, [...ring6, ...T(0.9 * bond)])));
    expect(tall.shapes.blobs).toHaveLength(0);
    const short = traced(tracePicture(picture(300, 220, [...ring6, ...T(0.7 * bond)])));
    expect(short.shapes.blobs).toHaveLength(1);
  }, measured(1_200));

  it("four lines round a circle are a ring's circle, three are not: a square with a circle in it, a triangle with a circle in it", { timeout: 30_000 }, () => {
    const bond = 90;
    // (a ring elsewhere, for the bond)
    const far = hexagon([100, 100], bond).map((p, k, all) => line(p, all[(k + 1) % 6], 3));
    const sq: Pt[] = [
      [300, 240],
      [390, 240],
      [390, 330],
      [300, 330],
    ];
    const square = [...sq.map((p, k) => line(p, sq[(k + 1) % 4], 3)), ring([345, 285], 26, 3)];
    const four = traced(tracePicture(picture(460, 380, [...far, ...square])));
    expect(four.shapes.curves).toHaveLength(1);
    const tri: Pt[] = [
      [290, 330],
      [380, 330],
      [335, 252],
    ];
    const tr = [...tri.map((p, k) => line(p, tri[(k + 1) % 3], 3)), ring([335, 308], 16, 3)];
    const three = traced(tracePicture(picture(460, 380, [...far, ...tr])));
    expect(three.shapes.curves).toHaveLength(0);
  });
});

describe("a label lost from a ring - a heteroatom's letter faint, or not drawn - never read as carbons with nothing said", () => {
  const bond = 40;
  const c: Pt = [100, 100];
  const corners = hexagon(c, bond);
  /** The ring's bonds, those into corner `at` stopping `short` of a bond before it, as bonds to a label do. */
  const ringTo = (at: number, short: number): Shape[] =>
    corners.map((p, k) => {
      const q = corners[(k + 1) % 6];
      const cut = (from: Pt, to: Pt): Pt => [to[0] + (from[0] - to[0]) * short, to[1] + (from[1] - to[1]) * short];
      return line(k === at ? cut(q, p) : p, (k + 1) % 6 === at ? cut(p, q) : q, 3);
    });
  /** An N set over point `at`, 0.85 of a bond tall and 0.6 wide: its slant a bond long, longer than a letter's piece is allowed (a letter printed large beside short bonds). */
  const bigN = (at: Pt): Shape[] => {
    const [h, w] = [0.85 * bond, 0.6 * bond];
    const [l, r, t, b] = [at[0] - w / 2, at[0] + w / 2, at[1] - h / 2, at[1] + h / 2];
    return [line([l, b], [l, t], 3), line([l, t], [r, b], 3), line([r, b], [r, t], 3)];
  };

  it("is a letter where a ring's two bonds stop short of it, however long its slant: its lines are never bonds", { timeout: 30_000 }, () => {
    const t = traced(tracePicture(picture(200, 200, [...ringTo(3, 0.55), ...bigN(corners[3])])));
    expect(t.shapes.blobs).toHaveLength(1);
    const box = t.shapes.blobs[0].box;
    expect(box[0] <= corners[3][0] && corners[3][0] <= box[2] && box[1] <= corners[3][1] && corners[3][1] <= box[3]).toBe(true);
    // (the ring's four whole bonds and the two that stop short: six lines, none of the N's)
    expect(t.shapes.strokes).toHaveLength(6);
  });

  it("is lines where no bonds stop short of it: an N-shaped mark apart from the ring, its slant as long, stays as it was", { timeout: 30_000 }, () => {
    const t = traced(tracePicture(picture(260, 200, [...ringTo(-1, 0), ...bigN([215, 100])])));
    expect(t.shapes.blobs).toHaveLength(0);
    expect(t.shapes.strokes).toHaveLength(9);
  });

  it("is said where its letter is not drawn at all: the two bonds that stop short of the corner, each end marked", { timeout: 30_000 }, () => {
    const read = readTracedPicture(picture(200, 200, ringTo(3, 0.4)), { scale: 1, x: 0, y: 0 }, [], () => true);
    if ("none" in read) throw new Error(read.none);
    const said = read.atoms.filter((a) => a.unsure?.includes(LOST_LABEL_SAID));
    expect(said).toHaveLength(2);
    for (const a of said) expect(Math.hypot(a.x - corners[3][0], a.y - corners[3][1])).toBeLessThan(0.6 * bond);
    // (and the whole ring: nothing said)
    const whole = readTracedPicture(picture(200, 200, ringTo(-1, 0)), { scale: 1, x: 0, y: 0 }, [], () => true);
    if ("none" in whole) throw new Error(whole.none);
    expect(whole.atoms.filter((a) => a.unsure?.includes(LOST_LABEL_SAID))).toHaveLength(0);
  });
});
