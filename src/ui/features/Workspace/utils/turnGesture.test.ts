import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FREE_BLEND_S } from "./angleSpring";
import { turnBegun, turnCancelled, turnDropped, turnFrame, turnFreed, turnMoved, turnWanted } from "./turnGesture";

const deg = (d: number) => (d * Math.PI) / 180;
const FRAME = 1000 / 60;

/** Frames at 60 a second from `at` (ms), the pointer held at `pointed`; the states after each. */
function frames(g: ReturnType<typeof turnBegun>, pointed: number, reference: number, count: number, at: number) {
  const out: { g: typeof g; onItsWay: boolean; at: number }[] = [];
  let now = at;
  for (let i = 0; i < count; i++) {
    now += FRAME;
    const next = turnFrame(g, pointed, reference, now);
    g = next.gesture;
    out.push({ g, onItsWay: next.onItsWay, at: now });
  }
  return { g, out, at: now };
}

describe("a turn's frames", () => {
  it("spring from where it began to the step, with a bounce, and stop asking for frames at rest", () => {
    const g = turnMoved(turnBegun(0), 0);
    const r = frames(g, deg(38), 0, 240, 0);
    // (heading for 45 degrees: on its way at first, then there)
    expect(r.out[0].g.shown).toBeGreaterThan(0);
    expect(r.out[0].g.shown).toBeLessThan(deg(45));
    expect(r.out[0].onItsWay).toBe(true);
    expect(Math.max(...r.out.map((f) => f.g.shown))).toBeGreaterThan(deg(45));
    const last = r.out[r.out.length - 1];
    expect(last.onItsWay).toBe(false);
    expect(last.g.shown).toBe(deg(45));
    // (the first frame to rest is the last of its way)
    const at = r.out.findIndex((f) => !f.onItsWay);
    expect(r.out.slice(at).every((f) => f.g.shown === deg(45))).toBe(true);
  });

  it("go the way the steps are measured from: the drawing's own direction", () => {
    const g = turnMoved(turnBegun(0), 0);
    const r = frames(g, deg(8), deg(37), 240, 0);
    // (a bond at 37 degrees turned by 8 ends at 45: a turn of 8)
    expect(r.g.shown).toBeCloseTo(deg(8));
    const q = frames(g, deg(20), deg(37), 240, 0);
    // (and by 20, at 60: a turn of 23)
    expect(q.g.shown).toBeCloseTo(deg(23));
  });

  it("let go of the steps ease from where they are to the pointer's angle, in FREE_BLEND_S, and reach it", () => {
    let g = turnMoved(turnBegun(0), 0);
    const settled = frames(g, deg(38), 0, 240, 0);
    g = turnFreed(settled.g);
    expect(turnWanted(g, deg(38), 0)).toBe(deg(38));
    const r = frames(g, deg(38), 0, 30, settled.at);
    // (out: the first frames cover most of the way; never a step back)
    const shown = r.out.map((f) => f.g.shown);
    expect(shown[0]).toBeLessThan(deg(45));
    expect(shown[0]).toBeGreaterThan(deg(38));
    for (let i = 1; i < shown.length; i++) expect(shown[i]).toBeLessThanOrEqual(shown[i - 1] + 1e-12);
    const done = r.out.findIndex((f) => !f.onItsWay);
    expect(done + 1).toBeLessThanOrEqual(Math.ceil((FREE_BLEND_S * 1000) / FRAME) + 1);
    expect(shown[done]).toBeCloseTo(deg(38));
    // (and follows the pointer's own from then on)
    const more = frames(r.g, deg(31), 0, 3, r.at);
    expect(more.out[0].g.shown).toBeLessThanOrEqual(deg(38));
  });

  it("keep a long frame to what a spring takes: a stalled one moves it no more than 50 ms of frames", () => {
    const g = turnMoved(turnBegun(0), 0);
    const slow = turnFrame(g, deg(45), 0, 10_000).gesture;
    const long = turnFrame(g, deg(45), 0, 50).gesture;
    expect(slow.shown).toBe(long.shown);
    expect(Number.isFinite(slow.shown)).toBe(true);
  });
});

describe("a turn's drop", () => {
  it("is the step it is heading to, whatever the spring has shown by then", () => {
    let g = turnMoved(turnBegun(0), 0);
    g = frames(g, deg(38), 0, 3, 0).g;
    expect(Math.abs(g.shown - deg(45))).toBeGreaterThan(deg(1));
    expect(turnDropped(g, deg(38), 0)).toBeCloseTo(deg(45));
    // (the pointer's own once let go of the steps)
    expect(turnDropped(turnFreed(g), deg(38), 0)).toBe(deg(38));
    // (from a bond's direction)
    expect(turnDropped(g, deg(8), deg(37))).toBeCloseTo(deg(8));
  });

  it("is nothing for a press that never moved", () => {
    expect(turnDropped(turnBegun(0), deg(38), 0)).toBeNull();
  });

  it("is nothing once Escape has let the turn go, whatever comes after", () => {
    let g = turnMoved(turnBegun(0), 0);
    g = frames(g, deg(38), 0, 10, 0).g;
    g = turnCancelled(g);
    expect(turnDropped(g, deg(38), 0)).toBeNull();
    // (a pause, or another move, after it brings nothing back)
    expect(turnDropped(turnFreed(turnMoved(g, 99)), deg(52), 0)).toBeNull();
  });
});

describe("the gesture's state", () => {
  it("starts its clock at the first move, not at the press", () => {
    const g = turnBegun(100);
    const m = turnMoved(g, 900);
    expect(m.before).toBe(900);
    expect(m.moved).toBe(true);
    // (the next moves leave it)
    expect(turnMoved(m, 1200).before).toBe(900);
    expect(g.moved).toBe(false);
  });
});

describe("Selection2D", () => {
  const source = readFileSync(join(process.cwd(), "src/ui/features/Workspace/components/Selection2D.tsx"), "utf8");

  it("lets Escape cancel the turn and the button's coming up lay only what the gesture drops", () => {
    expect(source).toMatch(/g = turnCancelled\(g\);/);
    expect(source).toMatch(/const drop = turnDropped\(g, pointed\(\), reference\);\s*if \(drop != null\) lay\(drop\);/);
  });
});
