import { describe, expect, it } from "vitest";
import { imageInfo, isPictureName, printedSize, SCREEN_DPI } from "./image";
import { withDpi } from "../binary/png";
import { rgbaOfDib } from "../binary/dib";
import { crc32 } from "../binary/zip";

/** A PNG's signature, its header for `w` by `h`, and its end - no pixels: enough for its headers to be read. */
function png(w: number, h: number): Uint8Array {
  const chunk = (type: string, data: number[]) => {
    const body = [...type].map((c) => c.charCodeAt(0)).concat(data);
    const len = data.length;
    const crc = crc32(new Uint8Array(body));
    return [len >>> 24, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...body, crc >>> 24, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255];
  };
  const be = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk("IHDR", [...be(w), ...be(h), 8, 6, 0, 0, 0]), ...chunk("IEND", [])]);
}

/** A JPEG's start, a JFIF header at `dpi` (none, none), a frame for `w` by `h`, and its end. */
function jpeg(w: number, h: number, dpi?: number): Uint8Array {
  const jfif = dpi ? [0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, dpi >> 8, dpi & 255, dpi >> 8, dpi & 255, 0, 0] : [];
  const sof = [0xff, 0xc2, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0];
  return new Uint8Array([0xff, 0xd8, ...jfif, ...sof, 0xff, 0xd9]);
}

describe("an image file", () => {
  it("is known from its headers, its size in pixels, and its resolution where it gives one", () => {
    expect(imageInfo(png(640, 480))).toEqual({ media: "image/png", width: 640, height: 480 });
    expect(imageInfo(withDpi(png(640, 480), 144))?.dpi).toBeCloseTo(144, 0);
    expect(imageInfo(jpeg(1200, 800, 300))).toEqual({ media: "image/jpeg", width: 1200, height: 800, dpi: 300 });
    expect(imageInfo(jpeg(1200, 800))).toEqual({ media: "image/jpeg", width: 1200, height: 800 });
    expect(imageInfo(new TextEncoder().encode("not a picture at all"))).toBeNull();
    expect(isPictureName("Figure 2.JPEG")).toBe(true);
    expect(isPictureName("paper.pdf")).toBe(false);
  });

  it("goes on the page as it would be printed, a screen's where it says nothing, no wider than a page's text", () => {
    // (a figure at 600 dpi: as wide as it was printed)
    expect(printedSize({ width: 1950, height: 1200, dpi: 600 })).toEqual({ w: 234, h: 144 });
    // (a screenshot, saying nothing - or 72, a JPEG's default: a screen's pixels)
    expect(printedSize({ width: SCREEN_DPI * 2, height: SCREEN_DPI })).toEqual({ w: 144, h: 72 });
    expect(printedSize({ width: SCREEN_DPI * 2, height: SCREEN_DPI, dpi: 72 })).toEqual({ w: 144, h: 72 });
    // (a photograph: made smaller, as it is)
    const big = printedSize({ width: 4000, height: 3000 });
    expect(big.w).toBeCloseTo(468);
    expect(big.h).toBeCloseTo(351);
  });
});

describe("a DIB on the clipboard", () => {
  it("reads back as pixels top row first, its resolution with it", () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
    // (24 bits, bottom row first, each row filled out to 8 bytes, as the app writes one: src-tauri/src/dib.rs)
    const dib = new Uint8Array(40 + 8 * 2);
    const v = new DataView(dib.buffer);
    v.setUint32(0, 40, true);
    v.setInt32(4, 2, true);
    v.setInt32(8, 2, true);
    v.setUint16(12, 1, true);
    v.setUint16(14, 24, true);
    v.setInt32(24, Math.round(144 / 0.0254), true);
    dib.set([255, 0, 0, 255, 255, 255], 40);
    dib.set([0, 0, 255, 0, 255, 0], 48);
    const read = rgbaOfDib(dib);
    expect(read).not.toBeNull();
    expect([read!.width, read!.height]).toEqual([2, 2]);
    expect(Array.from(read!.rgba)).toEqual(Array.from(rgba));
    expect(read!.dpi).toBeCloseTo(144, 0);
  });

  it("takes 32 bits to a pixel, top row first, opaque where no alpha is meant", () => {
    const dib = new Uint8Array(40 + 8);
    const v = new DataView(dib.buffer);
    v.setUint32(0, 40, true);
    v.setInt32(4, 2, true);
    v.setInt32(8, -1, true); // (negative: top row first)
    v.setUint16(12, 1, true);
    v.setUint16(14, 32, true);
    dib.set([0, 0, 255, 0, 255, 0, 0, 0], 40);
    const read = rgbaOfDib(dib)!;
    expect(Array.from(read.rgba)).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
    expect(rgbaOfDib(dib.subarray(0, 20))).toBeNull();
  });
});
