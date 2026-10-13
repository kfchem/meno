import { describe, expect, it } from "vitest";
import { bendThrough, controlOf, curveAt, endBase, pointAt, pushMeasures, pushOutlines, pushShape, pushStroke, type PushEndAt, type PushScene, type PushShape } from "./pushArrow";
import { ACS_1996 } from "./style";

const L = 1;
const m = pushMeasures(ACS_1996, L);
type P = { x: number; y: number };
const bare = (x: number, y: number, pair = false, bonds: P[] = []): PushEndAt => ({ atom: { x, y }, clear: () => 0.2, pair, bonds });
const empty: PushScene = { segments: [], boxes: [], atoms: [] };
const pts = (s: PushShape, n = 64) => Array.from({ length: n + 1 }, (_, i) => pointAt(s, i / n));
const cross = (a: P, b: P, c: P, d: P) => {
  const o = (p: P, q: P, r: P) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};
/** How far the curve stands off the line between its ends, at most. */
const rise = (s: PushShape) => {
  const dx = s.end.x - s.start.x;
  const dy = s.end.y - s.start.y;
  const l = Math.hypot(dx, dy);
  return Math.max(...pts(s).map((p) => Math.abs((p.x - s.start.x) * dy - (p.y - s.start.y) * dx) / l));
};
/** The turns between its steps, signed. */
const turns = (s: PushShape) => {
  const q = pts(s);
  return q.slice(2).map((p, i) => {
    const a = { x: q[i + 1].x - q[i].x, y: q[i + 1].y - q[i].y };
    const b = { x: p.x - q[i + 1].x, y: p.y - q[i + 1].y };
    return Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y);
  });
};

