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

describe("what makes the window busy", () => {
  /** A target that keeps the listeners it is given, by event, for the test to call. */
  function target() {
    const heard = new Map<string, ((e: unknown) => void)[]>();
    return {
      heard,
      addEventListener: (type: string, f: (e: unknown) => void) => void heard.set(type, [...(heard.get(type) ?? []), f]),
    };
  }
  /** A fresh copy of the module (it keeps what it has heard of), its clock the test's. */
  async function fresh() {
    vi.resetModules();
    vi.useFakeTimers();
    return import("./calm");
  }

  it("listens for the wheel, a press, a touch moved and a pointer moved - once, however many times it is asked", async () => {
    const calm = await fresh();
    try {
      const t = target();
      calm.watchInput(t as unknown as Window);
      calm.watchInput(t as unknown as Window);
      expect([...t.heard.keys()].sort()).toEqual(["pointerdown", "pointermove", "touchmove", "wheel"]);
      for (const fs of t.heard.values()) expect(fs).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is busy for CALM_MS after each of the wheel, a press and a touch moved, and calm again after", async () => {
    const calm = await fresh();
    try {
      const t = target();
      calm.watchInput(t as unknown as Window);
      for (const type of ["wheel", "pointerdown", "touchmove"]) {
        expect(calm.isCalm(), `before ${type}`).toBe(true);
        t.heard.get(type)![0]({});
        expect(calm.isCalm(), type).toBe(false);
        vi.advanceTimersByTime(calm.CALM_MS + 1);
        expect(calm.isCalm(), `after ${type}`).toBe(true);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("is busy by a pointer moved only with a button down - a drag, a pan - and not by one moved over the page", async () => {
    const calm = await fresh();
    try {
      const t = target();
      calm.watchInput(t as unknown as Window);
      const move = t.heard.get("pointermove")![0];
      move({ buttons: 0 });
      expect(calm.isCalm()).toBe(true);
      move({ buttons: 1 });
      expect(calm.isCalm()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("hears it in the capture phase, passively, so that nothing stopping an event hides it", async () => {
    const calm = await fresh();
    try {
      const options: unknown[] = [];
      calm.watchInput({ addEventListener: (_t: string, _f: unknown, o: unknown) => void options.push(o) } as unknown as Window);
      expect(options).toHaveLength(4);
      for (const o of options) expect(o).toEqual({ capture: true, passive: true });
    } finally {
      vi.useRealTimers();
    }
  });
});
