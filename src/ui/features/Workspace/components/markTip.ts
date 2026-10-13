/**
 * Where what a mark says goes (ChemMarks2D): under the mark, its middle
 * under the mark's - but moved along, or put over the mark, where it would
 * run out of what can be seen of the canvas.
 */

/** A box on the screen, in CSS pixels. */
export type ScreenBox = { left: number; top: number; right: number; bottom: number };

/** How far in from the edges of what can be seen the words keep, and how far under the mark - or over it - they lie, in CSS pixels. */
export const TIP_MARGIN_PX = 6;
export const TIP_GAP_PX = 6;

/** Where words `width` by `height` lie as first put: under `mark`, their middle under its middle. */
export function tipUnder(mark: ScreenBox, width: number, height: number): ScreenBox {
  const mid = (mark.left + mark.right) / 2;
  const top = mark.bottom + TIP_GAP_PX;
  return { left: mid - width / 2, top, right: mid + width / 2, bottom: top + height };
}

/**
 * How the words, `tip` where they lie as first put - under the mark, their
 * middle under its middle - move to lie within `room`, `margin` in from its
 * edges: along by `dx`, and over the mark (`above`) where there is no room
 * under it and there is over it. Wider than the room, they keep their start
 * in it.
 */
export function tipPlace(tip: ScreenBox, mark: ScreenBox, room: ScreenBox, margin = TIP_MARGIN_PX): { dx: number; above: boolean } {
  let dx = 0;
  if (tip.right > room.right - margin) dx = room.right - margin - tip.right;
  if (tip.left + dx < room.left + margin) dx = room.left + margin - tip.left;
  const height = tip.bottom - tip.top;
  const gap = tip.top - mark.bottom;
  const above = tip.bottom > room.bottom - margin && mark.top - gap - height >= room.top + margin;
  return { dx, above };
}
