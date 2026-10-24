/**
 * The page's scale, for what is drawn on it in HTML (docs/WORKSPACE.md,
 * *Chips on the page*): chips, sets and steps' cards are as large as the
 * page draws them - a page pixel at the zoom a canvas opens at is a pixel on
 * the screen - and their words go where they would be too small to read.
 */
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";

/** A page pixel, in world units: a bond is 48 of them, as a canvas opens in ACS 1996 style. */
export const PAGE_PX = NOMINAL_BOND_LENGTH / 48;
/** The least scale words on the page's chips and cards are read at - their smallest, 11 px, about 8 px on the screen: smaller, they are left out. */
export const WORDS_LEAST = 0.75;

/** How many screen pixels a page pixel is drawn as, at `zoom` (the canvas's orthographic camera's). */
export const pageScale = (zoom: number) => zoom * PAGE_PX;

/** The scales a molecule's notes are drawn at, as the page is between them (Molecule3DView): never smaller than three quarters, nor larger than half as large again. */
export const NOTES_SCALE = { least: 0.75, most: 1.5 } as const;

/** Whether the words of chips and cards on the page are too small to read at `zoom`. */
export const wordsTooSmall = (zoom: number) => pageScale(zoom) < WORDS_LEAST;

/**
 * How far either side of `WORDS_LEAST` words fade, as a factor of the
 * scale: in from `WORDS_LEAST` / 1.15 to `WORDS_LEAST` × 1.15, about four
 * notches of a mouse wheel (each e^(40 px × 0.0016) = 1.066 times -
 * PanZoom2D), so that they come and go with the zoom, never at once.
 */
export const WORDS_FADE = 1.15;

/** How much of the words of chips and cards on the page is shown at `zoom`, 0 to 1: all where they read, none where they are too small, faded with the zoom between (`WORDS_FADE`). */
export function wordsShown(zoom: number): number {
  const t = Math.min(1, Math.max(0, (Math.log(pageScale(zoom) / WORDS_LEAST) + Math.log(WORDS_FADE)) / (2 * Math.log(WORDS_FADE))));
  return t * t * (3 - 2 * t);
}
