/** Where Meno's own controls put what they open (src/ui/controls). */

/** How far below (or above) its button a list opens, and from the window's edges, in px. */
export const GAP = 4;
export const EDGE = 8;

type Box = { left: number; top: number; bottom: number; width: number; height: number };

/**
 * Where an open list goes, and how tall it may be: under its button, as wide
 * at least, its left edge with the button's; above it where it fits there
 * and not below; where it fits on neither side, on the side with the more
 * room, held to that room (and scrolled); never past the window's sides.
 */
export function placeList(
  button: Box,
  list: Pick<Box, "width" | "height">,
  window: { width: number; height: number },
): ListPlace {
  const below = button.bottom + GAP;
  const roomBelow = window.height - EDGE - below;
  const roomAbove = button.top - GAP - EDGE;
  const under = list.height <= roomBelow || (list.height > roomAbove && roomBelow >= roomAbove);
  const room = under ? roomBelow : roomAbove;
  const top = under ? below : button.top - GAP - Math.min(list.height, roomAbove);
  return { left: Math.max(EDGE, Math.min(button.left, window.width - list.width - EDGE)), top, minWidth: button.width, maxHeight: room };
}

/**
 * The most rows an open list shows: nine whole, so that a list of nine is
 * never cut by its own padding and scrolled a few pixels; past nine, half the
 * tenth, so that a list cut short shows there is more.
 */
export const LIST_ROWS = 9.5;

/** How many of its rows a list of `count` shows: all of them, up to `LIST_ROWS`. */
export function rowsShown(count: number): number {
  return Math.min(count, LIST_ROWS);
}

/**
 * An open list's tallest, in CSS: its rows (`h-8`, 2rem each), the padding
 * above them (`py-1`: the padding below them is under the last row, out of
 * sight until it is scrolled to) and the line round it - so that half the
 * tenth row shows, no more.
 */
export const LIST_MOST_HEIGHT = `calc(${LIST_ROWS} * 2rem + 0.25rem + 2px)`;

/** Whether a press is away from all of these - neither in an open list nor on its button - and so closes it. */
export function pressedAway(target: unknown, parts: readonly ({ contains: (node: never) => boolean } | null | undefined)[]): boolean {
  return !parts.some((p) => p?.contains(target as never));
}

/** Where an open list has been put (placeList), once it has. */
export type ListPlace = { left: number; top: number; minWidth: number; maxHeight: number };

/**
 * An open list's style: where it was put, held to the room there; not yet
 * put - as it opens, each time - off screen at its own height, nine and a
 * half rows at most, so that it is measured as it is and never as the room
 * it was last held to.
 */
export function listStyle(place: ListPlace | null): { left: number; top: number; minWidth?: number; maxHeight: string } {
  return place
    ? { left: place.left, top: place.top, minWidth: place.minWidth, maxHeight: `min(${LIST_MOST_HEIGHT}, ${place.maxHeight}px)` }
    : { left: -9999, top: -9999, maxHeight: LIST_MOST_HEIGHT };
}
