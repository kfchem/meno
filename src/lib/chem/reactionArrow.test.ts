import { describe, expect, it } from "vitest";
import { arrowMeasures, arrowOutline, arrowPath, arrowPieces, cornerAt, pathLength, squareCorner, strokeOutline, type ArrowMeasures } from "./reactionArrow";
import { ACS_1996, MENO, ofBond, pt, resolveStyle } from "./style";

type P = { x: number; y: number };

/** Twice the outline's area, positive when it runs anticlockwise. */
function area2(outline: P[]): number {
  let a = 0;
  for (let i = 0; i < outline.length; i++) {
    const u = outline[i];
    const v = outline[(i + 1) % outline.length];
    a += u.x * v.y - v.x * u.y;
  }
  return a;
}

/** How far the outline reaches across, below and above, where it crosses `x`. */
function acrossAt(outline: P[], x: number): [number, number] {
  const ys: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    if ((a.x - x) * (b.x - x) > 0 || a.x === b.x) continue;
    ys.push(a.y + ((x - a.x) * (b.y - a.y)) / (b.x - a.x));
  }
  return [Math.min(...ys), Math.max(...ys)];
}

/** Whether `p` is inside the outline (even-odd). */
function inside(outline: P[], p: P): boolean {
  let hit = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i];
    const b = outline[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

// an arrow along +x, from (0, 0) to its point at (10, 0)
const from = { x: 0, y: 0 };
const to = { x: 10, y: 0 };
const plain: ArrowMeasures = { thickness: 0.2, headLength: 2, headWidth: 1.2, inset: 0, round: false };

describe("a reaction arrow's measures", () => {
  it("come from the style, at the drawing's bond length", () => {
    const m = arrowMeasures(ACS_1996, 1.8);
    // 0.6 pt of a 14.4 pt bond, 5 pt and 3.6 pt
    expect(m.thickness).toBeCloseTo((0.6 / 14.4) * 1.8, 9);
    expect(m.headLength).toBeCloseTo((5 / 14.4) * 1.8, 9);
    expect(m.headWidth).toBeCloseTo((3.6 / 14.4) * 1.8, 9);
    expect(m.inset).toBe(0);
    expect(m.round).toBe(false);
    expect(arrowMeasures(MENO, 1.8).round).toBe(true);
  });

  it("take the arrow's own line thickness over the bonds'", () => {
    const style = resolveStyle(ACS_1996, {
      reactionArrowThickness: pt(1.2),
      reactionArrowHeadWidth: ofBond(0.5),
      reactionArrowHeadInset: 0.3,
    });
    const m = arrowMeasures(style, 1.8);
    expect(m.thickness).toBeCloseTo((1.2 / 14.4) * 1.8, 9);
    expect(m.headWidth).toBeCloseTo(0.9, 9);
    expect(m.inset).toBe(0.3);
  });
});

describe("a reaction arrow's outline", () => {
  it("is a line into a triangle, running anticlockwise", () => {
    const o = arrowOutline(from, to, plain);
    expect(area2(o)).toBeGreaterThan(0);
    // the line, as thick as it is
    expect(acrossAt(o, 4)).toEqual([-0.1, 0.1]);
    // the head: as wide as it is at its back, to its point
    const [lo, hi] = acrossAt(o, 8.0001);
    expect(hi).toBeCloseTo(0.6, 3);
    expect(lo).toBeCloseTo(-0.6, 3);
    expect(Math.max(...o.map((p) => p.x))).toBe(10);
    expect(Math.min(...o.map((p) => p.x))).toBe(0);
  });

  it("draws the back of the head in towards its point, by its notch", () => {
    const o = arrowOutline(from, to, { ...plain, inset: 0.5 });
    expect(area2(o)).toBeGreaterThan(0);
    // its back corners are where a triangle's are
    expect(o).toContainEqual({ x: 8, y: 0.6 });
    expect(o).toContainEqual({ x: 8, y: -0.6 });
    // the line runs into the head as far as the drawn-in back, beside it
    const join = 8 + 1 * (1 - 0.1 / 0.6);
    expect(o).toContainEqual({ x: join, y: 0.1 });
    // and just in front of its back, beside the line, there is nothing
    const behind = { x: 8.3, y: 0.3 };
    expect(inside(o, behind)).toBe(false);
    expect(inside(arrowOutline(from, to, plain), behind)).toBe(true);
  });

  it("rounds its tail in a style with round ends", () => {
    const o = arrowOutline(from, to, { ...plain, round: true });
    expect(area2(o)).toBeGreaterThan(0);
    expect(Math.min(...o.map((p) => p.x))).toBeCloseTo(-0.1, 3);
  });

  it("is all head when the arrow is shorter than its head", () => {
    const o = arrowOutline(from, { x: 1, y: 0 }, plain);
    expect(o).toHaveLength(3);
    expect(area2(o)).toBeGreaterThan(0);
    expect(o).toContainEqual({ x: 0, y: 0.6 });
    expect(o).toContainEqual({ x: 1, y: 0 });
    // with a notch, what of the line there is fills it beside the line
    const notched = arrowOutline(from, { x: 1, y: 0 }, { ...plain, inset: 0.25 });
    expect(area2(notched)).toBeGreaterThan(0);
    expect(Math.min(...notched.map((p) => p.x))).toBe(0);
    expect(inside(notched, { x: 0.1, y: 0 })).toBe(true);
    expect(inside(notched, { x: 0.1, y: 0.3 })).toBe(false);
  });

  it("keeps the head no narrower than the line", () => {
    const o = arrowOutline(from, to, { ...plain, thickness: 2, headWidth: 1 });
    const [lo, hi] = acrossAt(o, 8.0001);
    expect(hi).toBeCloseTo(1, 3);
    expect(lo).toBeCloseTo(-1, 3);
  });

  it("points the way it is drawn", () => {
    const o = arrowOutline({ x: 0, y: 0 }, { x: 0, y: -10 }, plain);
    expect(area2(o)).toBeGreaterThan(0);
    expect(Math.min(...o.map((p) => p.y))).toBeCloseTo(-10, 9);
  });

  it("is nothing for an arrow of no length", () => {
    expect(arrowOutline(from, from, plain)).toEqual([]);
  });
});

describe("an arrow's kinds, heads, dashes, weight and corners", () => {
  const xs = (o: P[]) => o.map((p) => p.x);
  const ys = (o: P[]) => o.map((p) => p.y);

  it("draws a reaction arrow, straight, single and solid, as the one outline it was", () => {
    expect(arrowPieces(from, to, {}, plain)).toEqual([arrowOutline(from, to, plain)]);
  });

  it("puts a head at either end where it has two, its line between them", () => {
    const pieces = arrowPieces(from, to, { heads: 2 }, plain);
    const heads = pieces.filter((o) => o.length === 3);
    expect(heads).toHaveLength(2);
    expect(heads.map((o) => Math.min(...xs(o)))).toContain(0);
    expect(heads.map((o) => Math.max(...xs(o)))).toContain(10);
    // (the line stops inside both heads)
    const line = pieces.find((o) => o.length !== 3)!;
    expect(Math.min(...xs(line))).toBeGreaterThan(0);
    expect(Math.max(...xs(line))).toBeLessThan(10);
  });

  it("draws an equilibrium as two lines either side, each with a half head on its outer side, pointing either way", () => {
    const pieces = arrowPieces(from, to, { kind: "equilibrium" }, plain);
    const lines = pieces.filter((o) => o.length === 4);
    const halves = pieces.filter((o) => o.length === 3);
    expect(lines).toHaveLength(2);
    expect(halves).toHaveLength(2);
    // the upper (to the left of the way it points) reaches its point; the lower its tail
    const upper = halves.find((o) => Math.min(...ys(o)) > 0)!;
    const lower = halves.find((o) => Math.max(...ys(o)) < 0)!;
    expect(Math.max(...xs(upper))).toBeCloseTo(10, 9);
    expect(Math.min(...xs(lower))).toBeCloseTo(0, 9);
    // (a half head: outward of its line only)
    expect(Math.max(...ys(upper))).toBeGreaterThan(Math.max(...lines.flatMap(ys)));
    // full heads, as a choice
    expect(arrowPieces(from, to, { kind: "equilibrium", full: true }, plain).filter((o) => o.length === 3)).toHaveLength(2);
  });

  it("draws a retrosynthetic arrow as two lines and an open head spanning them", () => {
    const pieces = arrowPieces(from, to, { kind: "retrosynthetic" }, plain);
    expect(pieces).toHaveLength(3);
    const head = pieces[2];
    expect(Math.max(...xs(head))).toBeGreaterThan(9.9);
    const span = Math.max(...ys(head)) - Math.min(...ys(head));
    const lines = Math.max(...pieces.slice(0, 2).flatMap(ys)) - Math.min(...pieces.slice(0, 2).flatMap(ys));
    expect(span).toBeGreaterThan(lines);
  });

  it("crosses out a reaction that does not go at its middle", () => {
    const pieces = arrowPieces(from, to, { kind: "noReaction" }, plain);
    const cross = pieces.slice(-2);
    for (const o of cross) {
      const mx = (Math.min(...xs(o)) + Math.max(...xs(o))) / 2;
      expect(mx).toBeCloseTo(5, 6);
    }
  });

  it("breaks a dashed line into dashes, its head whole", () => {
    const pieces = arrowPieces(from, to, { dash: true }, plain);
    expect(pieces.length).toBeGreaterThan(4);
    expect(pieces.filter((o) => o.length === 3)).toHaveLength(1);
  });

  it("weighs its line: thin and thick as shares of the regular", () => {
    const wide = (o: P[]) => Math.max(...ys(o)) - Math.min(...ys(o));
    const line = (w: "thin" | "thick") => arrowPieces(from, to, { weight: w }, plain)[0];
    expect(wide(line("thick"))).toBeCloseTo(2 * plain.thickness, 6);
    expect(wide(line("thin"))).toBeCloseTo(0.6 * plain.thickness, 6);
  });

  it("turns at its corners, each a share along it and a distance across it, kept as it moves and grows", () => {
    const corners = [{ along: 0.5, across: 2 }];
    const path = arrowPath(from, to, corners);
    expect(path).toEqual([from, { x: 5, y: 2 }, to]);
    expect(cornerAt(from, to, { x: 5, y: 2 })).toEqual({ along: 0.5, across: 2 });
    // (twice as long, turned a quarter: the corner with it)
    const turned = arrowPath({ x: 0, y: 0 }, { x: 0, y: 20 }, corners);
    expect(turned[1].x).toBeCloseTo(-2, 9);
    expect(turned[1].y).toBeCloseTo(10, 9);
    expect(pathLength(path)).toBeCloseTo(2 * Math.hypot(5, 2), 9);
    // its head along its last stretch
    const pieces = arrowPieces(from, to, { corners }, plain);
    const head = pieces.find((o) => o.length === 3)!;
    expect(head).toContainEqual(to);
    expect(Math.max(...ys(head))).toBeGreaterThan(0);
  });

  it("strokes a line through points as one outline round it, mitred at its corners", () => {
    const o = strokeOutline([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }], 0.2);
    expect(o).toHaveLength(6);
    expect(Math.abs(area2(o)) / 2).toBeCloseTo(0.2 * 8, 6);
  });
});

describe("a corner dragged to a right angle", () => {
  it("lies where the line turns a quarter turn between its neighbours, toward the pointer - an L", () => {
    const p = { x: 0, y: 0 };
    const q = { x: 4, y: 0 };
    for (const pointer of [{ x: 0.3, y: 3 }, { x: 3.5, y: -1 }, { x: 2, y: 0.4 }]) {
      const c = squareCorner(p, q, pointer);
      const dot = (p.x - c.x) * (q.x - c.x) + (p.y - c.y) * (q.y - c.y);
      expect(dot).toBeCloseTo(0, 9);
      // (on the pointer's side, toward it from the middle)
      expect(Math.sign(c.y)).toBe(Math.sign(pointer.y));
    }
    // (the pointer straight above the middle: the L's corner straight above it)
    const top = squareCorner(p, q, { x: 2, y: 5 });
    expect(top.x).toBeCloseTo(2, 9);
    expect(top.y).toBeCloseTo(2, 9);
    // (at the middle itself, no way to say: where the pointer is)
    expect(squareCorner(p, q, { x: 2, y: 0 })).toEqual({ x: 2, y: 0 });
  });
});
