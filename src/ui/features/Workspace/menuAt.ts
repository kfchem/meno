/** How far from its point a page menu stands, up and to the right, in px (Quick Add's, and every menu's after it). */
export const MENU_OFF = 14;
/** The room kept between a menu and the canvas's edge once the view has glided for it, in px. */
export const MENU_MARGIN = 16;

/** A box on the canvas, in px from its top left corner. */
export type PxBox = { left: number; top: number; right: number; bottom: number };

/**
 * How far the page must slide on the screen - right and down where positive -
 * for a menu to be seen whole: `menu`, inside `view`, the canvas, `cover` px
 * of its right side being under the column, and `margin` px kept clear of
 * every edge. A menu already that far inside asks for nothing; one past an
 * edge, for just what it lies past it and the margin; one too large for the
 * room, for its top left corner to be brought in (it scrolls inside, from
 * there). The view never zooms for a menu: a menu is a screen's size.
 */
export function panFor(menu: PxBox, view: PxBox, cover: number, margin = MENU_MARGIN): { dx: number; dy: number } {
  const slide = (lo: number, hi: number, from: number, to: number) => {
    // (past the far edge: in by as much - and then the near edge wins, where it is all there is room for)
    let d = to > hi ? hi - to : 0;
    if (from + d < lo) d = lo - from;
    return d;
  };
  const seenRight = view.right - Math.max(0, Math.min(cover, view.right - view.left));
  return {
    dx: slide(view.left + margin, seenRight - margin, menu.left, menu.right),
    dy: slide(view.top + margin, view.bottom - margin, menu.top, menu.bottom),
  };
}
