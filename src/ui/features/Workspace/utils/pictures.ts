/**
 * Pictures coming onto the page and going out of it (docs/PDF.md, *A
 * picture*), where the window decodes them: an image file's bytes held, its
 * size read as it is shown - a photograph turned as its camera said - a
 * picture on the clipboard taken, and a picture put there as a PNG for
 * other programs.
 */
import { readClipboard } from "../../../../lib/clipboard";
import { rgbaOfDib } from "../../../../lib/binary/dib";
import { withDpi, withoutColour } from "../../../../lib/binary/png";
import { holdPicture, pictureBytes } from "../../../../lib/picture/held";
import { isFilm, type PictureMedia } from "../../../../lib/picture/image";
import type { PictureItem, PictureToAdd } from "../store/types";

/** An image's bytes decoded as the window shows them. */
async function decoded(bytes: Uint8Array, media: PictureMedia): Promise<ImageBitmap> {
  return createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: media }));
}

/**
 * An image file's bytes held, as it goes on the page: what it is known by,
 * what it is and its size in pixels as it is shown; none, where they are no
 * PNG or JPEG the window can show.
 */
export async function pictureToAdd(name: string, bytes: Uint8Array): Promise<PictureToAdd | null> {
  const held = await holdPicture(bytes);
  if (!held) return null;
  // (as shown: a photograph's camera may have said to turn it)
  const bitmap = await decoded(bytes, held.media).catch(() => null);
  if (!bitmap) return null;
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return { name, sha256: held.sha256, media: held.media, ...size, ...(held.dpi ? { dpi: held.dpi } : {}) };
}

/** Pixels as a PNG, at `dpi` where it is given. */
async function pngOf(rgba: Uint8ClampedArray, width: number, height: number, dpi?: number): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas to draw the picture on");
  ctx.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
  const png = new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
  return dpi ? withDpi(png, dpi) : png;
}

/** A picture as a PNG, for other programs: as it is, a PNG; a JPEG drawn again as one; a film, none. */
export async function picturePng(p: Pick<PictureItem, "sha256" | "media">): Promise<Uint8Array | null> {
  const bytes = pictureBytes(p.sha256);
  if (!bytes || isFilm(p.media)) return null;
  if (p.media === "image/png") return bytes;
  const bitmap = await decoded(bytes, p.media);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
}

/**
 * A PNG's pixels as its samples are - no gamma or colour profile applied,
 * which a window may apply even when asked not to, so its colour chunks
 * are taken out first - laid on white where it is see-through: what a
 * picture's reading is laid on (lib/figure/inkFit), as its plugin's model
 * was given them.
 */
export async function pngPixels(png: Uint8Array): Promise<ImageData> {
  const plain = withoutColour(png);
  const bitmap = await createImageBitmap(new Blob([plain as Uint8Array<ArrayBuffer>], { type: "image/png" }), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas to draw the picture on");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // (each pixel laid on white as far as it is see-through)
  const d = pixels.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    for (let k = 0; k < 3; k++) d[i + k] = Math.round(d[i + k] * a + 255 * (1 - a));
    d[i + 3] = 255;
  }
  return pixels;
}

/** A picture on the clipboard: a PNG - a screenshot, say - or a JPEG as a browser copies a photograph, as they are; on Windows, a bitmap (CF_DIB) made a PNG; none, where there is none. */
export async function pictureOnClipboard(): Promise<Uint8Array | null> {
  const png = await readClipboard(["png"]).catch(() => null);
  if (png?.bytes?.length) return png.bytes;
  // (a photograph as a browser copies it, kept as it is)
  const jpeg = await readClipboard(["jpeg"]).catch(() => null);
  if (jpeg?.bytes?.length) return jpeg.bytes;
  const dib = await readClipboard(["dib"]).catch(() => null);
  const read = dib?.bytes ? rgbaOfDib(dib.bytes) : null;
  return read ? pngOf(read.rgba, read.width, read.height, read.dpi) : null;
}
