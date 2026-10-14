import { describe, expect, it } from "vitest";
import { copying, forTheClipboard, readClipboard, writeClipboard } from "./clipboard";

/**
 * A copy takes a moment - its pictures are drawn before anything goes on
 * the clipboard - and a paste straight after it (Cmd+C, Cmd+V) read the
 * clipboard first: it pasted what was there before.
 */
describe("a paste straight after a copy", () => {
  it("takes what was copied, not what was there before", async () => {
    await writeClipboard([{ flavor: "text", text: "before" }]);
    let draw!: () => void;
    const drawn = new Promise<void>((done) => (draw = done));
    const copied = copying(async () => {
      await drawn;
      await writeClipboard([{ flavor: "text", text: "copied" }]);
    });
    const read = readClipboard(["text"]);
    draw();
    await copied;
    expect((await read)?.text).toBe("copied");
  });

  it("is not held up by a copy that failed", async () => {
    await writeClipboard([{ flavor: "text", text: "kept" }]);
    await expect(copying(() => Promise.reject(new Error("no picture")))).rejects.toThrow("no picture");
    expect((await readClipboard(["text"]))?.text).toBe("kept");
  });
});

describe("a text for the clipboard", () => {
  it("has its lines ended CRLF on Windows, as Meno's copies through the menu do, and is as it is elsewhere", () => {
    expect(forTheClipboard("CCO\nc1ccccc1\n", true)).toBe("CCO\r\nc1ccccc1\r\n");
    expect(forTheClipboard("a\r\nb\n", true)).toBe("a\r\nb\r\n");
    expect(forTheClipboard("a\nb", false)).toBe("a\nb");
  });
});
