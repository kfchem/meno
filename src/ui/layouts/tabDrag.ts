/**
 * How far a tab laid at `left`, `width` wide (on the screen, in pixels) may
 * be dragged, as far as it is asked to (`x`): no further than the room's
 * ends either way.
 */
export function dragWithin(x: number, left: number, width: number, room: { left: number; right: number }): number {
  return Math.min(Math.max(x, room.left - left), room.right - (left + width));
}

/**
 * Where a strip scrolled sideways to `scrollLeft`, `width` across, is to be
 * scrolled to show a tab at `left` (from the strip's start), `tab` wide, and
 * `margin` either side of it (the chosen tab's corners): as little as shows
 * it whole - its start, where it is cut off on the left, else its end - or
 * nowhere (null), shown already. Never before the strip's start.
 */
export function scrollToShow(left: number, tab: number, scrollLeft: number, width: number, margin = 0): number | null {
  const from = left - margin;
  const to = left + tab + margin;
  if (from < scrollLeft) return Math.max(0, from);
  if (to > scrollLeft + width) return Math.max(0, Math.min(from, to - width));
  return null;
}

/**
 * A tab pressed: chosen, always - a press begins no drag (one begins only
 * as the pointer then moves), so none can be under way as it comes. A drag
 * whose end never came - the button let go outside the window, over another
 * program - is over by then: once left marked as under way, it had every
 * tab pressed after it refused, with nothing said.
 */
export function pressTab(dragging: { current: boolean }, choose: () => void): void {
  dragging.current = false;
  choose();
}
