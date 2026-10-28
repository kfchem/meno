import { describe, expect, it, vi } from "vitest";

// (idle time at once; a page's letters and figures that fail to read, every time)
vi.mock("../../../../lib/core/idle", () => ({ whenIdle: (work: () => void) => work() }));
const asked: string[] = [];
vi.mock("../../../../lib/pdf/text", () => ({
  textHad: (sha: string, page: number, _came: unknown, failed: () => void) => (asked.push(`text ${sha}:${page}`), failed(), null),
}));
vi.mock("../../../../lib/pdf/figures", () => ({
  figuresHad: (sha: string, page: number, _came: unknown, ahead: { failed: () => void }) => (asked.push(`figures ${sha}:${page}`), ahead.failed(), null),
}));

const { readForgotten, readWhenIdle } = await import("./pageReads");

describe("the column's pages read ahead", () => {
  it("are asked for once each - again where the reading failed, three times at most, then not till their PDF is shown again", () => {
    for (let i = 0; i < 6; i++) readWhenIdle("a", 0);
    // (three tries, its letters and its figures each a try: counted once)
    expect(asked.filter((x) => x === "text a:0")).toHaveLength(3);
    expect(asked.filter((x) => x === "figures a:0")).toHaveLength(3);
    readForgotten("a");
    readWhenIdle("a", 0);
    expect(asked.filter((x) => x === "text a:0")).toHaveLength(4);
  });
});
