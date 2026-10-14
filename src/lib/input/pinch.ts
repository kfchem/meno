/**
 * Two fingers on a touch screen, pinching: the view zoomed as far as they
 * spread or close, about the point between them, and moved as that point
 * moves - what lies under the fingers stays under them, as a trackpad's
 * pinch keeps what is under the pointer.
 */

export type Pt = { x: number; y: number };

/** A view of the page: where its middle is (page units, y up) and its zoom (screen pixels to a unit). */
export type PageView = { x: number; y: number; zoom: number };

/** Where the view is shown on the screen, in pixels. */
export type ScreenBox = { left: number; top: number; width: number; height: number };

/** How near two fingers may come and still say how far a pinch spreads, in pixels: nearer, a step zooms nothing. */
export const LEAST_SPREAD_PX = 8;

/** A step of two fingers, from `a0` and `b0` to `a1` and `b1` (screen pixels): how far it zooms, and the point between them before and after. */
export function fingersStep(a0: Pt, b0: Pt, a1: Pt, b1: Pt): { scale: number; from: Pt; to: Pt } {
  const was = Math.hypot(b0.x - a0.x, b0.y - a0.y);
  const now = Math.hypot(b1.x - a1.x, b1.y - a1.y);
  const scale = was >= LEAST_SPREAD_PX && now >= LEAST_SPREAD_PX ? now / was : 1;
  return { scale, from: { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 }, to: { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 } };
}

/** The point on the page shown at `p` on the screen. */
export function pageUnder(view: PageView, box: ScreenBox, p: Pt): Pt {
  return { x: view.x + (p.x - box.left - box.width / 2) / view.zoom, y: view.y - (p.y - box.top - box.height / 2) / view.zoom };
}

/**
 * The view after a step of two fingers: zoomed by its scale, within
 * `least` and `most`, and moved so that the page point that was between the
 * fingers is between them still.
 */
export function pinchedView(view: PageView, box: ScreenBox, step: { scale: number; from: Pt; to: Pt }, least: number, most: number): PageView {
  const held = pageUnder(view, box, step.from);
  const zoom = Math.min(most, Math.max(least, view.zoom * step.scale));
  return {
    x: held.x - (step.to.x - box.left - box.width / 2) / zoom,
    y: held.y + (step.to.y - box.top - box.height / 2) / zoom,
    zoom,
  };
}

/** How soon after the first finger a second makes a pinch of it, whatever the first has begun, in ms. */
export const PINCH_SOON_MS = 200;

/**
 * Whether a second finger come down makes a pinch of the first's press:
 * where the first moves the view, or the second came soon after it
 * (`PINCH_SOON_MS`), or the first has not yet gone as far as a bond's
 * length on the screen (`bondPx`) from where it came down - whatever it
 * came down on. Otherwise the first goes on with what it does.
 */
export function makesPinch(first: { at: Pt; t: number; now: Pt }, t: number, bondPx: number, panning: boolean): boolean {
  return panning || t - first.t <= PINCH_SOON_MS || Math.hypot(first.now.x - first.at.x, first.now.y - first.at.y) < bondPx;
}
