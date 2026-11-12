import { describe, expect, it } from "vitest";
import { boat, chair, envelope, flipped, halfChair, haworth, newman, type V3 } from "./solids";
import { CHAIR_ELEVATION_DEG, fromAbove, HAWORTH_ELEVATION_DEG, project, seen, seenFree, standardView } from "./views";

// The six drawn points of each standard view are written out by hand: x = x, up = y sin e + z cos e, depth = -y cos e + z sin e, the eye
// e degrees above the ring's plane on the side of -y (so a nearer atom, smaller y, is lower in the drawing).

const close = (a: number, b: number, digits = 4) => expect(a).toBeCloseTo(b, digits);
const order = (s: { z: number }[]) => s.map((p, k) => [p.z, k] as const).sort((a, b) => b[0] - a[0]).map(([, k]) => k);

describe("the chair's two standard views", () => {
  it("is seen from above at the look owner's elevation, 25 degrees (by eye, no basis claimed)", () => {
    expect(CHAIR_ELEVATION_DEG).toBe(25);
  });

  it("form 0 has its head up at the right: the six points as written out (sin 25 = 0.42262, cos 25 = 0.90631)", () => {
    const p = seen(chair(), standardView(chair(), 0));
    const want = [
      [0.9428, 0.1511, 0.0704],
      [0.4714, 0.194, -0.8104],
      [-0.4714, 0.4961, -0.6696],
      [-0.9428, -0.1511, -0.0704],
      [-0.4714, -0.194, 0.8104],
      [0.4714, -0.4961, 0.6696],
    ];
    p.forEach((q, k) => [q.x, q.y, q.z].forEach((v, i) => close(v, want[k][i])));
    // (the lower edge the nearer - Brecher 2006, ST-3.1: the nearer atoms of a mostly-horizontal ring lower in the drawing: depth order, nearest first, as listed)
    expect(order(p)).toEqual([4, 5, 0, 3, 2, 1]);
    // (the two lowest of the six are the two nearest)
    const lowest = [...p.keys()].sort((a, b) => p[a].y - p[b].y).slice(0, 2).sort();
    expect(lowest).toEqual([4, 5]);
  });

  it("form 1 is the other textbook chair, each the other's mirror picture: the same six points with x turned about", () => {
    const a = seen(chair(), standardView(chair(), 0));
    const b = seen(chair(), standardView(chair(), 1));
    const want = [
      [-0.9428, 0.1511, 0.0704],
      [-0.4714, -0.4961, 0.6696],
      [0.4714, -0.194, 0.8104],
      [0.9428, -0.1511, -0.0704],
      [0.4714, 0.4961, -0.6696],
      [-0.4714, 0.194, -0.8104],
    ];
    b.forEach((q, k) => [q.x, q.y, q.z].forEach((v, i) => close(v, want[k][i])));
    // (as a drawing it is the mirror: each point of one is a point of the other with x changed)
    for (const p of a) expect(b.some((q) => Math.abs(q.x + p.x) < 1e-9 && Math.abs(q.y - p.y) < 1e-9 && Math.abs(q.z - p.z) < 1e-9)).toBe(true);
  });

  it("is the same picture, flipped, with the head at the left: the ring flip is the form-0 picture's mirror", () => {
    const f = seen(flipped(chair()), standardView(chair(), 0));
    const a = seen(chair(), standardView(chair(), 0));
    for (const p of a) expect(f.some((q) => Math.abs(q.x + p.x) < 1e-9 && Math.abs(q.y - p.y) < 1e-9)).toBe(true);
    // (atom 0, the head, is the low one of the two ends)
    expect(f[0].y).toBeLessThan(f[3].y);
  });

  it("is a rotation: its three rows are unit and at right angles, right-handed", () => {
    for (const v of [standardView(chair(), 0), standardView(chair(), 1), fromAbove(40, 70)]) {
      const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      for (const r of [v.right, v.up, v.toward]) close(dot(r, r), 1, 12);
      close(dot(v.right, v.up), 0, 12);
      close(dot(v.right, v.toward), 0, 12);
      close(dot(v.up, v.toward), 0, 12);
    }
  });

  it("sees the boat, half-chair and envelope as the chair is seen", () => {
    for (const s of [boat(), halfChair(), envelope()]) expect(standardView(s)).toEqual(standardView(chair()));
  });
});

