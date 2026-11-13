/** Where a compound's card stands by its number's word, and when it comes (components/CompoundCard). */
import type { PdfLens } from "../store/types";

/** How long the pointer rests on a number before its card comes, in ms. */
export const REST_MS = 350;

/** How long is left to wait before a card comes, the pointer on its number since `since` (ms, as `now`): none once it has rested `REST_MS`. */
export const restLeft = (since: number, now: number) => Math.max(0, REST_MS - (now - since));
/** The card's gap from its word's line, and from the window's edges, in pixels. */
const LINE_GAP = 4;
const EDGE = 8;

/**
 * Where a card stands by its word: over its line - covering only what has
 * been read - its left edge on the word's, a little gap above the line's
 * letters; under the line only where over it would pass the window's top.
 * Never past the window's sides.
 */
export function cardPlace(word: PdfLens["word"], card: { width: number; height: number }, view: { width: number; height: number }): { left: number; top: number } {
  const left = Math.min(Math.max(EDGE, word.left), Math.max(EDGE, view.width - card.width - EDGE));
  const over = word.top - LINE_GAP - card.height;
  return { left, top: over >= EDGE ? over : word.bottom + LINE_GAP };
}

/**
 * What a number's card holds: the region of its PDF's page where the
 * compound is drawn, a picture (docs/PDF.md, *A compound's number*), once
 * the number is placed in its PDF's index (`placed`) and its structure's box
 * is known (`read`: the structure read, whole or not - only its box is
 * wanted); "reading" while its PDF's pages are still being gone through for
 * numbers (`whole` not yet), or the number placed and its figure's structures
 * still being read; and where the PDF has been gone through whole and the
 * number is drawn nowhere, "none": the card says so in words, never a guess.
 */
export function cardHolds(c: { placed: boolean; read: boolean; whole: boolean }): "picture" | "reading" | "none" {
  if (c.placed) return c.read ? "picture" : "reading";
  return c.whole ? "none" : "reading";
}
