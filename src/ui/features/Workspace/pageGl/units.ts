/**
 * The page's own lengths, for what WebGL draws on it in place of HTML
 * (docs/WORKSPACE.md, *Drawn by WebGL*): a page pixel is a screen pixel at
 * the zoom a canvas opens at (utils/pageScale `PAGE_PX`), so what is drawn in
 * page pixels grows and shrinks with the page - its lines too - never thinner
 * than a pixel of the screen's own, where it would shimmer away.
 */
import { PAGE_PX } from "../utils/pageScale";

/** A length of `px` page pixels, in world units. */
export const pagePx = (px: number) => px * PAGE_PX;

/**
 * A line `widthPx` page pixels wide as it is drawn at `zoom` (world units a
 * screen pixel is 1 / zoom of) on a screen of `dpr` device pixels to its own:
 * in world units, never under one device pixel.
 */
export function lineWidth(widthPx: number, zoom: number, dpr: number): number {
  return Math.max(pagePx(widthPx), 1 / (Math.max(zoom, 1e-9) * Math.max(dpr, 1)));
}

/**
 * A control's size - a port, a handle to grab - as a hand needs it, not as
 * the page draws it: `screenPx` on the screen where the page is near, never
 * more than `mostPagePx` page pixels zoomed out, nor than `share` of `of`
 * page pixels (a sixth of its set's height, say) - so it stays as large as a
 * pointer can take hold of, and no larger than what it belongs to.
 */
export type Control = { screenPx: number; mostPagePx: number; leastOfPx?: { of: number; share: number } };

/** The most a control is drawn at, zoomed out, in world units (`Control`). */
export function controlMost(c: Control): number {
  return Math.min(pagePx(c.mostPagePx), c.leastOfPx ? pagePx(c.leastOfPx.of * c.leastOfPx.share) : Infinity);
}

/** A control's size at `zoom`, in world units (`Control`). */
export function controlSize(c: Control, zoom: number): number {
  return Math.min(c.screenPx / Math.max(zoom, 1e-9), controlMost(c));
}

/**
 * The line round a control `size` world units across, at `zoom`: a screen
 * pixel, a fifth of it where it is tiny, never under a device pixel - as a
 * port's ring was drawn in HTML (workflow/StepCard `Port`).
 */
export function controlLine(size: number, zoom: number, dpr: number): number {
  return Math.max(Math.min(1 / Math.max(zoom, 1e-9), size / 5), 1 / (Math.max(zoom, 1e-9) * Math.max(dpr, 1)));
}
