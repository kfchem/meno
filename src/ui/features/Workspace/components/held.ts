import { LONG_PRESS_SHOW_MS } from "../constants";
import { longPressMs } from "../longPress";

/** How quickly the light of a thing let go goes, in ms (HeldLight). */
export const HELD_FADE_MS = 140;

/** A thing on the page taken hold of by a press held on it: since when, whether it has been, and when it was let go. */
export type Held = { start: number; done?: boolean; let?: number };

/** Whether a hold's light is still to be drawn: held, or going. */
export const heldShows = (held: Held, now: number) => held.let == null || now - held.let < HELD_FADE_MS + 80;

/**
 * How far a press held still has come, 0 to 1, at `now`: nothing for its
 * first LONG_PRESS_SHOW_MS, then on to the long press - and no further once
 * it is let go (`letAt`). Its light fades from there: a click, let go
 * before anything shows, shows nothing as it fades (it glowed on every
 * click, the time running on in the fade).
 */
export function holdProgress(start: number, now: number, letAt?: number): number {
  const t = Math.min(now, letAt ?? now) - start;
  return Math.min(1, Math.max(0, (t - LONG_PRESS_SHOW_MS) / (longPressMs() - LONG_PRESS_SHOW_MS)));
}
