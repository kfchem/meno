/** How wide Quick Add's calculations stand (./QuickAddCalculations): as their names need, whatever the row above them holds. */

/** What stands about a name in a row of the list: a step's indent and icon and the gaps before it, and a count or its room after it, in px. */
const ROW_AROUND = 20 + 18 + 8 + 8 + 28;
/** The least and the most the list stands wide, in px: a name longer than the most is cut, and said whole on hover. */
export const LIST_LEAST = 220;
export const LIST_MOST = 340;

/**
 * How wide the list stands for `names` - who does steps, and the steps - the widest as it is drawn in the card's small text,
 * 12 px, with what stands about it in its row, between `LIST_LEAST` and `LIST_MOST`. Measured as drawn where a page draws
 * text; elsewhere, as wide as 0.6 of the size for each letter.
 */
export function listWidth(names: readonly string[]): number {
  const ctx = typeof document !== "undefined" && typeof HTMLCanvasElement !== "undefined" && !/jsdom/i.test(navigator.userAgent) ? document.createElement("canvas").getContext("2d") : null;
  if (ctx) ctx.font = `12px ${getComputedStyle(document.body).fontFamily}`;
  const widest = Math.max(0, ...names.map((n) => (ctx ? ctx.measureText(n).width : n.length * 12 * 0.6)));
  return Math.min(LIST_MOST, Math.max(LIST_LEAST, Math.ceil(widest) + ROW_AROUND));
}

/** How tall a row of Quick Add's calculations stands, in px; and the most the list stands, its rows and the steps of the one open, before those scroll (the maintainer, 2026-11-04: as the mock had it). */
export const CALC_ROW = 28;
export const CALC_MOST = 560;
/** The fewest steps of the one open that show, however many rows there are. */
const SHOWN_LEAST = 6;

/** The most the steps of the one open stand before they scroll, with `rows` rows: what the rows leave, never less than `SHOWN_LEAST` of them. */
export const stepsMost = (rows: number) => Math.max(SHOWN_LEAST * CALC_ROW, CALC_MOST - rows * CALC_ROW);

/** The most the list stands: its rows (`counts`, how many steps each offers) and the steps of the largest, opened. */
export function calcHeight(counts: readonly number[]): number {
  const n = Math.max(0, ...counts);
  return counts.length * CALC_ROW + (n ? Math.min(n * CALC_ROW + 4, stepsMost(counts.length)) : 0);
}
