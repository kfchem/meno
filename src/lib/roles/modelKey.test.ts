import { describe, expect, it } from "vitest";
import { forgetKey, keepKey, keyHeld } from "./modelKey";

/** The backend as the test has it: the keys kept, and what it was asked. */
function backend(o: { nowhere?: boolean } = {}) {
  const kept = new Map<string, string>();
  const asked: { cmd: string; args: Record<string, unknown> }[] = [];
  const ask = (async (cmd: string, args: Record<string, unknown>) => {
    asked.push({ cmd, args });
    if (o.nowhere) throw new Error("No safe place to keep a key on this system");
    if (cmd === "model_key_set") kept.set(args.plugin as string, args.key as string);
    if (cmd === "model_key_forget") kept.delete(args.plugin as string);
    if (cmd === "model_key_held") return kept.has(args.plugin as string);
  }) as never;
  return { ask, kept, asked };
}

describe("a model plugin's key", () => {
  it("is given once and kept by the backend - the page told only whether one is kept, never the key", async () => {
    const b = backend();
    expect(await keyHeld("talker", b.ask)).toEqual({ held: false });
    expect(await keepKey("talker", "  sk-test-0123456789  ", b.ask)).toBeNull();
    expect(b.kept.get("talker")).toBe("sk-test-0123456789");
    expect(await keyHeld("talker", b.ask)).toEqual({ held: true });
    expect(await forgetKey("talker", b.ask)).toBeNull();
    expect(await keyHeld("talker", b.ask)).toEqual({ held: false });
    // (nothing the page asks returns a key)
    expect(b.asked.map((a) => a.cmd)).toEqual(["model_key_held", "model_key_set", "model_key_held", "model_key_forget", "model_key_held"]);
  });

  it("says why, where the system has nowhere safe to keep one", async () => {
    const b = backend({ nowhere: true });
    expect(await keyHeld("talker", b.ask)).toEqual({ why: "No safe place to keep a key on this system" });
    expect(await keepKey("talker", "sk-test-0123456789", b.ask)).toBe("No safe place to keep a key on this system");
  });
});
