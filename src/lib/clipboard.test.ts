import { describe, expect, it } from "vitest";
import { copying, forTheClipboard, framed, readClipboard, writeClipboard } from "./clipboard";

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

describe("a copy sent to the app", () => {
  it("goes as one body of its kinds' bytes, text as UTF-8, with each kind's length listed in order", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 255]);
    const { listed, body } = framed([
      { flavor: "mol", text: "C1CC" },
      { flavor: "png", bytes: png },
      { flavor: "text", text: "hé" },
      { flavor: "meno" },
    ]);
    expect(listed).toBe("mol:t:4,png:b:6,text:t:3,meno:t:0");
    expect([...body]).toEqual([..."C1CC"].map((c) => c.charCodeAt(0)).concat([...png], [0x68, 0xc3, 0xa9]));
  });

  it("sends nothing for no kinds", () => {
    expect(framed([])).toEqual({ listed: "", body: new Uint8Array(0) });
  });
});
