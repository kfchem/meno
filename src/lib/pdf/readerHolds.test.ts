import { describe, expect, it, vi } from "vitest";

/** The reader's commands stood in for: each PDF's hold answered when the test says, each part drawn never (only asked). */
const holds = new Map<number, () => void>();
const invoke = vi.fn((cmd: string, args: unknown) => {
  if (cmd === "pdf_hold_bytes") {
    const first = (args as Uint8Array)[0];
    return new Promise((resolve) => holds.set(first, () => resolve({ sha256: `${first}`.repeat(64).slice(0, 64), size: 1, pages: [[600, 800]] })));
  }
  return new Promise(() => {});
});
vi.mock("@tauri-apps/api/core", () => ({ invoke: (cmd: string, args: unknown) => invoke(cmd, args), isTauri: () => true }));
// (a hold that goes wrong after all, unlooked for: marking C's PDF as had throws)
vi.mock("../doc/notHad", async (actual) => ({
  ...(await actual<typeof import("../doc/notHad")>()),
  markHad: (sha256: string) => {
    if (sha256.startsWith("c")) throw new Error("not marked");
  },
}));

import { drawPart, holdPdfsOf } from "./reader";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("a workspace's PDFs, held one after another as it opens", () => {
  it("settles a draw of a PDF whose hold went wrong, rather than leaving it waiting", async () => {
    const c = "c".repeat(64);
    holdPdfsOf({ files: [{ sha256: c, media: "application/pdf" }], data: () => new Uint8Array([3]) });
    const drawn = drawPart({ sha256: c, page: 0, scale: 1 }).then(
      () => "drawn",
      () => "refused",
    );
    holds.get(3)!();
    const settled = await Promise.race([drawn, flush().then(() => "waiting")]);
    expect(settled).toBe("refused");
    expect(invoke.mock.calls.some(([cmd]) => cmd === "pdf_render")).toBe(false);
  });

  it("draws the pictures of a PDF held as soon as it is held, not after those of a PDF still being taken in", async () => {
    // (two PDFs a workspace keeps: A, taken in slowly, and B; A's pictures asked first - more than are drawn at once - then B's)
    const [a, b] = ["a".repeat(64), "b".repeat(64)];
    const bytes: Record<string, Uint8Array> = { [a]: new Uint8Array([1]), [b]: new Uint8Array([2]) };
    holdPdfsOf({ files: [a, b].map((sha256) => ({ sha256, media: "application/pdf" })), data: (sha) => bytes[sha] });
    for (let k = 0; k < 6; k++) void drawPart({ sha256: a, page: k, scale: 1 }).catch(() => {});
    void drawPart({ sha256: b, page: 0, scale: 1 }).catch(() => {});
    // (B held; A still being taken in)
    holds.get(2)!();
    await flush();
    const asked = invoke.mock.calls.filter(([cmd]) => cmd === "pdf_render").map(([, args]) => (args as { sha: string }).sha);
    expect(asked).toEqual([b]);
    // (A held: its pictures follow)
    holds.get(1)!();
    await flush();
    expect(invoke.mock.calls.filter(([cmd]) => cmd === "pdf_render").length).toBeGreaterThan(1);
  });
});
