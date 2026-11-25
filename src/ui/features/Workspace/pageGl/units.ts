/**
 * The page's own lengths, for what WebGL draws on it in place of HTML
 * (docs/WORKSPACE.md, *Drawn by WebGL*): a page pixel is a screen pixel at
 * the zoom a canvas opens at (utils/pageScale `PAGE_PX`), so what is drawn in
 * page pixels grows and shrinks with the page - its lines too: one thinner
 * than a device pixel is drawn a device pixel wide and as much fainter
 * (`thinLine`).
 */
import { PAGE_PX } from "../utils/pageScale";

/** A length of `px` page pixels, in world units. */
export const pagePx = (px: number) => px * PAGE_PX;

/** One device pixel at `zoom` (world units a screen pixel is 1 / zoom of) on a screen of `dpr` device pixels to its own, in world units. */
export const devicePx = (zoom: number, dpr: number) => 1 / (Math.max(zoom, 1e-9) * Math.max(dpr, 1));

/**
 * A line `width` world units wide as it is drawn where a device pixel is
 * `device` of them: as wide as it is - and, thinner than a device pixel,
 * one device pixel wide and as much fainter as it is thinner (`ink`, its
 * share of the device pixel), as a picture of it made smaller looks.
 */
export function thinLine(width: number, device: number): { width: number; ink: number } {
  return width > 0 && width < device ? { width: device, ink: width / device } : { width, ink: 1 };
}

/** The GLSL of `thinLine`: the width drawn, and the ink, of a line `w` wide where a device pixel is `d`. */
export const THIN_LINE_GLSL = /* glsl */ `
vec2 thinLine(float w, float d) {
  return w > 0.0 && w < d ? vec2(d, w / d) : vec2(w, 1.0);
}`;

/**
 * A control's size - a port, a handle to grab: `onPagePx` page pixels, no
 * more than `share` of `of` page pixels (a sixth of its set's height, say),
 * so it grows and shrinks with the page and is no larger than what it
 * belongs to - but never under `leastScreenPx` on the screen, so that zoomed
 * far out it is still there to see.
 */
export type Control = { leastScreenPx: number; onPagePx: number; leastOfPx?: { of: number; share: number } };

/** A control's size on the page, in world units (`Control`). */
export function controlOnPage(c: Control): number {
  return Math.min(pagePx(c.onPagePx), c.leastOfPx ? pagePx(c.leastOfPx.of * c.leastOfPx.share) : Infinity);
}

/** A control's size at `zoom`, in world units (`Control`). */
export function controlSize(c: Control, zoom: number): number {
  return Math.max(c.leastScreenPx / Math.max(zoom, 1e-9), controlOnPage(c));
}

/** The line round a control `size` world units across: a page pixel, a fifth of the control where it is tiny (`thinLine` draws it). */
export function controlLine(size: number): number {
  return Math.min(pagePx(1), size / 5);
}
