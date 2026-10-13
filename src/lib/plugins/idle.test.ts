import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_MS, idleWatch } from "./idle";

describe("a worker's idle clock", () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it("is up once the worker has gone 15 minutes unused, counted from the last answer", async () => {
    let up = 0;
    const w = idleWatch(() => (up++, true));
    expect(IDLE_MS).toBe(15 * 60_000);
    w.sent(1);
    await vi.advanceTimersByTimeAsync(IDLE_MS * 2);
    // (a question unanswered holds it, however long)
    expect(up).toBe(0);
    w.settled(1);
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1);
    expect(up).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(up).toBe(1);
    // (stopped: up once)
    await vi.advanceTimersByTimeAsync(IDLE_MS * 3);
    expect(up).toBe(1);
  });

  it("starts again with each line the worker says, and holds while any question is unanswered", async () => {
    let up = 0;
    const w = idleWatch(() => (up++, true), 1000);
    await vi.advanceTimersByTimeAsync(900);
    w.heard();
    await vi.advanceTimersByTimeAsync(900);
    expect(up).toBe(0);
    w.sent(1);
    w.sent(2);
    w.settled(1);
    expect(w.busy()).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(up).toBe(0);
    // (one given up on is no longer waited for)
    w.overdue(2);
    expect(w.busy()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(up).toBe(1);
  });

  it("looks again after as long again where the worker was kept - a job of its plugin running, say", async () => {
    const kept = [true, true, false];
    let asked = 0;
    idleWatch(() => (asked++, !kept.shift()), 1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(asked).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(asked).toBe(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(asked).toBe(3);
    // (stopped the third time)
    await vi.advanceTimersByTimeAsync(5000);
    expect(asked).toBe(3);
  });

  it("is stopped for good once the worker is gone", async () => {
    let up = 0;
    const w = idleWatch(() => (up++, true), 1000);
    w.end();
    w.sent(1);
    w.settled(1);
    w.heard();
    await vi.advanceTimersByTimeAsync(5000);
    expect(up).toBe(0);
  });
});
