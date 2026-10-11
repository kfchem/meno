/**
 * What an image file is, from its first bytes (docs/PDF.md, *A picture*): a
 * PNG or a JPEG, how many pixels across and down, and how many to the inch
 * it says it was made at - a PNG's pHYs chunk, a JPEG's JFIF density -
 * where it says so. Nothing else is read of it here: the window decodes it.
 */

/** The kinds of picture Meno puts on the page: images, and films - MP4s, a render's (docs/RENDER.md). */
export type PictureMedia = "image/png" | "image/jpeg" | "video/mp4";

/** The kinds of picture a workspace keeps. */
export const PICTURE_MEDIA: readonly PictureMedia[] = ["image/png", "image/jpeg", "video/mp4"];

/** Whether a picture is a film. */
export const isFilm = (media: PictureMedia) => media === "video/mp4";

/** Whether bytes are an MP4's: an ISO base media file, its first box its file type ("ftyp"). */
export function isMp4(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && String.fromCharCode(...bytes.subarray(4, 8)) === "ftyp";
}

/** An image file's kind, its size in pixels, and its resolution where it gives one. */
export type ImageInfo = { media: Exclude<PictureMedia, "video/mp4">; width: number; height: number; dpi?: number };

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Whether a file's name says it is an image Meno puts on the page. */
export const isPictureName = (name: string) => /\.(png|jpe?g)$/i.test(name);

/** The image a file's bytes are, as far as their headers tell; none, where they are no PNG or JPEG. */
export function imageInfo(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length >= 24 && PNG.every((b, i) => bytes[i] === b)) return pngInfo(bytes);
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return jpegInfo(bytes);
  return null;
}

function pngInfo(bytes: Uint8Array): ImageInfo | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = (at: number) => String.fromCharCode(...bytes.subarray(at + 4, at + 8));
  if (type(8) !== "IHDR") return null;
  const info: ImageInfo = { media: "image/png", width: v.getUint32(16), height: v.getUint32(20) };
  // (pHYs comes before the image's data, if at all)
  for (let at = 8; at + 12 <= bytes.length; ) {
    const length = v.getUint32(at);
    const t = type(at);
    if (t === "IDAT" || t === "IEND") break;
    if (t === "pHYs" && length >= 9 && at + 17 <= bytes.length && bytes[at + 16] === 1) {
      const perMetre = v.getUint32(at + 8);
      if (perMetre > 0) info.dpi = perMetre * 0.0254;
    }
    at += 12 + length;
  }
  return info.width > 0 && info.height > 0 ? info : null;
}

/** A JPEG's frame markers, which say its size: baseline, progressive and the rest (not DHT, JPG or DAC). */
const FRAME = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function jpegInfo(bytes: Uint8Array): ImageInfo | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let dpi: number | undefined;
  for (let at = 2; at + 4 <= bytes.length; ) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    // (fill bytes, and markers with nothing after them)
    if (marker === 0xff) {
      at++;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      at += 2;
      continue;
    }
    const length = v.getUint16(at + 2);
    if (length < 2) return null;
    const body = at + 4;
    // (JFIF: its units - 1 inches, 2 centimetres - and its density across)
    if (marker === 0xe0 && body + 12 <= bytes.length && String.fromCharCode(...bytes.subarray(body, body + 5)) === "JFIF\0") {
      const units = bytes[body + 7];
      const x = v.getUint16(body + 8);
      if (x > 0 && units === 1) dpi = x;
      else if (x > 0 && units === 2) dpi = x * 2.54;
    }
    if (FRAME.has(marker) && body + 5 <= bytes.length) {
      const height = v.getUint16(body + 1);
      const width = v.getUint16(body + 3);
      return width > 0 && height > 0 ? { media: "image/jpeg", width, height, ...(dpi ? { dpi } : {}) } : null;
    }
    if (marker === 0xda || marker === 0xd9) return null;
    at += 2 + length;
  }
  return null;
}

/** The resolution taken for an image that gives none: a screen's, as a screenshot is at its own size. */
export const SCREEN_DPI = 96;
/** The resolution an image is taken at below which it says nothing worth believing - 72, a JPEG's default - is a screen's. */
const LEAST_DPI = 72;

/**
 * How large an image is put on the page, in points: as it would be printed
 * at the resolution it gives - a screen's where it gives none, or one that
 * says nothing - no wider or taller than `most` points, a page's text.
 */
export function printedSize(info: Pick<ImageInfo, "width" | "height" | "dpi">, most = 468): { w: number; h: number } {
  const dpi = info.dpi && info.dpi > LEAST_DPI ? info.dpi : SCREEN_DPI;
  const w = (info.width / dpi) * 72;
  const h = (info.height / dpi) * 72;
  const k = Math.min(1, most / Math.max(w, h));
  return { w: w * k, h: h * k };
}
