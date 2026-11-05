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
