/**
 * The page's scale, for what is drawn on it in HTML (docs/WORKSPACE.md,
 * *Chips on the page*): chips, sets and steps' cards are as large as the
 * page draws them - a page pixel at the zoom a canvas opens at is a pixel on
 * the screen - and their words go where they would be too small to read.
 */
import type { CSSProperties } from "react";
import { switchedAt } from "./zoomSwitch";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";

/** The scales a molecule's notes are drawn at, as the page is between them (Molecule3DView): never smaller than three quarters, nor larger than half as large again. */
export const NOTES_SCALE = { least: 0.75, most: 1.5 } as const;

/** Where a chip hangs from, which it grows and shrinks about while the zoom moves (`pageSized`): its top's middle, its middle, its foot's middle. */
export type HungFrom = "top" | "middle" | "foot";

const ORIGIN: Record<HungFrom, string> = { top: "50% 0", middle: "50% 50%", foot: "50% 100%" };

/**
 * What makes a chip as large as the page draws it (`--page`, components/
 * PageScale): laid out at that size - its letters set at it - not drawn at
 * one size and scaled after by a transform, which the Mac's WebView draws
 * once and magnifies, its words soft up close (found 2026-10-25). Its
 * lengths, its widths measured, stay in page pixels.
 *
 * But laid out again only once the zoom stands still: while it moves, each
 * chip is scaled from where it hangs (`--page-k`, how far the zoom has gone
 * from the one it was laid out at, `pageTold`), as a picture of itself -
 * laying out every chip on a page at every frame of a zoom held a large
 * page's frames to a second and more (some 14 700 elements on a page of
 * 283 molecules in 3D, 2026-11-05). Soft for a moment as it moves, it is
 * set crisp again where the zoom stops, at the size it was shown at.
 */
export const pageSized = (from: HungFrom): CSSProperties => ({ zoom: "var(--page, 1)", transform: "scale(var(--page-k, 1))", transformOrigin: ORIGIN[from] });

/**
 * A molecule's or a figure's notes, drawn as the page is between `NOTES_SCALE`'s
 * two scales: laid out at that size once the zoom stands still, and scaled
 * from where they hang while it moves (`--notes-k`), as chips are (`pageSized`).
 */
export const notesSized = (from: HungFrom): CSSProperties => ({
  zoom: `clamp(${NOTES_SCALE.least}, var(--page, 1), ${NOTES_SCALE.most})`,
  transform: "scale(var(--notes-k, 1))",
  transformOrigin: ORIGIN[from],
});

/** A length on the page's HTML, `px` page pixels, at the page's scale as it is shown now: laid out, and while the zoom moves (`pageSized`). */
export const pagePx = (px: number) => `calc(${px}px * var(--page, 1) * var(--page-k, 1))`;

/** A page pixel, in world units: a bond is 48 of them, as a canvas opens in ACS 1996 style. */
export const PAGE_PX = NOMINAL_BOND_LENGTH / 48;
/** The least scale words on the page's chips and cards are read at - their smallest, 11 px, about 8 px on the screen: smaller, they are left out. */
export const WORDS_LEAST = 0.75;

/** How many screen pixels a page pixel is drawn as, at `zoom` (the canvas's orthographic camera's). */
export const pageScale = (zoom: number) => zoom * PAGE_PX;


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
 * Whether the zoom is written again to what the page's cards are sized
 * by - `--hair`, which their lines are as wide as - from the one last
 * written (`written`): each write lays out every card on the page again
 * (some 80 ms on a page of sixty steps), so while the zoom moves only once
 * it has gone `ZOOM_WRITTEN_STEP` from it - half a pixel on a card two
 * hundred wide, not seen - and, once it stands still (`still`, as it was
 * the frame before), as it is. (Chips: `pageTold`.)
 */
export const zoomWritten = (written: number, zoom: number, still: boolean): boolean =>
  zoom !== written && (still || !(Math.abs(Math.log(zoom / written)) < ZOOM_WRITTEN_STEP));

/** What the page's HTML is told of the zoom at a frame (components/PageScale): the zoom it is laid out at (`laid`) and its scale there (`page`), and how far it is scaled from that - chips (`k`) and notes (`notesK`) - until it is laid out again. */
export type PageTold = { laid: number; page: number; k: number; notesK: number };

const notesAt = (page: number) => Math.min(NOTES_SCALE.most, Math.max(NOTES_SCALE.least, page));

/**
 * What the page's HTML is told at a frame, the zoom laid out at being
 * `laid` (NaN, none yet): standing still (`still`, as it was the frame
 * before), laid out at it, nothing scaled; moving, still laid out where it
 * was, and scaled by how far it has gone from there (`pageSized`).
 */
export function pageTold(laid: number, zoom: number, still: boolean): PageTold {
  if (still || !(laid > 0)) return { laid: zoom, page: pageScale(zoom), k: 1, notesK: 1 };
  return { laid, page: pageScale(laid), k: zoom / laid, notesK: notesAt(pageScale(zoom)) / notesAt(pageScale(laid)) };
}

/** What the page's HTML layer was last told (`pageLayerStep`): the zoom its chips are laid out at, how far they are scaled from it, and whether its words are read. */
export type PageLayerState = { laid: number; k: number; notesK: number; read: boolean };

/**
 * What the page's HTML layer is told at a frame of zoom `zoom` (components/
 * PageScale), it having been told `was` (none: a layer not told yet): each
 * custom property that changes - `--page` only where it is laid out again,
 * `--page-k` and `--notes-k` as they are scaled (`pageTold`), `--words` and
 * `--stand-in` as its words switch (`wordsReadAt`) - and whether a frame more
 * is asked for: while it is scaled, so that the canvas, drawn only when asked,
 * draws the frame the zoom stands still at and lays it out there.
 */
export function pageLayerStep(was: PageLayerState | null, zoom: number, still: boolean): { now: PageLayerState; writes: [string, string][]; wordsSmall?: boolean; again: boolean } {
  const told = pageTold(was ? was.laid : NaN, zoom, still);
  const read = wordsReadAt(zoom, was ? was.read : pageScale(zoom) >= WORDS_LEAST);
  const writes: [string, string][] = [];
  if (!was || told.laid !== was.laid) writes.push(["--page", told.page.toFixed(4)]);
  if (!was || told.k !== was.k) writes.push(["--page-k", told.k.toFixed(4)]);
  if (!was || told.notesK !== was.notesK) writes.push(["--notes-k", told.notesK.toFixed(4)]);
  const switched = !was || read !== was.read;
  if (switched) writes.push(["--words", read ? "1" : "0"], ["--stand-in", read ? "0" : "1"]);
  return { now: { laid: told.laid, k: told.k, notesK: told.notesK, read }, writes, ...(switched ? { wordsSmall: !read } : {}), again: told.k !== 1 };
}
