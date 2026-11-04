/**
 * Text carried in a PNG: an iTXt chunk under a keyword, put in before the
 * image's end and read back out. PNG readers pass over a chunk they do not
 * know, and Office keeps the file as it is.
 */
import { concat, crc32 } from "./zip";

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const utf8 = new TextEncoder();

function isPng(png: Uint8Array): boolean {
  return png.length >= 8 && SIGNATURE.every((b, i) => png[i] === b);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(utf8.encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** `png` with `text` in an uncompressed iTXt chunk under `keyword`. */
export function withText(png: Uint8Array, keyword: string, text: string): Uint8Array {
  if (!isPng(png)) throw new Error("not a PNG");
  // keyword, NUL, not compressed, method, no language, NUL, no translated keyword, NUL
  const data = concat([utf8.encode(keyword), new Uint8Array([0, 0, 0, 0, 0]), utf8.encode(text)]);
  const iend = png.length - 12;
  return concat([png.subarray(0, iend), chunk("iTXt", data), png.subarray(iend)]);
}

/**
 * `png` said to be `dpi` dots to the inch (a pHYs chunk after the header),
 * so that a program placing it sizes it as meant.
 */
export function withDpi(png: Uint8Array, dpi: number): Uint8Array {
  if (!isPng(png)) throw new Error("not a PNG");
  const perMetre = Math.round(dpi / 0.0254);
  const data = new Uint8Array(9);
  const v = new DataView(data.buffer);
  v.setUint32(0, perMetre);
  v.setUint32(4, perMetre);
  data[8] = 1; // the unit is the metre
  const afterHeader = 8 + 12 + new DataView(png.buffer, png.byteOffset).getUint32(8);
  return concat([png.subarray(0, afterHeader), chunk("pHYs", data), png.subarray(afterHeader)]);
}

/** The text under `keyword` in an uncompressed iTXt chunk of `png`, if there is one. */
export function textOf(png: Uint8Array, keyword: string): string | null {
  if (!isPng(png)) return null;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const decoder = new TextDecoder();
  const key = utf8.encode(keyword);
  for (let at = 8; at + 12 <= png.length; ) {
    const length = view.getUint32(at);
    const type = decoder.decode(png.subarray(at + 4, at + 8));
    const data = png.subarray(at + 8, at + 8 + length);
    if (type === "iTXt" && data.length > key.length + 5 && key.every((b, i) => data[i] === b) && data[key.length] === 0) {
      // not compressed; then past the language and translated keyword
      if (data[key.length + 1] !== 0) return null;
      let i = key.length + 3;
      for (let nul = 0; nul < 2 && i < data.length; i++) if (data[i] === 0) nul++;
      return decoder.decode(data.subarray(i));
    }
    if (type === "IEND") break;
    at += 12 + length;
  }
  return null;
}

/** The chunks that say how a PNG's samples are to be taken as colours: its gamma, chromaticities, ICC profile, sRGB intent and coding-independent code points (PNG 3rd edition). */
const COLOUR_CHUNKS = new Set(["gAMA", "cHRM", "iCCP", "sRGB", "cICP", "mDCV", "cLLI"]);

/**
 * `png` without what says how its samples are to be taken as colours, so
 * that a window decodes its samples as they are, whatever it does with a
 * colour profile; as it is where it holds none, or is no PNG.
 */
export function withoutColour(png: Uint8Array): Uint8Array {
  if (!isPng(png)) return png;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const decoder = new TextDecoder();
  const kept: Uint8Array[] = [png.subarray(0, 8)];
  let dropped = false;
  for (let at = 8; at + 12 <= png.length; ) {
    const length = view.getUint32(at);
    const end = at + 12 + length;
    if (end > png.length) return png;
    const type = decoder.decode(png.subarray(at + 4, at + 8));
    if (COLOUR_CHUNKS.has(type)) dropped = true;
    else kept.push(png.subarray(at, end));
    at = end;
    if (type === "IEND") break;
  }
  return dropped ? concat(kept) : png;
}
