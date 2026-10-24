import { describe, expect, it } from "vitest";
import { BETWEEN, WIRE_LANE, wireLanes } from "./look";

// (a wire's corners in page units: out level, a run down at `x`, then across and in level)
const down = (x: number, from: { x: number; y: number }, to: { x: number; y: number }) => [from, { x, y: from.y }, { x, y: to.y }, to];
const xOfRun = (c: { x: number; y: number }[]) => c[1].x;

describe("wires moved into lanes", () => {
  it("two wires running down one way: a lane each, a lane apart, about where they ran - their ends where they were", () => {
    const a = down(10, { x: 0, y: 10 }, { x: 20, y: -10 });
    const b = down(10, { x: 0, y: 8 }, { x: 20, y: -12 });
    const [na, nb] = wireLanes([a, b], []);
    expect(Math.abs(xOfRun(na) - xOfRun(nb))).toBeCloseTo(WIRE_LANE, 9);
    expect((xOfRun(na) + xOfRun(nb)) / 2).toBeCloseTo(10, 9);
    expect([na[0], na[3], nb[0], nb[3]]).toEqual([a[0], a[3], b[0], b[3]]);
    // (each still runs straight down, and out and in level)
    expect(na[1].x).toBe(na[2].x);
    expect([na[1].y, na[2].y]).toEqual([a[1].y, a[2].y]);
  });

  it("orders the lanes so that the wires do not cross: one turning off to a side the nearer it, the later it turns in, or the sooner out", () => {
    // (both in from the left and out to the right: a in higher and out sooner - b in lower and out later)
    const a = down(10, { x: 0, y: 10 }, { x: 20, y: -6 });
    const b = down(10, { x: 0, y: 6 }, { x: 20, y: -10 });
    const [na, nb] = wireLanes([a, b], []);
    // (b in lower from the left: on the left; a out sooner to the right: on the right - and so neither crosses the other)
    expect(xOfRun(nb)).toBeLessThan(xOfRun(na));
    // (given the other way round, the same lanes)
    const [nb2, na2] = wireLanes([b, a], []);
    expect([xOfRun(na2), xOfRun(nb2)]).toEqual([xOfRun(na), xOfRun(nb)]);
  });

  it("where the wires must cross either way - one inside the other - orders them as given", () => {
    const a = down(10, { x: 0, y: 10 }, { x: 20, y: -10 });
    const b = down(10, { x: 0, y: 6 }, { x: 20, y: -6 });
    const [na, nb] = wireLanes([a, b], []);
    expect(xOfRun(na)).toBeLessThan(xOfRun(nb));
  });

  it("one turning out sooner than another turning the other way: on the side it turns to - and so neither crosses the other", () => {
    // (a in from the left at the top and out to the right low down; b in from the left too, but out to the left, sooner)
    const a = down(10, { x: 0, y: 10 }, { x: 20, y: -10 });
    const b = [{ x: 0, y: 8 }, { x: 10, y: 8 }, { x: 10, y: -4 }, { x: -6, y: -4 }];
    const [na, nb] = wireLanes([a, b], []);
    expect(nb[1].x).toBeLessThan(na[1].x);
  });

  it("never moves a wire's run into its end: another takes a lane beside it", () => {
    // (a leaves at y 0 for 30 across before it turns; b's run across lies a third of a lane above it, from 5 to 25)
    const y = WIRE_LANE / 3;
    const a = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: -20 }, { x: 40, y: -20 }];
    const b = [{ x: -10, y: 20 }, { x: 5, y: 20 }, { x: 5, y }, { x: 25, y }, { x: 25, y: 30 }, { x: 35, y: 30 }];
    const [na, nb] = wireLanes([a, b], []);
    expect(na).toEqual(a);
    expect(nb[2].y).toBeCloseTo(WIRE_LANE, 9);
    expect(nb[3].y).toBeCloseTo(WIRE_LANE, 9);
  });

  it("leaves wires apart as they are, and runs along different stretches", () => {
    const a = down(10, { x: 0, y: 10 }, { x: 20, y: 5 });
    const b = down(10, { x: 0, y: -5 }, { x: 20, y: -10 });
    const c = down(10 + 2 * WIRE_LANE, { x: 0, y: 10 }, { x: 30, y: -10 });
    expect(wireLanes([a, b, c], [])).toEqual([a, b, c]);
  });

  it("keeps half a bond from a frame beside the way: no room, no lanes", () => {
    const a = down(10, { x: 0, y: 10 }, { x: 20, y: -10 });
    const b = down(10, { x: 0, y: 8 }, { x: 20, y: -12 });
    // (frames either side of the run, each half a bond off it)
    const left = { x0: 5 - BETWEEN, x1: 10 - BETWEEN, y0: -5, y1: 5 };
    const right = { x0: 10 + BETWEEN, x1: 15 + BETWEEN, y0: -5, y1: 5 };
    expect(wireLanes([a, b], [left, right])).toEqual([a, b]);
    // (one frame on the left: both moved to the right of where they ran, the nearer still half a bond off it)
    const [na, nb] = wireLanes([a, b], [left]);
    expect(Math.min(xOfRun(na), xOfRun(nb))).toBeCloseTo(10, 9);
    expect(Math.max(xOfRun(na), xOfRun(nb))).toBeCloseTo(10 + WIRE_LANE, 9);
  });

  it("three in one way across: three lanes, the middle one where they ran", () => {
    const across = (y: number, from: { x: number; y: number }, to: { x: number; y: number }) => [from, { x: from.x + 2, y: from.y }, { x: from.x + 2, y }, { x: to.x - 2, y }, { x: to.x - 2, y: to.y }, to];
    const ws = [across(0, { x: 0, y: 10 }, { x: 40, y: 12 }), across(0, { x: 1, y: 14 }, { x: 41, y: 16 }), across(0, { x: 2, y: 18 }, { x: 42, y: 20 })];
    const ys = wireLanes(ws, []).map((c) => c[2].y).sort((a, b) => a - b);
    expect(ys[1]).toBeCloseTo(0, 9);
    expect(ys[2] - ys[1]).toBeCloseTo(WIRE_LANE, 9);
    expect(ys[1] - ys[0]).toBeCloseTo(WIRE_LANE, 9);
  });
});
