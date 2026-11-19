/**
 * A PNG decoded to its pixels, where the window or a worker can: nothing
 * here but a bitmap and a canvas off the page, so that a picture's reading
 * (pictureWorker.ts, structuresWorker.ts) decodes it off the thread the
 * drawing runs on - a picture drawn at 600 dpi is tens of millions of
 * pixels.
 */
import { withoutColour } from "../../../../lib/binary/png";

/** What is said where this system's web view cannot decode a picture off the page. */
export const NO_CANVAS = "This system cannot read pictures. Updating the system lets Meno read them.";

/**
 * A PNG's pixels as its samples are - no gamma or colour profile applied,
 * which a window may apply even when asked not to, so its colour chunks
 * are taken out first - laid on white where it is see-through: what a
 * picture's reading is laid on (lib/figure/inkFit), as its plugin's model
 * was given them.
 */
export async function pngPixels(png: Uint8Array): Promise<ImageData> {
  // (a web view with no canvas off the page cannot decode it here: said in plain words, not its own error - WebKit's 2D canvas off
  //  the page came with Safari 16.4, as WebKit's bug 253431 says)
  if (typeof OffscreenCanvas === "undefined") throw new Error(NO_CANVAS);
  const plain = withoutColour(png);
  const bitmap = await createImageBitmap(new Blob([plain as Uint8Array<ArrayBuffer>], { type: "image/png" }), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas to draw the picture on");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // (each pixel laid on white as far as it is see-through: none to lay where the picture is opaque, as a page drawn by the reader is)
  const d = pixels.data;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] === 255) continue;
    const a = d[i] / 255;
    for (let k = 1; k <= 3; k++) d[i - k] = Math.round(d[i - k] * a + 255 * (1 - a));
    d[i] = 255;
  }
  return pixels;
}

/** A PNG's pixels as a picture's reading takes them: its size and its samples (RGBA, row by row). */
export async function pixelsOfPng(png: ArrayBuffer): Promise<{ width: number; height: number; data: ArrayBuffer }> {
  const p = await pngPixels(new Uint8Array(png));
  return { width: p.width, height: p.height, data: p.data.buffer as ArrayBuffer };
}

/** A PNG's bytes as an ArrayBuffer of their own, to be handed to a worker. */
export function pngBuffer(png: Uint8Array): ArrayBuffer {
  return png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;
}
