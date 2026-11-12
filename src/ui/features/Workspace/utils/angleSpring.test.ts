import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FREE_BLEND_S, MOVE_SPRING, SNAP_SPRING, easeOutCubic, freedAngle, springAngle, springSettled, wrapPi } from "./angleSpring";
import { turnReference, turnSnapped } from "./selection";

const deg = (d: number) => (d * Math.PI) / 180;

/** The spring run for `seconds` of frames at 60 a second, the angles shown. */
function run(from: number, target: number, seconds: number, spring = SNAP_SPRING) {
  const shown: number[] = [];
  let angle = from;
  let velocity = 0;
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    ({ angle, velocity } = springAngle(angle, velocity, target, 1 / 60, spring));
    shown.push(angle);
  }
  return { shown, angle, velocity };
}

describe("the angle spring, shared by a bond, a moved atom and a turned selection", () => {
  it("settles on the step it heads to, with a little bounce on the way", () => {
    const r = run(0, deg(45), 2);
    expect(springSettled(r.angle, r.velocity, deg(45))).toBe(true);
    expect(Math.max(...r.shown)).toBeGreaterThan(deg(45));
    expect(Math.max(...r.shown)).toBeLessThan(deg(45 + 20));
    // (and is not at the step in the first frames: it is on its way)
    expect(r.shown[0]).toBeGreaterThan(0);
    expect(r.shown[0]).toBeLessThan(deg(45));
    const m = run(0, deg(45), 2, MOVE_SPRING);
    expect(springSettled(m.angle, m.velocity, deg(45))).toBe(true);
  });

  it("goes the shorter way round a turn", () => {
    // from 170 degrees to -170: through 180, not back through 0
    const r = run(deg(170), deg(-170), 0.2);
    expect(Math.max(...r.shown)).toBeGreaterThan(deg(170));
    expect(Math.min(...r.shown)).toBeGreaterThan(deg(100));
    expect(wrapPi(deg(350))).toBeCloseTo(deg(-10));
  });

  it("is settled only with no angle to go and no speed", () => {
    expect(springSettled(deg(45), 0, deg(45))).toBe(true);
    expect(springSettled(deg(45) + 2 * Math.PI, 0, deg(45))).toBe(true);
    expect(springSettled(deg(46), 0, deg(45))).toBe(false);
    expect(springSettled(deg(45), 1, deg(45))).toBe(false);
  });

  it("is the one function in all three: none keeps a spring of its own", () => {
    for (const file of ["ExtendPreview2D.tsx", "MovePreview2D.tsx", "Selection2D.tsx"]) {
      const source = readFileSync(join(process.cwd(), "src/ui/features/Workspace/components", file), "utf8");
      expect(source, file).toContain('utils/angleSpring"');
      // (an angle's own constants: a radius spring, as an atom's moving has, is another)
      expect(source, file).not.toMatch(/const (kA|zA|cA)\b|const k = 800/);
    }
  });
});

describe("letting go of the steps", () => {
  it("eases from the snapped angle to the pointer's, and reaches it", () => {
    const from = deg(45);
    const to = deg(52);
    expect(freedAngle(from, to, 0)).toBeCloseTo(from);
    expect(freedAngle(from, to, 1)).toBeCloseTo(to);
    // (out: past half of the way by half of the time, and never going back)
    expect(freedAngle(from, to, 0.5)).toBeGreaterThan((from + to) / 2);
    let last = from;
    for (let t = 0; t <= 1; t += 0.1) {
      const a = freedAngle(from, to, t);
      expect(a).toBeGreaterThanOrEqual(last - 1e-12);
      last = a;
    }
    // (frames of 1/60 s take FREE_BLEND_S to get there)
    let t = 0;
    let frames = 0;
    while (t < 1) {
      t = Math.min(1, t + 1 / 60 / FREE_BLEND_S);
      frames++;
    }
    expect(frames).toBeLessThanOrEqual(Math.ceil(FREE_BLEND_S * 60) + 1);
    expect(easeOutCubic(1)).toBe(1);
  });

  it("goes the shorter way round to the pointer's angle", () => {
    expect(freedAngle(deg(170), deg(-170), 1)).toBeCloseTo(deg(190));
    expect(freedAngle(deg(170), deg(-170), 0.3)).toBeGreaterThan(deg(170));
  });
});

describe("the drop of a turn", () => {
  it("is the step the spring is heading to, never an angle it is passing through", () => {
    const pointer = deg(38);
    const step = turnSnapped(pointer, false);
    expect(step).toBeCloseTo(deg(45));
    // (a few frames into the spring the shown angle is somewhere else)
    const r = run(0, step, 0.1);
    expect(Math.abs(r.angle - step)).toBeGreaterThan(deg(1));
    // (the drop is the step, whatever frame the button comes up in)
    expect(turnSnapped(pointer, false)).toBe(step);
  });

  it("keeps to the steps of the drawing's own bond: one on the 30 degree grid lands back on it, one off it lands on it", () => {
    const grid = deg(30);
    for (const d of [0, 7, 14, 22, 38, -38, 61]) {
      const turn = turnSnapped(deg(d), false, grid);
      const now = grid + turn;
      expect(Math.round(now / deg(15)) * deg(15)).toBeCloseTo(now);
    }
    // (on the grid, the steps are the turn's own)
    expect(turnSnapped(deg(38), false, grid)).toBeCloseTo(turnSnapped(deg(38), false));
    // (a little off it: the bond ends on a step, the drawing turned a little more or less than the pointer's step)
    const off = deg(37);
    const turn = turnSnapped(deg(8), false, off);
    expect(off + turn).toBeCloseTo(deg(45));
    // (let go of the steps: the pointer's angle as it is)
    expect(turnSnapped(deg(8), true, off)).toBe(deg(8));
  });

  it("measures the steps from the first bond lying wholly in the selection, none where there is none", () => {
    const model = {
      atoms: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 1, y: 0 },
        { id: 3, x: 1 + Math.cos(deg(37)), y: Math.sin(deg(37)) },
      ],
      bonds: [
        { a: 1, b: 2 },
        { a: 2, b: 3 },
      ],
    };
    expect(turnReference(model, new Set([1, 2, 3]))).toBeCloseTo(0);
    expect(turnReference(model, new Set([2, 3]))).toBeCloseTo(deg(37));
    expect(turnReference(model, new Set([1, 3]))).toBe(0);
    expect(turnReference(model, new Set())).toBe(0);
  });
});
