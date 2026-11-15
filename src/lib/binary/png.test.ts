import { describe, expect, it } from "vitest";
import { withoutColour } from "./png";
import { concat, crc32 } from "./zip";

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A PNG chunk: its length, type, data and CRC. */
function chunk(type: string, data: number[]): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

const types = (png: Uint8Array) => {
  const out: string[] = [];
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  for (let at = 8; at + 12 <= png.length; at += 12 + view.getUint32(at)) out.push(new TextDecoder().decode(png.subarray(at + 4, at + 8)));
  return out;
};

describe("a PNG without what says how its samples are taken as colours", () => {
  const header = chunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  const data = chunk("IDAT", [1, 2, 3]);
  const end = chunk("IEND", []);

  it("leaves out its gamma, chromaticities, profile and intent, keeping the rest in order", () => {
    const png = concat([SIGNATURE, header, chunk("gAMA", [0, 0, 0xd9, 0x04]), chunk("iCCP", [65, 0, 0, 1]), chunk("sRGB", [0]), chunk("pHYs", [0, 0, 0, 1, 0, 0, 0, 1, 1]), chunk("cHRM", [0]), data, end]);
    const plain = withoutColour(png);
    expect(types(plain)).toEqual(["IHDR", "pHYs", "IDAT", "IEND"]);
    expect([...plain.subarray(0, 8)]).toEqual([...SIGNATURE]);
  });

  it("is the same PNG where it holds none, and what is no PNG as it is", () => {
    const png = concat([SIGNATURE, header, data, end]);
    expect(withoutColour(png)).toBe(png);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff]);
    expect(withoutColour(jpeg)).toBe(jpeg);
    // (a chunk that says it runs past the file's end: as it is)
    const cut = concat([SIGNATURE, header, chunk("gAMA", [0, 0, 0, 1]).subarray(0, 10)]);
    expect(withoutColour(cut)).toBe(cut);
  });
});
