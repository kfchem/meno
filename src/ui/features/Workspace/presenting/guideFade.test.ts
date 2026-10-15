import { describe, expect, it } from "vitest";
import { FADE_IN_MS, FADE_OUT_MS, GuideFade, SHOW_AFTER_MS } from "./guideFade";
import { guided, type Box } from "./guides";

const line = (x: number) => ({ lines: [{ x1: x, y1: 0, x2: x, y2: 10 }], marks: [] });
const level = (f: GuideFade, now: number, m: ReturnType<typeof line> | null) => f.update(now, m).drawn[0]?.level ?? 0;

describe("guides coming and going", () => {
  it("shows one only after it has lasted a moment, and then fades it in over its time", () => {
    const f = new GuideFade();
    expect(level(f, 0, line(5))).toBe(0);
    expect(level(f, SHOW_AFTER_MS - 1, line(5))).toBe(0);
    // (shown from here: its fade begun)
    f.update(SHOW_AFTER_MS, line(5));
    const half = level(f, SHOW_AFTER_MS + FADE_IN_MS / 2, line(5));
    expect(half).toBeGreaterThan(0.3);
    expect(half).toBeLessThan(0.7);
    expect(level(f, SHOW_AFTER_MS + FADE_IN_MS + 10, line(5))).toBe(1);
  });

  it("never shows an alignment passed in less than that, however fast a drag goes", () => {
    const f = new GuideFade();
    let seen = 0;
    // (a line there for 60 ms, gone for 60 ms, there again for 60: never one of them long enough)
    for (let t = 0; t <= 400; t += 10) {
      const on = t % 120 < 60;
      seen = Math.max(seen, level(f, t, on ? line(5) : null));
    }
    expect(seen).toBe(0);
  });

  it("fades out over its time, and is let go", () => {
    const f = new GuideFade();
    for (let t = 0; t <= 300; t += 10) f.update(t, line(5));
    expect(level(f, 300, line(5))).toBe(1);
    f.update(310, null);
    const mid = level(f, 310 + FADE_OUT_MS / 2, null);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
    f.update(310 + FADE_OUT_MS + 20, null);
    expect(f.idle).toBe(true);
  });

  it("moves to a new line by gliding there, not by going out and coming again", () => {
    const f = new GuideFade();
    for (let t = 0; t <= 300; t += 10) f.update(t, line(5));
    const xs: number[] = [];
    for (let t = 310; t <= 600; t += 10) {
      const d = f.update(t, line(8)).drawn[0];
      expect(d.level).toBe(1);
      xs.push(d.seg.x1);
    }
    expect(xs[0]).toBeGreaterThan(5);
    expect(xs[0]).toBeLessThan(8);
    for (let k = 1; k < xs.length; k++) expect(xs[k]).toBeGreaterThanOrEqual(xs[k - 1]);
    expect(xs[xs.length - 1]).toBeGreaterThan(7.95);
  });
});

describe("a guide's snap, taken and let go", () => {
  const moving: Box = { x0: 0, y0: 0, x1: 2, y1: 2 };
  const other: Box = { x0: 10, y0: 20, x1: 12, y1: 22 };

  it("holds to a longer distance than takes it: no flicker at the edge", () => {
    // (taken within 1; held within 2): at 1.5 away it is not taken, but once taken it is held
    const away = 10 - 2 - 1.5;
    expect(guided(moving, away, 0, [other], 1).lines).toHaveLength(0);
    expect(guided(moving, away, 0, [other], 1, undefined, { x: 2 }).lines.length).toBeGreaterThan(0);
  });

  it("extends a line a little past the objects it joins", () => {
    const g = guided(moving, 8, 18, [other], 1);
    const l = g.lines.find((s) => s.x1 === s.x2)!;
    expect(Math.min(l.y1, l.y2)).toBeLessThan(18);
    expect(Math.max(l.y1, l.y2)).toBeGreaterThan(22);
  });
});
