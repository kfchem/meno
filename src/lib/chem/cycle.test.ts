import { describe, expect, it } from "vitest";
import { angleOn, branchPath, cycleArrows, cycleMembers, ontoCycle, type Cycle, type CycleBox } from "./cycle";
import { arrowPath, arrowPieces, type ArrowMeasures } from "./reactionArrow";

const BOND = 1;
const last = <T,>(xs: readonly T[], k = 1): T => xs[xs.length - k];
const box = (x: number, y: number, w = 1.2, h = 0.6): CycleBox => ({ x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 });
const c: Cycle = { id: 1, x: 0, y: 0, r: 4 };
/** The angle (degrees, anticlockwise from the right) a point lies at round the cycle's middle. */
const deg = (p: { x: number; y: number }) => (Math.atan2(p.y, p.x) * 180) / Math.PI;
const ends = (a: { x: number; y: number; angle: number; length: number; corners?: readonly { along: number; across: number }[] }) => {
  const from = { x: a.x - (Math.cos(a.angle) * a.length) / 2, y: a.y - (Math.sin(a.angle) * a.length) / 2 };
  const to = { x: a.x + (Math.cos(a.angle) * a.length) / 2, y: a.y + (Math.sin(a.angle) * a.length) / 2 };
  return arrowPath(from, to, a.corners ?? []);
};

describe("what is on a cycle", () => {
  it("is what has its middle on the line, each at its angle, the circle clear of it either side", () => {
    const boxes = [box(0, 4), box(4, 0.3), box(0, 0), box(-6, 0)];
    const m = cycleMembers(c, boxes, BOND);
    expect(m.map((x) => x.index)).toEqual([0, 1]);
    expect((m[0].angle * 180) / Math.PI).toBeCloseTo(90);
    // (a box 1.2 wide across the top: clear of it and of the margin, about 0.9 either side of its middle)
    expect(m[0].half * c.r).toBeGreaterThan(0.85);
    expect(m[0].half * c.r).toBeLessThan(1.05);
  });

  it("is put on the line when let go near it: moved straight out from the middle", () => {
    const d = ontoCycle(c, box(0, 4.4));
    expect(d.x).toBeCloseTo(0);
    expect(d.y).toBeCloseTo(-0.4);
  });
});

describe("a cycle's arrows", () => {
  it("are the stretches between neighbours, clockwise, each from the one before to the next", () => {
    // (three on it: at the top, lower right and lower left)
    const boxes = [box(0, 4), box(4 * Math.cos(-Math.PI / 6), 4 * Math.sin(-Math.PI / 6)), box(-4 * Math.cos(-Math.PI / 6), 4 * Math.sin(-Math.PI / 6))];
    const arrows = cycleArrows(c, boxes, BOND);
    expect(arrows).toHaveLength(3);
    for (const a of arrows) {
      const pts = ends(a);
      // (on the circle all along)
      for (const p of pts) expect(Math.hypot(p.x, p.y)).toBeCloseTo(4, 5);
      // (clockwise: the angle falls along it)
      const a0 = deg(pts[0]);
      const a1 = deg(pts[1]);
      expect(((a0 - a1 + 360) % 360) < 180).toBe(true);
      expect(a.heads).toBeUndefined();
    }
    // (the one from the top runs down the right to the lower right)
    const top = arrows.find((a) => Math.abs(deg(ends(a)[0]) - 90) < 20)!;
    expect(deg(last(ends(top)))).toBeGreaterThan(-30);
    expect(deg(last(ends(top)))).toBeLessThan(10);
  });

  it("go the other way, turned", () => {
    const arrows = cycleArrows({ ...c, ccw: true }, [box(0, 4), box(0, -4)], BOND);
    for (const a of arrows) {
      const pts = ends(a);
      expect(((deg(pts[1]) - deg(pts[0]) + 360) % 360) < 180).toBe(true);
    }
  });

  it("are the circle whole, in two halves with no heads, with nothing on it", () => {
    const arrows = cycleArrows(c, [], BOND);
    expect(arrows).toHaveLength(2);
    expect(arrows.every((a) => a.heads === 0)).toBe(true);
  });

  it("run on with no head through one going off the line, the circle closing after it", () => {
    const members = cycleMembers(c, [box(0, 4), box(0, -4)], BOND);
    const going = members.map((m, i) => (i === 1 ? { ...m, half: m.half / 2, passing: true as const } : m));
    const arrows = cycleArrows(c, [], BOND, going);
    expect(arrows).toHaveLength(2);
    // (the one to it has no head; the one from it on to the next has)
    const toIt = arrows.find((a) => deg(last(ends(a))) < -60 && deg(last(ends(a))) > -120)!;
    expect(toIt.heads).toBe(0);
    expect(arrows.filter((a) => a.heads === undefined)).toHaveLength(1);
  });

  it("go on round from one thing alone back to it", () => {
    const arrows = cycleArrows(c, [box(0, 4)], BOND);
    expect(arrows).toHaveLength(1);
    const pts = ends(arrows[0]);
    expect(Math.hypot(pts[0].x - last(pts).x, pts[0].y - last(pts).y)).toBeLessThan(2.5);
  });
});

