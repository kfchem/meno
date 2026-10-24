import { afterEach, describe, expect, it, vi } from "vitest";
import { idle, whenIdle } from "./idle";

const g = globalThis as { requestIdleCallback?: unknown };
const own = g.requestIdleCallback;

describe("work put off until the window is idle", () => {
  afterEach(() => {
    vi.useRealTimers();
    g.requestIdleCallback = own;
  });

  it("waits for the webview's idle callback where it has one, within so long at most", () => {
    const asked: { timeout: number }[] = [];
    let call: (() => void) | null = null;
    g.requestIdleCallback = (f: () => void, o: { timeout: number }) => ((call = f), asked.push(o), 1);
    const done = vi.fn();
    whenIdle(done, 300);
    expect([done.mock.calls.length, asked]).toEqual([0, [{ timeout: 300 }]]);
    call!();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("else a moment after now, past the frame being drawn - never at once", async () => {
    g.requestIdleCallback = undefined;
    vi.useFakeTimers();
    const done = vi.fn();
    whenIdle(done);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(done).toHaveBeenCalledTimes(1);
    const p = idle();
    vi.advanceTimersByTime(100);
    await expect(p).resolves.toBeUndefined();
  });
});
