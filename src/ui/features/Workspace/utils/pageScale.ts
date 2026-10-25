/**
 * The page's scale, for what is drawn on it in HTML (docs/WORKSPACE.md,
 * *Chips on the page*): chips, sets and steps' cards are as large as the
 * page draws them - a page pixel at the zoom a canvas opens at is a pixel on
 * the screen - and their words go where they would be too small to read.
 */
import type { CSSProperties } from "react";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";

/**
 * What makes a chip as large as the page draws it (`--page`, components/
 * PageScale): laid out at that size - its letters set at it - not drawn at
 * one size and scaled after by a transform, which the Mac's WebView draws
 * once and magnifies, its words soft up close (found 2026-10-25). Its
 * lengths, its widths measured, stay in page pixels.
 */
export const PAGE_SIZED: CSSProperties = { zoom: "var(--page, 1)" };

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
 * How far either side of `WORDS_LEAST` words and what stands for them
 * fade, as a factor of the scale: words out from `WORDS_LEAST` × 1.15 to
 * `WORDS_LEAST`, what stands for them - a step's card's large icons - in
 * from there to `WORDS_LEAST` / 1.15; about four notches of a mouse wheel
 * in all (each e^(40 px × 0.0016) = 1.066 times - PanZoom2D), so that they
 * come and go with the zoom, never at once, and never both at once.
 */
export const WORDS_FADE = 1.15;

/** How far through `WORDS_FADE`'s band from `WORDS_LEAST` the scale is at `zoom`, evenly in the zoom's own steps: 1 at its top, 0 at `WORDS_LEAST`, -1 at its foot, beyond them as far. */
const throughFade = (zoom: number) => Math.log(pageScale(zoom) / WORDS_LEAST) / Math.log(WORDS_FADE);

/** How much of the words of chips and cards on the page is shown at `zoom`, 0 to 1: all where they read, none where they are too small, faded with the zoom between (`WORDS_FADE`'s upper half). */
export const wordsShown = (zoom: number): number => Math.min(1, Math.max(0, throughFade(zoom)));

/** How much of what stands for those words where they are too small - a step's card's large icons - is shown at `zoom`, 0 to 1: none while any of the words are, coming in with the zoom after (`WORDS_FADE`'s lower half). */
export const standInShown = (zoom: number): number => Math.min(1, Math.max(0, -throughFade(zoom)));
