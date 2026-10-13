import { describe, expect, it } from "vitest";
import { headOfFile, textOf, textOfFile } from "./text";

const bytes = (...b: number[]) => Uint8Array.from(b);
// (katakana, written as escapes: "acetone", "methanol")
const ACETONE = "\u30a2\u30bb\u30c8\u30f3";
const METHANOL = "\u30e1\u30bf\u30ce\u30fc\u30eb";

describe("a file's text, as its bytes are written", () => {
  it("reads UTF-8, its byte order mark not kept", () => {
    expect(textOf(new TextEncoder().encode(`CCO ${ACETONE}`))).toBe(`CCO ${ACETONE}`);
    expect(textOf(bytes(0xef, 0xbb, 0xbf, 0x43, 0x43, 0x4f))).toBe("CCO");
  });

  it("reads UTF-16 where a byte order mark says so, either way round", () => {
    expect(textOf(bytes(0xff, 0xfe, 67, 0, 67, 0, 79, 0, 13, 0, 10, 0, 0xa2, 0x30))).toBe("CCO\r\n\u30a2");
    expect(textOf(bytes(0xfe, 0xff, 0, 67, 0, 67, 0, 79, 0, 13, 0, 10, 0x30, 0xa2))).toBe("CCO\r\n\u30a2");
  });

  it("reads bytes that are not UTF-8 as Shift_JIS, as Windows in Japanese writes text", () => {
    expect(textOf(bytes(131, 65, 131, 90, 131, 103, 131, 147))).toBe(ACETONE);
    expect(textOf(bytes(131, 129, 131, 94, 131, 109, 129, 91, 131, 139, 13, 10))).toBe(`${METHANOL}\r\n`);
  });

  it("reads those that are not Shift_JIS either as Windows-1252", () => {
    expect(textOf(bytes(0x63, 0x61, 0x66, 0xe9, 0x0a))).toBe("caf\u00e9\n");
  });

  it("reads a file's start cut in a character as what it is, the character cut left out", () => {
    const whole = new TextEncoder().encode(`abc${ACETONE}`);
    expect(textOf(whole.slice(0, 5), true)).toBe("abc");
    expect(textOf(bytes(131, 65, 131), true)).toBe("\u30a2");
  });

  it("reads a file, and its start, so", async () => {
    const file = new Blob([bytes(131, 65, 131, 90, 131, 103, 131, 147)]);
    expect(await textOfFile(file)).toBe(ACETONE);
    expect(await headOfFile(file, 3)).toBe("\u30a2");
    expect(await headOfFile(file, 64)).toBe(ACETONE);
  });
});
