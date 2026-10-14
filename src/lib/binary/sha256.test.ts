import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { sha256Hex } from "./sha256";

describe("SHA-256 at once", () => {
  it("gives FIPS 180-4's own examples", () => {
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex(new TextEncoder().encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
    expect(sha256Hex(new Uint8Array(0))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("agrees with Node's on either side of each block's end, and on a view into a larger buffer", () => {
    for (const n of [1, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000, 70_001]) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 7919 + 13) % 256);
      expect(sha256Hex(bytes)).toBe(createHash("sha256").update(bytes).digest("hex"));
    }
    const buffer = Uint8Array.from({ length: 300 }, (_, i) => i % 256);
    const view = buffer.subarray(7, 207);
    expect(sha256Hex(view)).toBe(createHash("sha256").update(view).digest("hex"));
  });
});
