/**
 * A very large drawing as the view zooms - a trial of two ways (the
 * maintainer, 2026-10-13), chosen in Settings (`pointer.largeZoom`), to be
 * chosen between by their numbers:
 *
 * - "settle": the drawing laid out once the zoom stops, not at every step
 *   of it - its lines and their round caps kept as wide on the screen as a
 *   layout at the zoom would have them meanwhile (`lineWidening`, drawn so
 *   by Bonds2D and JoinCaps2D), the rest scaled with the view;
 * - "picture": the drawing held as a picture of it - the view and a margin
 *   round it - scaled with the view, and drawn sharp, laid out at the zoom,
 *   once it stops, fading in over it (components/LargeZoom2D); what the
 *   pointer lights and what is selected drawn live over it.
 *
 * Either only for a very large drawing (`zoomedLarge`); any other is laid
 * out at every step, as ever ("exact").
 */
import { lineHalfOf, type LayoutOptions } from "../../../../lib/chem/layout2d";
import { LARGE_ATOMS } from "./largeDrawing";

/** How long the view stays at one zoom before a very large drawing is laid out at it, in ms: past the gap between a wheel's notches. */
export const SETTLE_MS = 150;

/** How far round the view a picture of the drawing reaches, on each side, as a share of the view's width and height. */
export const PICTURE_MARGIN = 0.25;

/** Most pixels a picture of the drawing is drawn in, the margin with it: larger, it is drawn coarser. */
export const PICTURE_MOST_PIXELS = 12e6;

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
