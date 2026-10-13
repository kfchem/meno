/**
 * A drawing as the view zooms (the maintainer, 2026-10-13, chosen from a
 * trial of two ways, #295): laid out again as the view moves a hundredth
 * from the zoom it was laid out at (`nearZoom`) - the last of a wheel's zoom,
 * in steps too small to see, lays nothing out again - and a very large one
 * (`zoomedLarge`) only once the view has stayed within a hundredth of one
 * zoom for `SETTLE_MS`, not at every step: its lines and their round caps
 * kept as wide on the screen meanwhile as a layout at the zoom would have
 * them (`lineWidening`, drawn so by Bonds2D and JoinCaps2D), the rest scaled
 * with the view (components/DrawnLayout).
 */
import { lineHalfOf, type LayoutOptions } from "../../../../lib/chem/layout2d";
import { LARGE_ATOMS } from "./largeDrawing";

/** How long the view stays at one zoom before a very large drawing is laid out at it, in ms: past the gap between a wheel's notches. */
export const SETTLE_MS = 150;

/**
 * How near, as a share, a zoom is to another to count as the same: a wheel's
 * zoom eases to its end, the last of it in steps too small to see for most
 * of a second (lib/input/wheel `zoomTaken`), and the drawing does not wait
 * for those.
 */
export const SETTLE_NEAR = 0.01;

/** Whether two zooms are near enough to count as one (`SETTLE_NEAR`). */
export const nearZoom = (a: number, b: number): boolean => Math.abs(Math.log(a / b)) < SETTLE_NEAR;

/** Whether a drawing of so many atoms is zoomed as a very large one: past the mark a very large drawing in 3D is drawn lighter at. */
export const zoomedLarge = (atoms: number): boolean => atoms > LARGE_ATOMS;

/**
 * How much wider a line laid out at zoom `laid` is drawn at zoom `now` to be
 * as wide as one laid out at `now`: 1 where its width is the drawing's own,
 * scaling with the view; otherwise as far as the least width a line is drawn
 * at on the screen keeps it (lib/chem/layout2d `lineHalfOf`).
 */
export function lineWidening(opts: LayoutOptions, laid: number, now: number): number {
  const was = lineHalfOf(opts, laid);
  return was > 0 ? lineHalfOf(opts, now) / was : 1;
}
