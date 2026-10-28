/**
 * A step's card opened to its options by a click, and shut only by a
 * double-click on it (components/Workflow2D; the maintainer, 2026-10-28) -
 * not by a single click, a press elsewhere, Escape, or a zoom.
 */

/** How soon a second click on a step's card is the same double-click's, in milliseconds. */
export const DOUBLE_CLICK_MS = 500;

/** A click on a step's card: which card, when, and whether its options were open as it came. */
export type CardClick = { step: number; at: number; wasOpen: boolean };

/**
 * Which step is open once a step's card is clicked: it, opened - or, open
 * already, still open - unless the click is a double-click's second on a
 * card that was open before its first, which shuts it. A double-click on a
 * shut card opens it and leaves it open.
 */
export function clickedOpen(open: number | null, step: number, last: CardClick | null, now: number): number | null {
  if (open !== step) return step;
  if (last?.step === step && last.wasOpen && now - last.at < DOUBLE_CLICK_MS) return null;
  return step;
}
