import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AWAKE_AFTER_MS, LET_GO_MS, workersAwake } from "./awake";

describe("the computer kept awake while a worker works", () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it("holds once a question has gone unanswered a while, and lets go a moment after it is answered", async () => {
    const told: boolean[] = [];
    const w = workersAwake((h) => told.push(h)).watch();
    expect([AWAKE_AFTER_MS, LET_GO_MS]).toEqual([10_000, 3_000]);
    w.sent(1);
    await vi.advanceTimersByTimeAsync(AWAKE_AFTER_MS - 1);
    expect(told).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(told).toEqual([true]);
    // (a long step: held, and told once)
    await vi.advanceTimersByTimeAsync(AWAKE_AFTER_MS * 10);
    expect(told).toEqual([true]);
    w.settled(1);
    await vi.advanceTimersByTimeAsync(LET_GO_MS - 1);
    expect(told).toEqual([true]);
    await vi.advanceTimersByTimeAsync(1);
    expect(told).toEqual([true, false]);
  });

  it("holds nothing for quick questions, however many", async () => {
    const told: boolean[] = [];
    const w = workersAwake((h) => told.push(h)).watch();
    for (let id = 1; id <= 50; id++) {
      w.sent(id);
      await vi.advanceTimersByTimeAsync(AWAKE_AFTER_MS / 4);
      w.settled(id);
    }
    await vi.advanceTimersByTimeAsync(AWAKE_AFTER_MS * 2);
    expect(told).toEqual([]);
  });

  it("is held once for several workers at work, and let go after the last; asked again before it lets go, it stays held", async () => {
    const told: boolean[] = [];
    const all = workersAwake((h) => told.push(h));
    const [a, b] = [all.watch(), all.watch()];
    a.sent(1);
    b.sent(1);
    await vi.advanceTimersByTimeAsync(AWAKE_AFTER_MS);
    expect(told).toEqual([true]);
    a.settled(1);
    await vi.advanceTimersByTimeAsync(LET_GO_MS * 2);
    expect(told).toEqual([true]);
    b.settled(1);
    // (a step asked in rounds: the next round asked before it lets go, and held as long again)
    await vi.advanceTimersByTimeAsync(LET_GO_MS - 1);
    b.sent(2);
    await vi.advanceTimersByTimeAsync(AWAKE_AFTER_MS);
    b.settled(2);
    await vi.advanceTimersByTimeAsync(LET_GO_MS);
    expect(told).toEqual([true, false]);
  });

  it("lets go as its one question is given up on, as one answered", async () => {
    const told: boolean[] = [];
    const w = workersAwake((h) => told.push(h)).watch();
    w.sent(1);
    await vi.advanceTimersByTimeAsync(AWAKE_AFTER_MS);
    expect(told).toEqual([true]);
    w.overdue(1);
    await vi.advanceTimersByTimeAsync(LET_GO_MS);
    expect(told).toEqual([true, false]);
  });

  it("lets go of what a worker held as it goes, a question given up on as one answered", async () => {
    const told: boolean[] = [];
    const all = workersAwake((h) => told.push(h));
    const w = all.watch();
    w.sent(1);
    w.sent(2);
    await vi.advanceTimersByTimeAsync(AWAKE_AFTER_MS);
    w.overdue(1);
    await vi.advanceTimersByTimeAsync(LET_GO_MS);
    expect(told).toEqual([true]);
    w.end();
    await vi.advanceTimersByTimeAsync(LET_GO_MS);
    expect(told).toEqual([true, false]);
    // (gone before it held: nothing told)
    const quick = all.watch();
    quick.sent(1);
    quick.end();
    await vi.advanceTimersByTimeAsync(AWAKE_AFTER_MS * 2);
    expect(told).toEqual([true, false]);
  });
});
