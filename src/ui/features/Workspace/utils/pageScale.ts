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
 * fade, as a factor of the scale: from `WORDS_LEAST` × 1.15 down to
 * `WORDS_LEAST` / 1.15, about four notches of a mouse wheel in all (each
 * e^(40 px × 0.0016) = 1.066 times - PanZoom2D), so that they come and go
 * with the zoom, never at once. Words go out over the whole band as what
 * stands for them - a step's card's large icons - comes in over the same
 * band (the maintainer, 2026-10-25: a zoom stopped in the band's middle
 * left a card all but empty, the words gone and the icons not yet come).
 */
export const WORDS_FADE = 1.15;

/** How far through `WORDS_FADE`'s band from `WORDS_LEAST` the scale is at `zoom`, evenly in the zoom's own steps: 1 at its top, 0 at `WORDS_LEAST`, -1 at its foot, beyond them as far. */
const throughFade = (zoom: number) => Math.log(pageScale(zoom) / WORDS_LEAST) / Math.log(WORDS_FADE);

/** How far down the band the scale is at `zoom`: 0 at its top and above, 1 at its foot and below. */
const downFade = (zoom: number) => Math.min(1, Math.max(0, (1 - throughFade(zoom)) / 2));

/**
 * How much of the words of chips and cards on the page is shown at `zoom`,
 * 0 to 1: all where they read, none where they are too small, faded with
 * the zoom between, over the whole of `WORDS_FADE`'s band. Words and what
 * stands for them (`standInShown`) cross over as a power-keeping cross-fade
 * does - a quarter turn's cosine and sine, the squares of the two always
 * one - so that, laid one over the other, together they are never less than
 * 0.91 there (1 - (1 - words)(1 - stand-in), least at the band's middle,
 * where each is 0.71).
 */
export const wordsShown = (zoom: number): number => Math.cos((Math.PI / 2) * downFade(zoom));

/** How much of what stands for those words where they are too small - a step's card's large icons - is shown at `zoom`, 0 to 1: none where the words read, all where they are too small, coming in over the band as the words go (`wordsShown`). */
export const standInShown = (zoom: number): number => Math.sin((Math.PI / 2) * downFade(zoom));
