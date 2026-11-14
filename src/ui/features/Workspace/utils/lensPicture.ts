/**
 * The picture a compound's card holds (docs/PDF.md, *A compound's number*):
 * the region of the PDF's page where the compound is drawn, drawn again from
 * the PDF by PDFium at the size the card shows it - crisp there, not a
 * page's bitmap made larger - never the structure Meno read from it, which
 * comes only once the compound is placed on the canvas, where it can be
 * checked and edited. Asked for once and kept; PDFium draws it in its own
 * process, so the window is never held up, and the card comes at once with
 * its place held until the picture has.
 */
import { boxPicture } from "../../../../lib/pdf/reader";
import type { Box } from "../../../../lib/pdf/figures";

/** The picture's most, in pixels, and how far a small region is enlarged at most (a structure's box is a hundred points or so). */
export const LENS_MOST = { width: 220, height: 150, enlarge: 1.5 } as const;

/** How large a region of `box` (points) is shown in the card, in pixels: its own size - a point a pixel - enlarged a little where small, reduced to fit `LENS_MOST`. */
export function lensSize(box: Box): { width: number; height: number } {
  const w = Math.max(box[2] - box[0], 1);
  const h = Math.max(box[3] - box[1], 1);
  const k = Math.min(LENS_MOST.enlarge, LENS_MOST.width / w, LENS_MOST.height / h);
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/** The resolution a region is drawn at, in dots an inch, for the size it is shown at on a screen of `ratio` device pixels a pixel: in steps, so a card at a slightly different size reuses the picture drawn. */
export function lensDpi(box: Box, shown: { width: number }, ratio: number): number {
  const perPoint = shown.width / Math.max(box[2] - box[0], 1);
  const dpi = 72 * perPoint * Math.max(1, ratio);
  return Math.min(1200, Math.max(72, Math.ceil(dpi / 48) * 48));
}

/** How many pictures are kept: the oldest is let go past it. */
export const KEPT = 48;

const pictures = new Map<string, string | "asked">();
/** Which lot of pictures is kept: one let go of (`forgetPictures`) while it was being drawn is not kept when it comes. */
let lot = 0;

const keyOf = (sha256: string, page: number, box: Box, dpi: number) => `${sha256}:${page}:${box.map((v) => Math.round(v * 10) / 10).join(",")}:${dpi}`;

/** Lets go of the oldest pictures past `KEPT`. */
function trim(): void {
  for (const [key, url] of pictures) {
    if (pictures.size <= KEPT) return;
    if (url !== "asked") {
      URL.revokeObjectURL(url);
      pictures.delete(key);
    }
  }
}

/**
 * The picture of `box` of a page of a PDF, as a URL an image can show, if it
 * has been drawn - asked for, the first time, and `came` called once it has.
 * None meanwhile, or where it could not be drawn (asked again next time).
 */
export function lensPictureOf(sha256: string, page: number, box: Box, dpi: number, came: () => void = () => {}): string | null {
  const key = keyOf(sha256, page, box, dpi);
  const had = pictures.get(key);
  if (had && had !== "asked") {
    // (used again: the latest to be let go)
    pictures.delete(key);
    pictures.set(key, had);
    return had;
  }
  if (!had) {
    pictures.set(key, "asked");
    const mine = lot;
    boxPicture(sha256, page, box, dpi).then(
      (p) => {
        if (mine !== lot) return;
        pictures.set(key, URL.createObjectURL(new Blob([p.png as BlobPart], { type: "image/png" })));
        trim();
        came();
      },
      () => {
        if (mine === lot) pictures.delete(key);
      },
    );
  }
  return null;
}

/** Lets go of every picture - of a PDF closed, or in a test. */
export function forgetPictures(): void {
  lot++;
  for (const url of pictures.values()) if (url !== "asked") URL.revokeObjectURL(url);
  pictures.clear();
}