describe("an electron-pushing arrow Meno lays", () => {
  it("comes onto an atom straight from behind a bond it loses, as in an SN2", () => {
    // HO- to the left of a carbon whose bond to Br, on its right, another arrow breaks
    const c: PushEndAt = { atom: { x: 0, y: 0 }, clear: () => 0.12, bonds: [{ x: 1, y: 0 }], losing: [{ x: 1, y: 0 }] };
    const scene: PushScene = { segments: [[{ x: 0, y: 0 }, { x: 1, y: 0 }]], boxes: [], atoms: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: -2, y: 0 }] };
    const s = pushShape(bare(-2, 0, true), c, undefined, scene, m)!;
    expect(s.end.x).toBeLessThan(0);
    const heading = Math.atan2(s.end.y - s.c2.y, s.end.x - s.c2.x);
    expect(Math.abs(heading)).toBeLessThan((25 * Math.PI) / 180);
  });

  it("turns in toward behind without a corner, where the attack comes from beyond the bond lost", () => {
    // HO- beyond the Br: the arrow comes round, its tightest bend no tighter than a curl's
    const c: PushEndAt = { atom: { x: 0, y: 0 }, clear: () => 0.12, bonds: [{ x: 1, y: 0 }], losing: [{ x: 1, y: 0 }] };
    const scene: PushScene = { segments: [[{ x: 0, y: 0 }, { x: 1, y: 0 }]], boxes: [], atoms: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 3.2, y: 0 }] };
    const s = pushShape(bare(3.2, 0, true), c, undefined, scene, m)!;
    const q = pts(s);
    const tightest = Math.min(
      ...turns(s).map((t, i) => (Math.abs(t) > 1e-6 ? Math.hypot(q[i + 1].x - q[i].x, q[i + 1].y - q[i].y) / Math.abs(t) : Infinity)),
    );
    expect(tightest).toBeGreaterThan(0.15);
    expect(s.end.x).toBeLessThan(0);
  });

  it("is a curve, never a line, and bends one way only", () => {
    const s = pushShape(bare(0, 0, true), bare(2.5, 0), undefined, empty, m)!;
    expect(rise(s)).toBeGreaterThan(0.15);
    const t = turns(s);
    const left = t.filter((a) => a > 0).reduce((x, a) => x + a, 0);
    const right = -t.filter((a) => a < 0).reduce((x, a) => x + a, 0);
    expect(Math.min(left, right)).toBeLessThan((8 * Math.PI) / 180);
  });

  it("goes round a bond in its way rather than across it", () => {
    const wall: [P, P] = [{ x: 1.25, y: -0.6 }, { x: 1.25, y: 0.6 }];
    const scene: PushScene = { segments: [wall], boxes: [], atoms: [wall[0], wall[1]] };
    const s = pushShape(bare(0, 0, true), bare(2.5, 0), undefined, scene, m)!;
    const q = pts(s);
    expect(q.slice(1).some((p, i) => cross(q[i], p, wall[0], wall[1]))).toBe(false);
  });

  it("from a bond to its own atom, is a round curl from beside the middle of the bond as drawn, clear of its lines", () => {
    // a C=O, O on the right, its line drawn short of the O's label; the lines reach 0.11 either side
    const bond: PushEndAt = { bond: [{ x: 0, y: 0 }, { x: 1, y: 0 }], middle: { x: 0.4, y: 0 }, reach: { left: 0.11, right: 0.11 } };
    const o: PushEndAt = { atom: { x: 1, y: 0 }, clear: () => 0.25, bonds: [{ x: -1, y: 0 }] };
    const s = pushShape(bond, o, undefined, empty, m)!;
    expect(s.start.x).toBeCloseTo(0.4, 6);
    expect(Math.abs(s.start.y)).toBeGreaterThan(0.11 + 0.05);
    expect(rise(s)).toBeGreaterThan(0.15);
    // (round: no corner in it)
    expect(Math.max(...turns(s).map(Math.abs))).toBeLessThan((14 * Math.PI) / 180);
    expect(endBase(bond)).toEqual({ x: 0.4, y: 0 });
  });

  it("starts beyond a lone pair's two dots, and ends short of an atom", () => {
    const shape = pushShape(bare(0, 0, true), bare(2, 0), undefined, empty, m)!;
    expect(shape.dots).toHaveLength(2);
    const d0 = Math.hypot(shape.dots[0].c.x, shape.dots[0].c.y);
    expect(d0).toBeGreaterThan(0.2);
    expect(Math.hypot(shape.start.x, shape.start.y)).toBeGreaterThan(d0);
    expect(Math.hypot(shape.end.x - 2, shape.end.y)).toBeGreaterThan(0.2);
    expect(pushShape(bare(0, 0), bare(2, 0), undefined, empty, m)!.dots).toHaveLength(0);
  });

  it("puts a lone pair beside its atom, not where its bonds go", () => {
    const shape = pushShape(bare(0, 0, true, [{ x: -1, y: 0 }]), bare(2, -1), undefined, empty, m)!;
    for (const d of shape.dots) expect(Math.atan2(d.c.y, d.c.x)).not.toBeCloseTo(Math.PI, 1);
    const u = Math.atan2(shape.start.y, shape.start.x);
    expect(Math.abs(Math.abs(u) - Math.PI)).toBeGreaterThan((55 * Math.PI) / 180);
  });

  it("ends at a gap's middle, where a bond forms", () => {
    const gap: PushEndAt = { gap: [{ x: 2, y: 0 }, { x: 3, y: 0 }] };
    const end = pushShape(bare(0, 0), gap, undefined, empty, m)!.end;
    expect(end.x).toBeCloseTo(2.5, 9);
    expect(end.y).toBeCloseTo(0, 9);
  });

  it("is none from a place to itself", () => {
    expect(pushShape(bare(1, 1), bare(1, 1), undefined, empty, m)).toBeNull();
  });
});

describe("an electron-pushing arrow bent by hand", () => {
  it("goes through the point its middle is dragged to, wherever its ends are", () => {
    const s = { x: 1, y: 2 };
    const e = { x: 4, y: -1 };
    const p = { x: 3, y: 2 };
    const c = controlOf(s, e, bendThrough(s, e, p));
    const at = curveAt(s, c, e, 0.5);
    expect(at.x).toBeCloseTo(p.x, 9);
    expect(at.y).toBeCloseTo(p.y, 9);
  });

  it("keeps its bend as the structure is turned", () => {
    const b = { along: 0.4, out: 0.5 };
    const turn = (p: P) => ({ x: -p.y, y: p.x });
    const s = { x: 0, y: 0 };
    const e = { x: 2, y: 1 };
    const c = controlOf(s, e, b);
    const c2 = controlOf(turn(s), turn(e), b);
    expect(c2.x).toBeCloseTo(turn(c).x, 9);
    expect(c2.y).toBeCloseTo(turn(c).y, 9);
  });

  it("leaves a bond from beside it on the side it is bent to", () => {
    const bond: PushEndAt = { bond: [{ x: 0, y: 0 }, { x: 1, y: 0 }], reach: { left: 0.1, right: 0.1 } };
    const up = pushShape(bond, bare(3, 0), { along: 0.5, out: 0.5 }, empty, m)!;
    expect(up.start.y).toBeGreaterThan(0.1);
    const down = pushShape(bond, bare(3, 0), { along: 0.5, out: -0.5 }, empty, m)!;
    expect(down.start.y).toBeLessThan(-0.1);
  });
});