describe("an arrow coming in or going out", () => {
  const way = { x: 1, y: 0 }; // (clockwise at the top: rightwards)
  it("comes in from outside and joins the circle along its way, with no head of its own", () => {
    const b = branchPath(c, { at: Math.PI / 2, way: "in" }, BOND);
    const [p, q] = [last(b.points, 2), last(b.points)];
    expect(q.x).toBeCloseTo(0);
    expect(q.y).toBeCloseTo(4);
    const u = { x: q.x - p.x, y: q.y - p.y };
    const l = Math.hypot(u.x, u.y);
    // (its last step along the circle's way, as it joins it)
    expect((u.x * way.x + u.y * way.y) / l).toBeGreaterThan(0.97);
    // (from outside the circle)
    expect(Math.hypot(b.end.x, b.end.y)).toBeGreaterThan(4.5);
    const arrows = cycleArrows({ ...c, branches: [{ at: Math.PI / 2, way: "in" }] }, [], BOND);
    expect(last(arrows).heads).toBe(0);
  });

  it("goes out along the cycle's way from where it leaves, curving out, its head at its far end", () => {
    const b = branchPath(c, { at: Math.PI / 2, way: "out" }, BOND);
    const [p, q] = [b.points[0], b.points[1]];
    const u = { x: q.x - p.x, y: q.y - p.y };
    expect((u.x * way.x + u.y * way.y) / Math.hypot(u.x, u.y)).toBeGreaterThan(0.97);
    expect(Math.hypot(b.end.x, b.end.y)).toBeGreaterThan(4.5);
    const arrows = cycleArrows({ ...c, branches: [{ at: Math.PI / 2, way: "out" }] }, [], BOND);
    expect(last(arrows).heads).toBeUndefined();
  });

  it("is put where the menu was asked for on the line", () => {
    expect(angleOn(c, { x: 0, y: 4.2 }, 0.5)).toBeCloseTo(Math.PI / 2);
    expect(angleOn(c, { x: 0, y: 2 }, 0.5)).toBeNull();
  });
});

describe("an arrow with no head", () => {
  it("is its line alone", () => {
    const m: ArrowMeasures = { thickness: 0.1, headLength: 0.5, headWidth: 0.4, inset: 0, round: false };
    const plain = arrowPieces({ x: 0, y: 0 }, { x: 4, y: 0 }, { heads: 0 }, m);
    expect(plain).toHaveLength(1);
    // (no point beyond the line's half width: no head)
    expect(Math.max(...plain[0].map((p) => Math.abs(p.y)))).toBeCloseTo(0.05);
    expect(Math.max(...plain[0].map((p) => p.x))).toBeCloseTo(4);
  });
});
