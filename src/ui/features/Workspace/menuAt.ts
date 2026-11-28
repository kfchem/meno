/** How far from its point a page menu stands, up and to the right, in px (Quick Add's, and every menu's after it). */
export const MENU_OFF = 14;
/** The room kept between a menu and the canvas's edge, in px. */
export const MENU_MARGIN = 16;

/** Where a menu stands on the canvas, in px from its top left corner, and whether it opened upward and to the left of its point. */
export type MenuPlace = { left: number; top: number; up: boolean; leftward: boolean };

/**
 * Where a menu `size` px large stands for a point `at` on the canvas, `view`
 * px large, the column covering `cover` px of its right side, `margin` px
 * kept clear of every edge - the view as it is: a menu never moves the page.
 * Its top left corner is `MENU_OFF` up and to the right of the point; where
 * it would lie past the right edge it opens to the left of the point, its
 * right edge as far from it; past the foot, upward, its foot as far below
 * the point as its top would have been above it. Where neither way has room
 * it is slid in, just clear of the edge it lay past - and one larger than
 * the room has its top left corner in, and scrolls inside from there.
 */
export function placeMenu(
  at: { x: number; y: number },
  size: { width: number; height: number },
  view: { width: number; height: number },
  cover: number,
  margin = MENU_MARGIN,
): MenuPlace {
  const seenRight = view.width - Math.max(0, Math.min(cover, view.width));
  // (as it opens, where it fits; else the other way, where that fits; else slid in from the far edge, the near edge winning)
  const side = (from: number, len: number, lo: number, hi: number, otherEnd: number) => {
    if (from + len <= hi) return { at: Math.max(lo, from), flipped: false };
    const back = Math.min(otherEnd, hi) - len;
    if (back >= lo) return { at: back, flipped: true };
    return { at: Math.max(lo, hi - len), flipped: false };
  };
  const x = side(at.x + MENU_OFF, size.width, margin, seenRight - margin, at.x - MENU_OFF);
  const y = side(at.y - MENU_OFF, size.height, margin, view.height - margin, at.y + MENU_OFF);
  return { left: x.at, top: y.at, up: y.flipped, leftward: x.flipped };
}
