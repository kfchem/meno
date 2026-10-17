import { describe, expect, it } from "vitest";
import { angleOn, branchPath, cycleArrows, cycleMembers, cycleMirrored, cycleTurned, inkDistance, MARGIN, ontoCycle, type Cycle, type CycleBox, type CycleInk } from "./cycle";
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
    // (a box 1.2 wide across the top, no ink known: clear of it and of the margin, about 1.1 either side of its middle)
    for (const side of [m[0].lo, m[0].hi]) {
      expect(side * c.r).toBeGreaterThan(1.0);
      expect(side * c.r).toBeLessThan(1.25);
    }
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
    const going = members.map((m, i) => (i === 1 ? { ...m, lo: m.lo / 2, hi: m.hi / 2, passing: true as const } : m));
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

describe("where the circle breaks for what is on it", () => {
  const at = (a: number) => ({ x: 4 * Math.cos(a), y: 4 * Math.sin(a) });
  /** How far each end of the stretches either side of a thing lies from its ink. */
  const endsFrom = (members: ReturnType<typeof cycleMembers>, ink: CycleInk) => {
    const [m] = members;
    return [at(m.angle - m.lo), at(m.angle + m.hi)].map((p) => {
      let d = Infinity;
      for (const l of ink.lines) {
        const vx = l.b.x - l.a.x, vy = l.b.y - l.a.y;
        const t = Math.max(0, Math.min(1, ((p.x - l.a.x) * vx + (p.y - l.a.y) * vy) / (vx * vx + vy * vy)));
        d = Math.min(d, Math.hypot(p.x - l.a.x - vx * t, p.y - l.a.y - vy * t) - l.half);
      }
      for (const b of ink.boxes) d = Math.min(d, Math.hypot(Math.max(b.x0 - p.x, 0, p.x - b.x1), Math.max(b.y0 - p.y, 0, p.y - b.y1)));
      return d;
    });
  };

  it("is cut at the ink on each side, not at the box: a box mostly empty where the circle passes, as round B(OH)2", () => {
    // (a box three wide across the top, its ink a ring at its right end, the circle through it, and letters at its far left)
    const b = box(0, 4, 3, 1.2);
    const ink: CycleInk = { lines: [{ a: { x: 0.6, y: 3.9 }, b: { x: 1.4, y: 3.7 }, half: 0.03 }], boxes: [{ x0: -1.5, y0: 4.3, x1: -1.1, y1: 4.6 }] };
    const boxed = cycleMembers(c, [b], BOND)[0];
    const [m] = cycleMembers(c, [b], BOND, [ink]);
    // (the end on the right a quarter of a bond, or a step more, from the ring it points at; on the left, where it comes nearest the letters - half a bond, it passing under them)
    const [right, left] = endsFrom([m], ink);
    expect(right).toBeGreaterThan(MARGIN - 0.02);
    expect(right).toBeLessThan(MARGIN + 0.12);
    expect(left).toBeGreaterThan(0.4);
    expect(left).toBeLessThan(0.6);
    // (nearer than the box allowed, on both sides)
    expect(m.lo).toBeLessThan(boxed.lo);
    expect(m.hi).toBeLessThan(boxed.hi);
  });

  it("runs on to the ends of a long chain lying along it", () => {
    const pts = Array.from({ length: 9 }, (_, i) => at(Math.PI / 2 - 0.6 + (1.2 * i) / 8));
    const ink: CycleInk = { lines: pts.slice(1).map((p, i) => ({ a: pts[i], b: p, half: 0.03 })), boxes: [] };
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const b = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    const [m] = cycleMembers(c, [b], BOND, [ink]);
    for (const side of [m.lo, m.hi]) {
      expect(side).toBeGreaterThan(0.6);
      expect(side).toBeLessThan(0.6 + (MARGIN + 0.15) / 4);
    }
  });

  it("is cut round words a margin out from their letters", () => {
    const b = box(0, 4, 2, 0.5);
    const [m] = cycleMembers(c, [b], BOND, [{ lines: [], boxes: [b] }]);
    for (const d of endsFrom([m], { lines: [], boxes: [b] })) expect(Math.abs(d - MARGIN)).toBeLessThan(0.12);
  });
});

