import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_FPS, onIdleClock } from "./idleClock";

/** The screen's frames, by hand: each `frame(ms)` runs what waits for the next one at `ms`. */
let waiting: Map<number, FrameRequestCallback>;
let next = 1;
function frame(ms: number) {
  const now = [...waiting];
  waiting = new Map();
  for (const [, f] of now) f(ms);
}

describe("the clock a style card's samples turn by", () => {
  beforeEach(() => {
    waiting = new Map();
    vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => {
      waiting.set(next, f);
      return next++;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => void waiting.delete(id));
    vi.spyOn(performance, "now").mockReturnValue(0);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("steps on every other frame at 60 Hz and every fourth at 120: evenly, by the time gone", () => {
    expect(IDLE_FPS).toBe(30);
    for (const [hz, every] of [
      [60, 2],
      [120, 4],
    ] as const) {
      vi.spyOn(performance, "now").mockReturnValue(0);
      const steps: [number, number][] = [];
      const stop = onIdleClock((d) => steps.push([at, d]));
      let at = 0;
      for (let k = 1; k <= 12 * every; k++) frame((at = (k * 1000) / hz));
      stop();
      expect(steps.length).toBe(12);
      // (each on a whole frame, the same count of frames apart, and stepped by the time since the last)
      steps.forEach(([ms, d], i) => {
        expect(ms).toBeCloseTo(((i + 1) * every * 1000) / hz, 6);
        expect(d).toBeCloseTo(every / hz, 6);
      });
    }
  });

  it("steps every sample in the same frame, and stops asking for frames once none is left", () => {
    const a: number[] = [];
    const b: number[] = [];
    const stopA = onIdleClock((d) => a.push(d));
    const stopB = onIdleClock((d) => b.push(d));
    for (let k = 1; k <= 8; k++) frame((k * 1000) / 60);
    expect(a.length).toBe(4);
    expect(b).toEqual(a);
    stopA();
    frame(9 * (1000 / 60));
    frame(10 * (1000 / 60));
    expect([a.length, b.length]).toEqual([4, 5]);
    stopB();
    expect(waiting.size).toBe(0);
  });
});
