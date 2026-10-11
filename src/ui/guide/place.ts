/**
 * Where a guide's card goes (./GuideCard): beside the part its step points
 * at - under it, for a part of the title bar; to its right, else to its
 * left, for anything on the page - with a notch towards it; and, where it
 * points at the page itself or at a part not there, low in the middle of
 * the page, out of the way of where the chemist is to work.
 */

export type Box = { left: number; top: number; width: number; height: number };
export type CardPlace = {
  left: number;
  top: number;
  /** The card's side the notch is on, and how far along that side its middle is. */
  notch?: { side: "top" | "left" | "right"; at: number };
};

/** The room kept between the card and the window's edge, and between the card and what it points at. */
export const EDGE = 12;
export const GAP = 14;
/** How far from the card's corner a notch may come at most. */
const NOTCH_IN = 18;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * The card's place, of `card`'s size: beside `part` - none, where the step
 * points at no part, or at one not there - within `window`, and in `page`
 * where it points at none. A part in the title bar - its top within
 * `barBelow` of the window's - has the card under it.
 */
export function placeCard(part: Box | null, page: Box, card: { width: number; height: number }, win: { width: number; height: number }, barBelow = 48): CardPlace {
  const maxLeft = win.width - card.width - EDGE;
  const maxTop = win.height - card.height - EDGE;
  if (!part) {
    // (low in the middle of the page: where the chemist works stays clear)
    const top = page.top + page.height * 0.64;
    return { left: clamp(page.left + (page.width - card.width) / 2, EDGE, maxLeft), top: clamp(Math.min(top, page.top + page.height - card.height - 2 * EDGE), EDGE, maxTop) };
  }
  const middleX = part.left + part.width / 2;
  const middleY = part.top + part.height / 2;
  if (part.top < barBelow) {
    // (under a part of the title bar, its right edge near the part's: the bar's buttons are at its right)
    const left = clamp(middleX - card.width + 2 * NOTCH_IN, EDGE, maxLeft);
    return { left, top: clamp(part.top + part.height + GAP, EDGE, maxTop), notch: { side: "top", at: clamp(middleX - left, NOTCH_IN, card.width - NOTCH_IN) } };
  }
  const right = part.left + part.width + GAP;
  const toRight = right + card.width <= win.width - EDGE;
  const left = toRight ? right : part.left - GAP - card.width;
  const top = clamp(middleY - card.height / 2, EDGE, maxTop);
  if (!toRight && left < EDGE) {
    // (room on neither side: under it, or over it)
    const below = part.top + part.height + GAP;
    const under = below + card.height <= win.height - EDGE;
    return { left: clamp(middleX - card.width / 2, EDGE, maxLeft), top: under ? below : clamp(part.top - GAP - card.height, EDGE, maxTop) };
  }
  return { left, top, notch: { side: toRight ? "left" : "right", at: clamp(middleY - top, NOTCH_IN, card.height - NOTCH_IN) } };
}