describe("how far a cycle's arrows stop short", () => {
  const b = box(0, 4, 2, 0.5);
  const words = [{ lines: [], boxes: [b] }];
  const from = (m: ReturnType<typeof cycleMembers>[number]) =>
    [m.angle - m.lo, m.angle + m.hi].map((a) => inkDistance({ x: 4 * Math.cos(a), y: 4 * Math.sin(a) }, words[0]));

  it("is half a bond, unless the cycle says otherwise", () => {
    expect(MARGIN).toBe(0.5);
    for (const d of from(cycleMembers(c, [b], BOND, words)[0])) expect(Math.abs(d - 0.5)).toBeLessThan(0.12);
    for (const d of from(cycleMembers({ ...c, gap: 1 }, [b], BOND, words)[0])) expect(Math.abs(d - 1)).toBeLessThan(0.12);
  });

  it("is an end's own where it is set by hand, the other end the cycle's", () => {
    const [m] = cycleMembers(c, [b], BOND, words, [{ lo: 1.5 }]);
    const [lo, hi] = from(m);
    expect(Math.abs(lo - 1.5)).toBeLessThan(0.12);
    expect(Math.abs(hi - 0.5)).toBeLessThan(0.12);
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

describe("a cycle caught changing", () => {
  const three = [box(0, 4), box(4 * Math.cos(-Math.PI / 6), 4 * Math.sin(-Math.PI / 6)), box(-4 * Math.cos(-Math.PI / 6), 4 * Math.sin(-Math.PI / 6))];
  const headsOf = (arrows: ReturnType<typeof cycleArrows>) => arrows.filter((a) => a.heads !== 0);
  const tipOf = (a: ReturnType<typeof cycleArrows>[number]) => last(ends(a));

  it("turning round, has each stretch's head travel along it, smallest half way, the way it went and then the way it goes", () => {
    const turned = { ...c, ccw: true as const };
    const done = cycleArrows(turned, three, BOND);
    const before = cycleArrows(c, three, BOND);
    const start = cycleArrows(turned, three, BOND, undefined, { turn: 0 });
    const early = cycleArrows(turned, three, BOND, undefined, { turn: 0.25 });
    const late = cycleArrows(turned, three, BOND, undefined, { turn: 0.75 });
    // (just turned, as it was: its heads where they were)
    const at = (xs: ReturnType<typeof cycleArrows>) => headsOf(xs).map((a) => deg(tipOf(a))).sort((p, q) => p - q);
    at(start).forEach((d, i) => expect(d).toBeCloseTo(at(before)[i], 5));
    // (on the way: as many heads, smaller, between where they were and where they go)
    for (const xs of [early, late]) {
      expect(headsOf(xs)).toHaveLength(3);
      for (const a of headsOf(xs)) {
        expect(a.headScale).toBeGreaterThan(0.4);
        expect(a.headScale).toBeLessThan(0.6);
      }
    }
    // (the same circle drawn all the way: as long in all, at every point of the turn)
    const total = (xs: ReturnType<typeof cycleArrows>) => xs.reduce((n, a) => n + ends(a).slice(1).reduce((m, p, i) => m + Math.hypot(p.x - ends(a)[i].x, p.y - ends(a)[i].y), 0), 0);
    expect(total(early)).toBeCloseTo(total(done), 3);
    expect(total(late)).toBeCloseTo(total(done), 3);
    expect(done.every((a) => a.headScale === undefined)).toBe(true);
  });

  it("turning round, swings an arrow coming in from the one side to the other, joining where it did", () => {
    const b = { at: Math.PI / 2, way: "in" as const };
    const half = cycleArrows({ ...c, ccw: true, branches: [b] }, [], BOND, undefined, { turn: 0.5 });
    const branch = last(half);
    const pts = ends(branch);
    // (half way round: straight out from where it joins)
    expect(last(pts).x).toBeCloseTo(0, 5);
    expect(last(pts).y).toBeCloseTo(4, 5);
    expect(Math.abs(pts[0].x)).toBeLessThan(1e-6);
  });

  it("grows an arrow going out from the circle, and one coming in from its far end", () => {
    const out = { at: Math.PI / 2, way: "out" as const };
    const into = { at: Math.PI / 2, way: "in" as const };
    const full = branchPath(c, out, BOND);
    const [grown] = cycleArrows({ ...c, branches: [out] }, [], BOND, undefined, { branches: [{ b: out, grown: 0.5 }] }).slice(-1);
    expect(ends(grown)[0].x).toBeCloseTo(full.points[0].x, 5);
    expect(Math.hypot(tipOf(grown).x - full.end.x, tipOf(grown).y - full.end.y)).toBeGreaterThan(0.5);
    expect(grown.headScale).toBeCloseTo(0.5);
    const [coming] = cycleArrows({ ...c, branches: [into] }, [], BOND, undefined, { branches: [{ b: into, grown: 0.5 }] }).slice(-1);
    const fullIn = branchPath(c, into, BOND);
    expect(ends(coming)[0].x).toBeCloseTo(fullIn.end.x, 5);
    expect(Math.hypot(tipOf(coming).x, tipOf(coming).y - 4)).toBeGreaterThan(0.5);
    // (gone: not drawn)
    expect(cycleArrows({ ...c, branches: [] }, [], BOND, undefined, { branches: [{ b: out, grown: 0 }] })).toHaveLength(2);
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

describe("a cycle carried round or turned over", () => {
  const withArrows: Cycle = { id: 1, x: 2, y: 0, r: 1, branches: [{ at: Math.PI / 2, way: "in" }] };
  it("carried round, has its middle and its arrows' joins turned as far", () => {
    const t = cycleTurned(withArrows, { x: 0, y: 0 }, Math.PI / 2);
    expect(t.x).toBeCloseTo(0);
    expect(t.y).toBeCloseTo(2);
    expect(t.branches![0].at).toBeCloseTo(Math.PI);
  });

  it("turned over, goes the other way, its middle and its arrows' joins mirrored", () => {
    const m = cycleMirrored(withArrows, { x: 0, y: 0 }, "horizontal");
    expect([m.x, m.y]).toEqual([2, 0]);
    expect(m.ccw).toBe(true);
    expect(m.branches![0].at).toBeCloseTo((3 * Math.PI) / 2);
    expect(cycleMirrored({ ...withArrows, ccw: true }, { x: 0, y: 0 }, "vertical").ccw).toBeUndefined();
  });
});
