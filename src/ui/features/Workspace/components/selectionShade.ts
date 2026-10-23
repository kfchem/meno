import { ALPHA, COLORS } from "../../../theme/colors";
import { easeOut } from "../../../theme/motion";
import { ATOM_HOVER_RING_RADIUS_RATIO } from "../constants";

/** How strongly what is selected is shaded, against the hover highlight's. */
export const SHADE = 0.45;

/**
 * The highlight laid over the white page at `alpha`, as one opaque colour:
 * where an atom's shading meets its bonds' it is no darker than elsewhere.
 */
export function overWhite(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(255 + (c - 255) * alpha);
  const [r, g, b] = [mix((n >> 16) & 255), mix((n >> 8) & 255), mix(n & 255)];
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** What is selected is shaded in this: the highlight, lightly, opaque. */
export const SELECTION_SHADE = overWhite(COLORS.highlight, ALPHA.highlight * SHADE);

/**
 * A selected part's shade's size, as a share of a bond's length: an atom's
 * disc's radius, and a bond's band's width against that radius - the one
 * measure for the canvas's selection (SelectionShade2D) and a structure
 * picked from a PDF (components/pdfMarks), so the two cannot drift.
 */
export const DISC_OF_BOND = ATOM_HOVER_RING_RADIUS_RATIO;
export const BAND_OF_DISC = 1.1;

/** A structure of a PDF under the pointer, not picked, is shaded as a selection is, at half its strength; picked and under the pointer, a little more than picked. */
export const POINTED_SHADE = overWhite(COLORS.highlight, ALPHA.highlight * SHADE * 0.5);
export const PICKED_POINTED_SHADE = overWhite(COLORS.highlight, ALPHA.highlight * SHADE * 1.3);

/**
 * How long an atom's shade takes to spread from it, the atom clicked - and
 * to draw back into it, the click taken back by a double-click's second
 * (docs/EDITOR-2D.md, *How it is worked*), in ms.
 */
export const SPREAD_MS = 160;
export const DRAW_BACK_MS = 140;

/** How far an atom's shade has spread, `t` ms after it was clicked - or drawn back, taken back: 0 to 1. */
export function clickSpread(t: number, back: boolean): number {
  return back ? 1 - easeOut(Math.min(1, Math.max(0, t / DRAW_BACK_MS))) : easeOut(Math.min(1, Math.max(0, t / SPREAD_MS)));
}
