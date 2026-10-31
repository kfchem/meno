/**
 * The page's scale, for what is drawn on it in HTML (docs/WORKSPACE.md,
 * *Chips on the page*): chips, sets and steps' cards are as large as the
 * page draws them - a page pixel at the zoom a canvas opens at is a pixel on
 * the screen - and their words go where they would be too small to read.
 */
import type { CSSProperties } from "react";
import { switchedAt } from "./zoomSwitch";
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

/**
 * Whether the words of chips and cards on the page are read at `zoom`, they
 * having been (`was`) or not: from a little above `WORDS_LEAST`, and no
 * longer from a little below it (utils/zoomSwitch `switchedAt`). Not faded
 * with the zoom: switched there, and faded over a short time - the words
 * out as what stands for them, a step's card's large icons, comes in, or
 * back (App.css `.meno-words`, `--words`).
 */
export const wordsReadAt = (zoom: number, was: boolean): boolean => switchedAt(was, pageScale(zoom), WORDS_LEAST);

/** How far the zoom goes, as a share, before what the page's HTML is sized by is written again while it moves (`zoomWritten`). */
export const ZOOM_WRITTEN_STEP = 0.005;

/**
 * Whether the zoom is written again to what the page's HTML is sized by -
 * `--page`, which chips are laid out at, and `--hair`, which cards' lines
 * are as wide as - from the one last written (`written`): each write lays
 * out every chip and card on the page again (some 80 ms on a page of sixty
 * steps), so while the zoom moves only once it has gone `ZOOM_WRITTEN_STEP`
 * from it - half a pixel on a chip a hundred wide, not seen - and, once it
 * stands still (`still`, as it was the frame before), as it is.
 */
export const zoomWritten = (written: number, zoom: number, still: boolean): boolean =>
  zoom !== written && (still || !(Math.abs(Math.log(zoom / written)) < ZOOM_WRITTEN_STEP));
