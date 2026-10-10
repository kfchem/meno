import { describe, expect, it } from "vitest";
import { bendThrough, controlOf, curveAt, defaultBend, endBase, pushMeasures, pushOutlines, pushShape, type PushEndAt } from "./pushArrow";
import { ACS_1996 } from "./style";

const L = 1;
const m = pushMeasures(ACS_1996, L);
const bare = (x: number, y: number, pair = false): PushEndAt => ({ atom: { x, y }, clear: () => 0.2, pair });
const side = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);

describe("an electron-pushing arrow's curve", () => {
  it("bends away from the atoms around it, a third of the way off its line", () => {
    const from = bare(0, 0);
    const to = bare(2, 0);
    const below = defaultBend(from, to, [{ x: 1, y: -1 }], L);
    const c = controlOf({ x: 0, y: 0 }, { x: 2, y: 0 }, below);
    expect(c.y).toBeGreaterThan(0);
    const top = curveAt({ x: 0, y: 0 }, c, { x: 2, y: 0 }, 0.5);
    expect(top.y).toBeCloseTo(0.36 * 2, 6);
    const above = defaultBend(from, to, [{ x: 1, y: 1 }], L);
    expect(controlOf({ x: 0, y: 0 }, { x: 2, y: 0 }, above).y).toBeLessThan(0);
  });

  it("stands off no less than nearly half a bond, however short", () => {
    const b = defaultBend(bare(0, 0), bare(0.4, 0), [], L);
    const c = controlOf({ x: 0, y: 0 }, { x: 0.4, y: 0 }, b);
    expect(curveAt({ x: 0, y: 0 }, c, { x: 0.4, y: 0 }, 0.5).y).toBeCloseTo(0.45, 6);
  });

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
    const turn = (p: { x: number; y: number }) => ({ x: -p.y, y: p.x });
    const s = { x: 0, y: 0 };
    const e = { x: 2, y: 1 };
    const c = controlOf(s, e, b);
    const c2 = controlOf(turn(s), turn(e), b);
    expect(c2.x).toBeCloseTo(turn(c).x, 9);
    expect(c2.y).toBeCloseTo(turn(c).y, 9);
  });

  it("starts beyond a lone pair's two dots, and ends short of an atom", () => {
    const shape = pushShape(bare(0, 0, true), bare(2, 0), undefined, [{ x: 1, y: -1 }], m)!;
    expect(shape.dots).toHaveLength(2);
    const d0 = Math.hypot(shape.dots[0].c.x, shape.dots[0].c.y);
    expect(d0).toBeGreaterThan(0.2);
    expect(Math.hypot(shape.start.x, shape.start.y)).toBeGreaterThan(d0);
    expect(Math.hypot(shape.end.x - 2, shape.end.y)).toBeGreaterThan(0.2);
    expect(pushShape(bare(0, 0), bare(2, 0), undefined, [], m)!.dots).toHaveLength(0);
  });

  it("leaves a bond, and comes to one, a little off its line on the side it comes from", () => {
    const bond: PushEndAt = { bond: [{ x: 0, y: 0 }, { x: 1, y: 0 }] };
    const shape = pushShape(bond, bare(3, 0), undefined, [{ x: 1.5, y: -1 }], m)!;
    expect(endBase(bond)).toEqual({ x: 0.5, y: 0 });
    expect(shape.start.y).toBeGreaterThan(0);
    expect(Math.sign(side(shape.start, { x: 0, y: 0 }, { x: 1, y: 0 }))).toBe(Math.sign(side(shape.control, { x: 0, y: 0 }, { x: 1, y: 0 })));
  });

  it("ends at a gap's middle, where a bond forms", () => {
    const gap: PushEndAt = { gap: [{ x: 2, y: 0 }, { x: 3, y: 0 }] };
    expect(pushShape(bare(0, 0), gap, undefined, [], m)!.end).toEqual({ x: 2.5, y: 0 });
  });

  it("is none from a place to itself", () => {
    expect(pushShape(bare(1, 1), bare(1, 1), undefined, [], m)).toBeNull();
  });
});

describe("an electron-pushing arrow's outlines", () => {
  const shape = pushShape(bare(0, 0), bare(3, 0), undefined, [{ x: 1.5, y: -1 }], m)!;

  it("are its line and its head, the head's point at the end", () => {
    const [line, head] = pushOutlines(shape, false, m);
    expect(line.length).toBeGreaterThan(20);
    expect(head).toHaveLength(3);
    expect(head[0]).toEqual(shape.end);
  });

  it("put a fishhook's one barb on the outside of the curve", () => {
    const [, full] = pushOutlines(shape, false, m);
    const [, half] = pushOutlines(shape, true, m);
    const c = shape.control;
    const mid = { x: (shape.start.x + shape.end.x) / 2, y: (shape.start.y + shape.end.y) / 2 };
    const barb = half[1];
    // (on the side the curve bulges to, which the full head reaches either way)
    expect(Math.sign(side(barb, shape.end, mid) )).not.toBe(0);
    expect((barb.x - shape.end.x) * (c.x - mid.x) + (barb.y - shape.end.y) * (c.y - mid.y)).toBeGreaterThan(0);
    expect(full).toHaveLength(3);
  });
});
