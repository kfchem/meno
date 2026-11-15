import { describe, expect, it } from "vitest";
import { isLocked, markLocked, markUnlocked, useLocked } from "./locked";

describe("PDFs locked with a password not given", () => {
  it("are marked by their SHA-256 until they are opened, and no more", () => {
    const sha = "a".repeat(64);
    expect(isLocked(sha)).toBe(false);
    markLocked(sha);
    expect(isLocked(sha)).toBe(true);
    expect(isLocked("b".repeat(64))).toBe(false);
    markUnlocked(sha);
    expect(isLocked(sha)).toBe(false);
  });

  it("change the set held only where they change it, so that no view is drawn again for nothing", () => {
    const sha = "c".repeat(64);
    markLocked(sha);
    const first = useLocked.getState().shas;
    markLocked(sha);
    expect(useLocked.getState().shas).toBe(first);
    markUnlocked(sha);
    const after = useLocked.getState().shas;
    markUnlocked(sha);
    expect(useLocked.getState().shas).toBe(after);
  });
});
