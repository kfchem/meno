import { describe, expect, it, vi } from "vitest";

// (the PDF reader, as the app has it: nothing on the page; one page whose reading fails)
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: async (_cmd: string, args: { page: number }) => {
    if (args.page === 9) throw new Error("the PDF reader is gone");
    return new ArrayBuffer(0);
  },
}));
// (idle time that never comes on its own)
const waiting: (() => void)[] = [];
vi.mock("../core/idle", () => ({ whenIdle: (work: () => void) => void waiting.push(work) }));

const { figuresHad } = await import("./figures");
const settle = () => new Promise((done) => setTimeout(done, 0));

describe("a page's figures read ahead of being asked for", () => {
  it("wait for idle time - but asked for meanwhile, a press on one, are worked out at once", async () => {
    const came = vi.fn();
    expect(figuresHad("a", 0, came, { failed: () => {} })).toBeNull();
    await settle();
    expect([came.mock.calls.length, waiting.length]).toEqual([0, 1]);
    // (asked for: hurried, no idle time needed)
    expect(figuresHad("a", 0)).toBeNull();
    await settle();
    expect(came).toHaveBeenCalledTimes(1);
    expect(figuresHad("a", 0)).toEqual([]);
  });

  it("asked for first, are worked out at once, never waiting for idle time", async () => {
    const came = vi.fn();
    const before = waiting.length;
    figuresHad("a", 1, came);
    await settle();
    expect([came.mock.calls.length, waiting.length]).toEqual([1, before]);
  });

  it("say so where the reading failed, so the page can be asked for again", async () => {
    const failed = vi.fn();
    figuresHad("a", 9, () => {}, { failed });
    await settle();
    expect(failed).toHaveBeenCalledTimes(1);
  });
});
