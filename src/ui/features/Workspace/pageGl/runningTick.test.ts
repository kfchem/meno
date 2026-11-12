import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dashAdvance, RUNNING_FRAME_MS, runningTick } from "./runningTick";

describe("a running mark's frames", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("never has more than one asked for", () => {
    const tick = runningTick();
    const invalidate = vi.fn();
    for (let i = 0; i < 100; i++) tick.ask(invalidate);
    expect(vi.getTimerCount()).toBe(1);
    expect(invalidate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(RUNNING_FRAME_MS);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("asks once in each RUNNING_FRAME_MS, however often it is asked to", () => {
    const tick = runningTick();
    const invalidate = vi.fn();
    // (a display frame every 1/60 s, for a second, each asking again)
    for (let ms = 0; ms < 1000; ms += 1000 / 60) {
      tick.ask(invalidate);
      vi.advanceTimersByTime(1000 / 60);
    }
    // (about thirty a second: the claim, not the constant)
    expect(RUNNING_FRAME_MS).toBe(33);
    expect(invalidate.mock.calls.length).toBeGreaterThanOrEqual(25);
    expect(invalidate.mock.calls.length).toBeLessThanOrEqual(31);
  });

  it("asks no frame after it is stopped, and none is left waiting", () => {
    const tick = runningTick();
    const invalidate = vi.fn();
    tick.ask(invalidate);
    tick.stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10 * RUNNING_FRAME_MS);
    expect(invalidate).not.toHaveBeenCalled();
    // (and asks again after being stopped)
    tick.ask(invalidate);
    vi.advanceTimersByTime(RUNNING_FRAME_MS);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});

describe("a wire's dashes", () => {
  const along = (frames: number, dt: number, zoom = 1.5) => {
    let offset = 0;
    for (let i = 0; i < frames; i++) offset = dashAdvance(offset, dt, 12, zoom, 6, 4);
    return offset;
  };
  it("stand at the same place after the same time, in frames of 1/60 s or of 1/30 s", () => {
    // (a second, the period 10 / zoom apart: the same place round it)
    expect(along(60, 1 / 60)).toBeCloseTo(along(30, 1 / 30), 9);
    expect(along(10, 1 / 60)).toBeCloseTo(along(5, 1 / 30), 9);
  });
  it("go as far in a unit's time at half the zoom as at twice it, in the ratio of the zooms", () => {
    expect(dashAdvance(0, 0.1, 12, 1, 600, 400)).toBeCloseTo(2 * dashAdvance(0, 0.1, 12, 2, 600, 400), 9);
    expect(dashAdvance(0, 0.1, 12, 1, 600, 400)).toBeCloseTo(1.2, 9);
  });
  it("go round the length of a dash and a gap, not of a dash: a place between the two is reached", () => {
    // (a period of 10 at zoom 1: after 7.5 of travel they stand at 7.5, past a dash's 6; after 10, round to 0)
    expect(dashAdvance(0, 0.1, 75, 1, 6, 4)).toBeCloseTo(7.5, 9);
    expect(dashAdvance(7.5, 0.1, 25, 1, 6, 4)).toBeCloseTo(0, 9);
    expect(dashAdvance(0, 0.1, 99, 2, 6, 4)).toBeCloseTo(4.95, 9);
  });
  it("never go past one dash and gap, nor leap on a stalled page", () => {
    expect(along(1000, 1 / 30, 2)).toBeLessThan(10 / 2);
    expect(dashAdvance(0, 5, 12, 1, 6, 4)).toBeCloseTo((0.1 * 12) % 10);
  });
});
