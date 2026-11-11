import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args), isTauri: () => true }));

import { isLocked } from "../doc/locked";
import { holdPdfBytes, linksOf, LOCKED_SHEET, unlockPdf } from "./reader";

const sha = "e".repeat(64);

describe("a PDF held that is locked with a password", () => {
  beforeEach(() => invoke.mockReset());

  it("lies as one sheet, marked locked, and as it is where it is not", async () => {
    invoke.mockResolvedValueOnce({ sha256: sha, size: 9, pages: [], locked: true });
    const held = await holdPdfBytes(new Uint8Array([1]));
    expect(held.pages).toEqual([LOCKED_SHEET]);
    expect(isLocked(sha)).toBe(true);
    // (held again, opened with its password meanwhile: its pages, and not marked)
    invoke.mockResolvedValueOnce({ sha256: sha, size: 9, pages: [[300, 400]], locked: false });
    expect((await holdPdfBytes(new Uint8Array([1]))).pages).toEqual([[300, 400]]);
    expect(isLocked(sha)).toBe(false);
  });

  it("is opened by the password sent to the reader's command by name, and is not locked after it", async () => {
    invoke.mockResolvedValueOnce({ sha256: sha, size: 9, pages: [], locked: true });
    await holdPdfBytes(new Uint8Array([1]));
    invoke.mockResolvedValueOnce({ sha256: sha, size: 9, pages: [[300, 400]] });
    const opened = await unlockPdf(sha, "word");
    expect(invoke).toHaveBeenLastCalledWith("pdf_unlock", { sha, password: "word" });
    expect(opened.pages).toEqual([[300, 400]]);
    expect(isLocked(sha)).toBe(false);
  });

  it("stays locked where the password is wrong, and says so", async () => {
    invoke.mockResolvedValueOnce({ sha256: sha, size: 9, pages: [], locked: true });
    await holdPdfBytes(new Uint8Array([1]));
    invoke.mockRejectedValueOnce("That is not its password");
    await expect(unlockPdf(sha, "wrong")).rejects.toBe("That is not its password");
    expect(isLocked(sha)).toBe(true);
  });

  it("is asked of nothing for its links while it is locked, and is as soon as it is opened", async () => {
    const other = "f".repeat(64);
    invoke.mockResolvedValueOnce({ sha256: other, size: 9, pages: [], locked: true });
    await holdPdfBytes(new Uint8Array([1]));
    invoke.mockClear();
    expect(linksOf(other, 0)).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
    invoke.mockResolvedValueOnce({ sha256: other, size: 9, pages: [[300, 400]] });
    await unlockPdf(other, "word");
    invoke.mockClear();
    invoke.mockResolvedValue([]);
    linksOf(other, 0);
    await Promise.resolve();
    await Promise.resolve();
    expect(invoke).toHaveBeenCalledWith("pdf_links", { sha: other, page: 0 });
  });
});
