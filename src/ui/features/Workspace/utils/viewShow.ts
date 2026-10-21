/**
 * Where the view goes to show what was just put down on the page (docs/
 * WORKSPACE.md, *Putting things down*): nowhere, where it can be seen
 * whole already - in the part of the canvas the column beside it leaves
 * (`cover`, its width on the screen) - else moved along, as little as
 * takes it in with a margin, and only if that is not enough, out as little
 * as needed, it in the middle of what can be seen. Never further in.
 */

/** A box on the page. */
export type ShowBox = { x0: number; x1: number; y0: number; y1: number };
/** A view: its middle on the page, and its zoom (screen pixels to a page unit). */
export type View = { x: number; y: number; zoom: number };

/**
 * The view that shows `box` whole on a canvas `w` by `h` pixels, `cover`
 * of its right side under the column, `marginPx` round it - or null, where
 * `view` shows it already.
 */
export function viewToShow(view: View, screen: { w: number; h: number; cover: number }, box: ShowBox, marginPx = 48): View | null {
  const cover = Math.max(0, Math.min(screen.cover, screen.w * 0.8));
  const seenW = screen.w - cover;
  const z = view.zoom;
  const m = marginPx / z;
  // (what can be seen now: the canvas's left of the column)
  const x0 = view.x - screen.w / 2 / z;
  const x1 = view.x + screen.w / 2 / z - cover / z;
  const y0 = view.y - screen.h / 2 / z;
  const y1 = view.y + screen.h / 2 / z;
  const bw = box.x1 - box.x0;
  const bh = box.y1 - box.y0;
  if (bw + 2 * m > x1 - x0 || bh + 2 * m > y1 - y0) {
    // (too big for the view at this zoom: out as little as takes it in, it in the middle of what can be seen)
    const zoom = Math.min(z, (seenW - 2 * marginPx) / Math.max(bw, 1e-6), (screen.h - 2 * marginPx) / Math.max(bh, 1e-6));
    if (!(zoom > 0)) return null;
    return { x: (box.x0 + box.x1) / 2 + cover / 2 / zoom, y: (box.y0 + box.y1) / 2, zoom };
  }
  // (moved along, as little as takes it in)
  const dx = box.x0 - m < x0 ? box.x0 - m - x0 : box.x1 + m > x1 ? box.x1 + m - x1 : 0;
  const dy = box.y0 - m < y0 ? box.y0 - m - y0 : box.y1 + m > y1 ? box.y1 + m - y1 : 0;
  if (dx === 0 && dy === 0) return null;
  return { x: view.x + dx, y: view.y + dy, zoom: z };
}