describe("the Haworth ring's standard view (McNaught 1996, 2-Carb-5.4)", () => {
  it("is from slightly above - 30 degrees by eye - the edge closer to the viewer drawn below the more distant one", () => {
    expect(HAWORTH_ELEVATION_DEG).toBe(30);
    const p = seen(haworth(6), standardView(haworth(6)));
    // (the near edge, atoms 2 and 3 - the front - is lower than the far edge, atoms 5 and 0)
    expect(Math.max(p[2].y, p[3].y)).toBeLessThan(Math.min(p[5].y, p[0].y));
    expect(Math.min(p[2].z, p[3].z)).toBeGreaterThan(Math.max(p[5].z, p[0].z));
  });

  it("has the pyranose's six points as written out: the ring O at the back right, C1 at the right-hand end, C4 at the left", () => {
    const p = seen(haworth(6), standardView(haworth(6)));
    const want = [
      [0.5, 0.433, -0.75],
      [1, 0, 0],
      [0.5, -0.433, 0.75],
      [-0.5, -0.433, 0.75],
      [-1, 0, 0],
      [-0.5, 0.433, -0.75],
    ];
    p.forEach((q, k) => [q.x, q.y, q.z].forEach((v, i) => close(v, want[k][i])));
    // (C1 the right-hand end: the largest x; the oxygen behind: the least depth among those at the right)
    expect(Math.max(...p.map((q) => q.x))).toBe(p[1].x);
    expect(p[0].z).toBeLessThan(p[2].z);
  });

  it("has the furanose's O behind and C1 at the right", () => {
    const p = seen(haworth(5), standardView(haworth(5)));
    expect(order(p)[order(p).length - 1]).toBe(0);
    expect(p[1].x).toBeGreaterThan(p[2].x);
    expect(p[1].x).toBeGreaterThan(0);
    expect(p[0].y).toBeGreaterThan(Math.max(...p.slice(1).map((q) => q.y)));
  });

  it("draws the groups exactly vertical on the page - the projection of the normal - up above the atom and down below it", () => {
    const view = standardView(haworth(6));
    for (const { free, seen: d } of seenFree(haworth(6), view)) {
      expect(d.x).toBe(0);
      expect(Math.sign(d.y)).toBe(free.face);
      close(Math.abs(d.y), Math.cos((HAWORTH_ELEVATION_DEG * Math.PI) / 180), 9);
    }
  });
});

describe("the Newman pair's view", () => {
  it("is along the line of sight: both atoms at the centre, the front one nearer", () => {
    const n = newman("staggered");
    const p = seen(n, standardView(n));
    expect(p.map((q) => [q.x, q.y])).toEqual([[0, 0], [0, 0]]);
    expect(p[0].z).toBeGreaterThan(p[1].z);
  });

  it("shows the front atom's bonds from the centre at 90, 210 and 330 degrees and the back atom's at 30, 150 and 270", () => {
    const n = newman("staggered");
    const pages = (atom: number) =>
      seenFree(n, standardView(n))
        .filter((f) => f.free.at === atom)
        .map((f) => Math.round((((Math.atan2(f.seen.y, f.seen.x) * 180) / Math.PI) % 360) + 360) % 360);
    expect(pages(0)).toEqual([90, 210, 330]);
    expect(pages(1)).toEqual([30, 150, 270]);
  });

  it("projects a point by the rows, depth nearer larger", () => {
    const v = standardView(newman("eclipsed"));
    expect(project(v, [1, 2, 3])).toEqual({ x: 1, y: 2, z: 3 });
  });
});
