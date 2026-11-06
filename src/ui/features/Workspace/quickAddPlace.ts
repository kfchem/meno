/** How far from the point Quick Add was opened at it stands, up and to the right, in px. */
const OFF = 14;

/**
 * Where Quick Add stands, opened at (x, y) in a canvas `within` so large:
 * `first` its size as it opens, `sizes` its size with each of its panels
 * open. It opens up and to the right of the point, clear of it - below it
 * where there is no room above, to its left where its largest would not fit
 * to the right - and is held by its top left corner, chosen once, for its
 * largest, so that a panel opening below its row grows down and to the
 * right and nothing in it moves. A panel too wide for that - one that
 * cannot stand beside the point on either side, or more than twice as wide
 * as its row: Meno's own steps, thirty in a row - is left out of the
 * choice: held for it, Quick Add stood far from the point, wherever the
 * canvas was double-clicked (v0.1.22). It opens at the point, and that
 * panel, opened, is eased back within the canvas (./QuickAdd). Its left
 * and top; and the corner it rises from, the one nearest the point.
 */
export function placeQuickAdd(
  x: number,
  y: number,
  within: { width: number; height: number },
  first: { width: number; height: number },
  sizes: readonly { width: number; height: number }[],
): { left: number; top: number; origin: string } {
  // (the panels it is held for: those that can stand beside the point, on one side or the other, no more than twice as wide as its row)
  const beside = sizes.filter((s) => s.width <= 2 * first.width && (x + OFF + s.width <= within.width - 4 || x - OFF - s.width >= 4));
  const most = { width: Math.max(first.width, ...beside.map((s) => s.width)), height: Math.max(first.height, ...beside.map((s) => s.height)) };
  const right = x + OFF + most.width <= within.width - 4 || x - OFF - most.width < 4;
  const above = y - OFF - first.height >= 4;
  return {
    left: right ? Math.max(4, Math.min(x + OFF, within.width - 4 - most.width)) : x - OFF - most.width,
    // (and high enough in the canvas, as large as it grows, where it can be)
    top: Math.max(4, Math.min(above ? y - OFF - first.height : y + OFF, within.height - 4 - most.height)),
    origin: `${above ? "bottom" : "top"} ${right ? "left" : "right"}`,
  };
}
