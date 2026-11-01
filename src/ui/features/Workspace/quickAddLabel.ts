/** How wide the names of who does each row of Quick Add's steps stand (./QuickAdd). */

/** The space either side of a row's name (`px-1.5`), in px. */
const LABEL_PAD = 6;

/**
 * How wide the names of who does each row of steps stand, beside its kinds: the widest of `names` as it is drawn - the card's
 * small text, 12 px - with its padding, so each stands whole, whoever's it is. Measured as drawn where a page draws text;
 * elsewhere, as wide as 0.6 of the size for each letter.
 */
export function labelWidth(names: readonly string[]): number {
  const ctx = typeof document !== "undefined" && typeof HTMLCanvasElement !== "undefined" && !/jsdom/i.test(navigator.userAgent) ? document.createElement("canvas").getContext("2d") : null;
  if (ctx) ctx.font = `12px ${getComputedStyle(document.body).fontFamily}`;
  const widest = Math.max(0, ...names.map((n) => (ctx ? ctx.measureText(n).width : n.length * 12 * 0.6)));
  return Math.ceil(widest) + 2 * LABEL_PAD;
}
