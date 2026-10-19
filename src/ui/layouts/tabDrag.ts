/**
 * How far a tab laid at `left`, `width` wide (on the screen, in pixels) may
 * be dragged, as far as it is asked to (`x`): no further than the room's
 * ends either way.
 */
export function dragWithin(x: number, left: number, width: number, room: { left: number; right: number }): number {
  return Math.min(Math.max(x, room.left - left), room.right - (left + width));
}