describe("an electron-pushing arrow's outlines", () => {
  const shape = pushShape(bare(0, 0), bare(3, 0), { along: 0.5, out: 0.5 }, empty, m)!;

  it("are its line and its barbed head, the head's point at the end", () => {
    const [line, head] = pushOutlines(shape, false, m);
    expect(line.length).toBeGreaterThan(20);
    expect(head).toHaveLength(4);
    expect(head[0]).toEqual(shape.end);
  });

  it("put a fishhook's one barb on the outside of the curve", () => {
    const [, half] = pushOutlines(shape, true, m);
    // (bent up, the curve bulges up: its one barb is above the line it ends on)
    expect(half[1].y).toBeGreaterThan(shape.end.y);
  });
});

describe("an electron-pushing arrow as a picture writes it", () => {
  const shape = pushShape(bare(0, 0), bare(3, 0), { along: 0.5, out: 0.5 }, empty, m)!;

  it("is the curve itself up to its head, then straight on into the head", () => {
    const { curve, head } = pushStroke(shape, false, m);
    expect(curve).toHaveLength(7);
    expect(curve[0]).toEqual(shape.start);
    // (its first segment the arrow's own curve: a point of it on the curve)
    const mid = (() => {
      const [a, b, c, d] = curve.slice(0, 4);
      const u = 0.5;
      const k = [(1 - u) ** 3, 3 * (1 - u) ** 2 * u, 3 * (1 - u) * u * u, u ** 3];
      return { x: k[0] * a.x + k[1] * b.x + k[2] * c.x + k[3] * d.x, y: k[0] * a.y + k[1] * b.y + k[2] * c.y + k[3] * d.y };
    })();
    const near = Math.min(...Array.from({ length: 401 }, (_, i) => pointAt(shape, i / 400)).map((p) => Math.hypot(p.x - mid.x, p.y - mid.y)));
    expect(near).toBeLessThan(0.01);
    expect(head[0]).toEqual(shape.end);
  });

  it("turns from the curve into the head with no corner: the last run leaves the curve its way and comes into the head the head's way", () => {
    const { curve, head } = pushStroke(shape, false, m);
    const [, , c2, at, k1, k2, end] = curve;
    const cross = (a: { x: number; y: number }, b: { x: number; y: number }) => (a.x * b.y - a.y * b.x) / (Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y));
    // (the curve's way where it gives way, and the run's as it begins: one)
    expect(Math.abs(cross({ x: at.x - c2.x, y: at.y - c2.y }, { x: k1.x - at.x, y: k1.y - at.y }))).toBeLessThan(1e-9);
    // (the run's way as it ends, and the head's - from its back's middle to its point: one)
    const back = { x: (head[1].x + head[3].x) / 2, y: (head[1].y + head[3].y) / 2 };
    expect(Math.abs(cross({ x: end.x - k2.x, y: end.y - k2.y }, { x: head[0].x - back.x, y: head[0].y - back.y }))).toBeLessThan(1e-9);
  });

  it("is drawn on the canvas the same way: no turn in its outline's line sharper than the curve's own", () => {
    const [line] = pushOutlines(shape, false, m);
    // (its left side, point to point: each turn small)
    const left = line.slice(0, line.length / 2);
    let worst = 0;
    for (let i = 1; i + 1 < left.length; i++) {
      const a = { x: left[i].x - left[i - 1].x, y: left[i].y - left[i - 1].y };
      const b = { x: left[i + 1].x - left[i].x, y: left[i + 1].y - left[i].y };
      if (Math.hypot(a.x, a.y) < 1e-9 || Math.hypot(b.x, b.y) < 1e-9) continue;
      worst = Math.max(worst, Math.abs(Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y)));
    }
    // (the curve itself turns about 0.02-0.04 a step; the corner there was 0.08)
    expect(worst).toBeLessThan(0.05);
  });
});
