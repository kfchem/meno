/**
 * The page's scale, for what is drawn on it in HTML (docs/WORKSPACE.md,
 * *Chips on the page*): chips, sets and steps' cards are as large as the
 * page draws them - a page pixel at the zoom a canvas opens at is a pixel on
 * the screen - at every zoom.
 */
import type { CSSProperties } from "react";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";

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

/** A length on the page's HTML, `px` page pixels, at the page's scale as it is shown now: laid out, and while the zoom moves (`pageSized`). */
export const pagePx = (px: number) => `calc(${px}px * var(--page, 1) * var(--page-k, 1))`;

/** A page pixel, in world units: a bond is 48 of them, as a canvas opens in ACS 1996 style. */
export const PAGE_PX = NOMINAL_BOND_LENGTH / 48;
/** How many screen pixels a page pixel is drawn as, at `zoom` (the canvas's orthographic camera's). */
export const pageScale = (zoom: number) => zoom * PAGE_PX;

/** A length of `px` page pixels, in world units: as large on the page at every zoom - a handle's, an outline's, a name's - growing and shrinking with it on the screen. */
export const pageLength = (px: number) => px * PAGE_PX;

/**
 * How far round a handle a press takes it, in world units at `zoom`: the
 * hand's reach, `screenPx` on the screen at every zoom, and never less than
 * the handle as it is drawn (`drawn`, world units) - so that one drawn small
 * on a page far out is still taken from as far as ever, and one drawn large
 * up close is taken all over.
 */
export const reachAt = (screenPx: number, zoom: number, drawn: number) => Math.max(screenPx / Math.max(zoom, 1e-6), drawn);


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

/** How far the hair under a device pixel goes, as a share, before it is written again (`hairWritten`): a quarter - a line a quarter thicker is not told from it. */
export const HAIR_STEP = 1.25;

/**
 * How wide a line of the page's cards and sets is drawn, in the layer's own
 * pixels - a page pixel, the layer scaled with the page - at `zoom` on a
 * screen of `dpr` device pixels to its own: one; thinner on the screen than a
 * device pixel, a device pixel wide, and as much fainter (its ink, the
 * inverse of what is returned: pageGl/units `thinLine`). And whether it is
 * written again from `written`: zoomed in, it is one and stays one - the
 * cards never laid out again for it; thinner, as the zoom goes a quarter
 * from it, and back to one as it comes out from under a device pixel.
 */
export function hairWritten(written: number, zoom: number, dpr: number): number | null {
  const want = Math.max(1, 1 / (Math.max(zoom, 1e-9) * PAGE_PX * Math.max(dpr, 1)));
  if (!(written > 0)) return want;
  if (want === 1) return written === 1 ? null : 1;
  return Math.abs(Math.log(want / written)) >= Math.log(HAIR_STEP) ? want : null;
}

/** What the page's HTML is told of the zoom at a frame (components/PageScale): the zoom it is laid out at (`laid`) and its scale there (`page`), and how far it is scaled from that (`k`) until it is laid out again. */
export type PageTold = { laid: number; page: number; k: number };

/**
 * What the page's HTML is told at a frame, the zoom laid out at being
 * `laid` (NaN, none yet): standing still (`still`, as it was the frame
 * before), laid out at it, nothing scaled; moving, still laid out where it
 * was, and scaled by how far it has gone from there (`pageSized`).
 */
export function pageTold(laid: number, zoom: number, still: boolean): PageTold {
  if (still || !(laid > 0)) return { laid: zoom, page: pageScale(zoom), k: 1 };
  return { laid, page: pageScale(laid), k: zoom / laid };
}

/** What the page's HTML layer was last told (`pageLayerStep`): the zoom its chips are laid out at, and how far they are scaled from it. */
export type PageLayerState = { laid: number; k: number };

/**
 * What the page's HTML layer is told at a frame of zoom `zoom` (components/
 * PageScale), it having been told `was` (none: a layer not told yet): each
 * custom property that changes - `--page` only where it is laid out again,
 * `--page-k` as it is scaled (`pageTold`) - and whether a frame more
 * is asked for: while it is scaled, so that the canvas, drawn only when asked,
 * draws the frame the zoom stands still at and lays it out there.
 */
export function pageLayerStep(was: PageLayerState | null, zoom: number, still: boolean): { now: PageLayerState; writes: [string, string][]; again: boolean } {
  const told = pageTold(was ? was.laid : NaN, zoom, still);
  const writes: [string, string][] = [];
  if (!was || told.laid !== was.laid) writes.push(["--page", told.page.toFixed(4)]);
  if (!was || told.k !== was.k) writes.push(["--page-k", told.k.toFixed(4)]);
  return { now: { laid: told.laid, k: told.k }, writes, again: told.k !== 1 };
}
