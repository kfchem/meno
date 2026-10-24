/** Where Meno's own controls put what they open (src/ui/controls). */

/** How far below (or above) its button a list opens, and from the window's edges, in px. */
export const GAP = 4;
export const EDGE = 8;

type Box = { left: number; top: number; bottom: number; width: number; height: number };

/**
 * Where an open list goes: under its button, as wide at least, its left
 * edge with the button's; above it where the window has no room below and
 * has above; never past the window's sides.
 */
export function placeList(button: Box, list: Pick<Box, "width" | "height">, window: { width: number; height: number }): { left: number; top: number; minWidth: number } {
  const below = button.bottom + GAP;
  const above = button.top - GAP - list.height;
  const top = below + list.height > window.height - EDGE && above > EDGE ? above : below;
  return { left: Math.max(EDGE, Math.min(button.left, window.width - list.width - EDGE)), top, minWidth: button.width };
}

/** Whether a press is away from all of these - neither in an open list nor on its button - and so closes it. */
export function pressedAway(target: unknown, parts: readonly ({ contains: (node: never) => boolean } | null | undefined)[]): boolean {
  return !parts.some((p) => p?.contains(target as never));
}
