import { describe, expect, it } from "vitest";
import { holdEachKept } from "./reader";

describe("a workspace's PDFs held as it opens", () => {
  it("holds each, and tells of each that cannot be - refused, or not held whole by the file - by its name", async () => {
    const bytes: Record<string, Uint8Array | null> = { a: new Uint8Array([1]), b: new Uint8Array([2]), c: null };
    const file = {
      files: [
        { sha256: "a", media: "application/pdf", name: "kept.pdf" },
        { sha256: "b", media: "application/pdf", name: "locked.pdf" },
        { sha256: "c", media: "application/pdf", name: "lost.pdf" },
        { sha256: "d", media: "text/plain", name: "notes.txt" },
      ],
      data: (sha: string) => bytes[sha] ?? null,
    };
    const told: string[] = [];
    const held = new Map<string, Promise<unknown>>();
    holdEachKept(file, async (b) => (b[0] === 2 ? Promise.reject("it is locked with a password") : "held"), (name, why) => told.push(`${name}: ${why}`), held);
    await Promise.all(held.values());
    expect([...held.keys()]).toEqual(["a", "b"]);
    expect(told).toEqual(["lost.pdf: the workspace's file does not hold it whole", "locked.pdf: it is locked with a password"]);
  });
});
