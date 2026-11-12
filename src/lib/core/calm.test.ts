import { describe, expect, it, vi } from "vitest";
import { CALM_MS, calmGate } from "./calm";

/** A clock the test turns: timers fire in order as it advances. */
function clock() {
  let t = 0;
  const timers: { at: number; go: () => void }[] = [];
  return {
    now: () => t,
    later: (go: () => void, ms: number) => void timers.push({ at: t + ms, go }),
    advance(ms: number) {
      const end = t + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const next = timers[0];
        if (!next || next.at > end) break;
        timers.shift();
        t = next.at;
        next.go();
      }
      t = end;
    },
  };
}

describe("background work waits for the hands to rest", () => {
  it("runs after a moment of its own when nothing has been touched, never in the turn it is asked in", () => {
    const c = clock();
    const gate = calmGate(c);
    const work = vi.fn();
    gate.whenCalm(work);
    expect(work).not.toHaveBeenCalled();
    c.advance(0);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("is put off while input keeps coming, and runs CALM_MS after the last of it", () => {
    const c = clock();
    const gate = calmGate(c);
    const work = vi.fn();
    gate.busy();
    gate.whenCalm(work);
    // (a scroll going on: input every 50 ms for a second)
    for (let i = 0; i < 20; i++) {
      c.advance(50);
      gate.busy();
      expect(work).not.toHaveBeenCalled();
    }
    c.advance(CALM_MS - 1);
    expect(work).not.toHaveBeenCalled();
    expect(gate.calm()).toBe(false);
    c.advance(1);
    expect(work).toHaveBeenCalledTimes(1);
    expect(gate.calm()).toBe(true);
  });

  it("is called off by the way given, and runs once only", () => {
    const c = clock();
    const gate = calmGate(c);
    const kept = vi.fn();
    const off = vi.fn();
    gate.whenCalm(kept);
    gate.whenCalm(off)();
    c.advance(1000);
    expect([kept.mock.calls.length, off.mock.calls.length]).toEqual([1, 0]);
  });
});
