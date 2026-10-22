/** How far in from the canvas's sides a molecule's chip stays, in pixels. */
export const EDGE = 8;

/**
 * How far a chip standing from `left` to `right` slides left to stay within
 * the canvas, `EDGE` in from its sides (negative: right): past the right
 * edge, left; past the left, right; wider than the canvas, its left edge
 * kept in - where its words begin. None, where it is within.
 */
export function asideOf(left: number, right: number, areaLeft: number, areaRight: number): number {
  let aside = right + EDGE > areaRight ? right + EDGE - areaRight : left - EDGE < areaLeft ? left - EDGE - areaLeft : 0;
  if (left - aside < areaLeft + EDGE) aside = left - areaLeft - EDGE;
  return Math.round(aside);
}
