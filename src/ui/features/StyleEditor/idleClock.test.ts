import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_FPS, idleClockWhileSeen, onIdleClock } from "./idleClock";

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

  it("runs only while a sample on it is seen: none seen, no frame asked for - and it starts again as one is", () => {
    const a: number[] = [];
    const b: number[] = [];
    const slotA = idleClockWhileSeen((d) => a.push(d));
    const slotB = idleClockWhileSeen((d) => b.push(d));
    expect(waiting.size).toBe(0);
    slotA.seen(true);
    slotB.seen(true);
    for (let k = 1; k <= 4; k++) frame((k * 1000) / 60);
    expect([a.length, b.length]).toEqual([2, 2]);
    // (one out of sight: the other on alone)
    slotA.seen(false);
    for (let k = 5; k <= 8; k++) frame((k * 1000) / 60);
    expect([a.length, b.length]).toEqual([2, 4]);
    // (none seen - the window behind another, or both scrolled away: the clock gone)
    slotB.seen(false);
    expect(waiting.size).toBe(0);
    // (seen again, and said so twice: on the clock once)
    slotA.seen(true);
    slotA.seen(true);
    expect(waiting.size).toBe(1);
    for (let k = 9; k <= 12; k++) frame((k * 1000) / 60);
    expect([a.length, b.length]).toEqual([4, 4]);
    slotA.stop();
    slotB.stop();
    expect(waiting.size).toBe(0);
  });
});
