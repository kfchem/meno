import { describe, expect, it } from "vitest";
import { holdEachKept } from "./reader";
import { isNotHad } from "../doc/notHad";

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
    // (those not held are held no more: free to be held from another file)
    expect([...held.keys()]).toEqual(["a"]);
    expect(told.sort()).toEqual(["locked.pdf: it is locked with a password", "lost.pdf: the workspace's file does not hold it whole"]);
  });

  it("marks one the file does not hold whole as damaged, until it is had again - from another file, or opened", async () => {
    const lost = "9".repeat(64);
    const told: string[] = [];
    const first = new Map<string, Promise<unknown>>();
    holdEachKept({ files: [{ sha256: lost, media: "application/pdf", name: "lost.pdf" }], data: () => null }, async () => "held", (name) => told.push(name), first);
    await Promise.all(first.values());
    expect(told).toEqual(["lost.pdf"]);
    expect(isNotHad(lost)).toBe(true);
    // (the same PDF, whole, from another workspace's file)
    const held = new Map<string, Promise<unknown>>();
    holdEachKept({ files: [{ sha256: lost, media: "application/pdf", name: "found.pdf" }], data: () => new Uint8Array([1]) }, async () => ({ sha256: lost }), () => {}, held);
    await Promise.all(held.values());
    expect(isNotHad(lost)).toBe(false);
  });

  it("draws one the file does not hold whole, and marks it as nothing damaged, where Meno holds it whole already", async () => {
    const whole = "8".repeat(64);
    const told: string[] = [];
    const held = new Map<string, Promise<unknown>>();
    holdEachKept(
      { files: [{ sha256: whole, media: "application/pdf", name: "paper.pdf" }], data: () => null },
      async () => "held",
      (name) => told.push(name),
      held,
      async (sha) => sha === whole,
    );
    await Promise.all(held.values());
    expect(told).toEqual([]);
    expect(isNotHad(whole)).toBe(false);
  });

  it("holds a PDF one file does not hold whole when the next file opened holds it whole", async () => {
    const pdf = "7".repeat(64);
    const told: string[] = [];
    // (one map, as the app keeps one for the session)
    const held = new Map<string, Promise<unknown>>();
    const holds: string[] = [];
    const hold = async (b: Uint8Array) => (holds.push(String(b[0])), "held");
    holdEachKept({ files: [{ sha256: pdf, media: "application/pdf", name: "paper.pdf" }], data: () => null }, hold, (name) => told.push(name), held);
    await Promise.all(held.values());
    expect(told).toEqual(["paper.pdf"]);
    expect(isNotHad(pdf)).toBe(true);
    holdEachKept({ files: [{ sha256: pdf, media: "application/pdf", name: "paper.pdf" }], data: () => new Uint8Array([5]) }, hold, (name) => told.push(name), held);
    await Promise.all(held.values());
    expect(holds).toEqual(["5"]);
    expect(isNotHad(pdf)).toBe(false);
  });
});
