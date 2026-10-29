import { describe, expect, it } from "vitest";
import { glidden, type Pose } from "./arrowGlide";
import { arrowPoints } from "../../../../lib/chem/reactionScheme";

const settle = (from: Pose, to: Pose) => {
  const seen: Pose[] = [];
  let p: Pose | null = from;
  for (let i = 0; i < 400 && p; i++) {
    seen.push(p);
    p = glidden(p, to, 1 / 60);
  }
  return { seen, done: p === null };
};

describe("an arrow drawn going over to where its end is put", () => {
  it("goes there in steps, never jumping, and stops there", () => {
    const was: Pose = { x: 0, y: 0, angle: 0, length: 4 };
    const to: Pose = { x: 0.5, y: 0.5, angle: Math.PI / 12, length: 5 };
    const { seen, done } = settle(was, to);
    expect(done).toBe(true);
    expect(seen.length).toBeGreaterThan(5);
    // (each frame a small step of the way)
    for (let i = 1; i < seen.length; i++) {
      const [a, b] = [arrowPoints(seen[i - 1]), arrowPoints(seen[i])];
      for (let k = 0; k < a.length; k++) expect(Math.hypot(a[k].x - b[k].x, a[k].y - b[k].y)).toBeLessThan(0.5);
    }
  });

  it("turns the shorter way round", () => {
    const { seen } = settle({ x: 0, y: 0, angle: Math.PI - 0.1, length: 4 }, { x: 0, y: 0, angle: -Math.PI + 0.1, length: 4 });
    // (through pi, not back through naught)
    for (const p of seen) expect(Math.cos(p.angle)).toBeLessThan(-0.9);
  });

  it("takes a corner made at once, and moves one that was there", () => {
    // (a corner made: taken at once - there already, nothing to go over)
    expect(glidden({ x: 0, y: 0, angle: 0, length: 4 }, { x: 0, y: 0, angle: 0, length: 4, corners: [{ along: 0.5, across: 1 }] }, 1 / 60)).toBeNull();
    const moved = glidden({ x: 0, y: 0, angle: 0, length: 4, corners: [{ along: 0.5, across: 0 }] }, { x: 0, y: 0, angle: 0, length: 4, corners: [{ along: 0.5, across: 2 }] }, 1 / 60);
    expect(moved!.corners![0].across).toBeGreaterThan(0);
    expect(moved!.corners![0].across).toBeLessThan(2);
  });
});
