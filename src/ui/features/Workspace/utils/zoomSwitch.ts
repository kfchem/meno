/**
 * What a zoom shows or hides by its size on the screen - the words on the
 * page's cards and chips, R and S - switched, not faded with the zoom (the
 * maintainer, 2026-10-28: a fade with the zoom left a zoom where words and
 * icons were both half there). Past its threshold, by `SWITCH_BAND` either
 * way so that a zoom stopped at it, or turned a little back, does not
 * switch it back and forth; then faded over a short time on Meno's curve
 * (`SWITCH_S`), as anything that comes or goes in Meno is.
 */
import { DURATION, easeInOut, easeOut } from "../../../theme/motion";

/** How far past its threshold a size must go, as a factor either way, for what it shows to switch. */
export const SWITCH_BAND = 1.05;

/** How long the switch's fade takes, in seconds: Meno's quick one. */
export const SWITCH_S = DURATION.quick;

/**
 * Whether what `value` - a size on the screen - shows is shown, it having
 * been (`was`) or not: shown from `threshold` × `SWITCH_BAND` up, not below
 * `threshold` / `SWITCH_BAND`, and as it was between.
 */
export function switchedAt(was: boolean, value: number, threshold: number, band = SWITCH_BAND): boolean {
  if (value >= threshold * band) return true;
  if (value < threshold / band) return false;
  return was;
}

/** A switch's fade: how far what it shows is in view, 0 to 1, and where it is going - from what, to what, and how long it has gone, in seconds (as utils/molecule3d `LabelFade`). */
export type SwitchFade = { v: number; from: number; to: number; t: number };

/** A switch's fade, shown or not to begin with: all there, or none. */
export const switchFade = (on: boolean): SwitchFade => ({ v: on ? 1 : 0, from: on ? 1 : 0, to: on ? 1 : 0, t: 0 });

/**
 * A switch's fade `dt` seconds on toward shown (`on`) or not, over
 * `SWITCH_S`: eased into view as a mark comes (easeOut), and out of it
 * gently at either end (easeInOut), as CSS's `meno-fade-in` and
 * `meno-fade-out` are. Turned back on its way, from where it is. Changed in
 * place; whether it is still on its way.
 */
export function switchStep(fade: SwitchFade, on: boolean, dt: number): boolean {
  const to = on ? 1 : 0;
  if (fade.to !== to) Object.assign(fade, { from: fade.v, to, t: 0 });
  if (fade.v === fade.to) return false;
  fade.t += Math.max(dt, 0);
  const u = fade.t / SWITCH_S;
  fade.v = u >= 1 ? fade.to : fade.from + (fade.to - fade.from) * (fade.to ? easeOut(u) : easeInOut(u));
  return fade.v !== fade.to;
}
