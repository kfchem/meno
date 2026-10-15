/**
 * A step's card opened to its options by a click, and shut by another
 * (components/Workflow2D) - but not by the second click of a double-click.
 */

/** How soon a second click on a step's card is the same double-click's, in milliseconds. */
export const DOUBLE_CLICK_MS = 500;

/**
 * Which step is open once a step's card is clicked: it, opened - or, open,
 * shut - unless the click is a double-click's second, soon after the one
 * that opened it, which leaves it open rather than shutting it at once.
 */
export function clickedOpen(open: number | null, step: number, lastOpened: { step: number; at: number } | null, now: number): number | null {
  if (open !== step) return step;
  if (lastOpened?.step === step && now - lastOpened.at < DOUBLE_CLICK_MS) return step;
  return null;
}
