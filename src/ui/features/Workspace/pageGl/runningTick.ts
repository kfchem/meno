/**
 * How often the marks of a running step - its icon turning, the dashes of
 * its wire moving - ask for a frame: about thirty a second, not one at
 * every display frame. The canvas draws on demand, and every frame redraws
 * the whole page, so what a page costs a frame it costs as often as the
 * marks ask; the marks go by the clock, not by the frames, and move as fast
 * at thirty as at sixty.
 *
 * And whether they may ask at all: this is the one place that decides it
 * for every continuous motion of the page (`pageMotion`). Unseen - the web
 * view saying its document is hidden (the window hidden, minimised or all
 * covered), or the page's tab not the one shown - none is asked; seen
 * again, the motion goes on where it stood, not where the clock would have
 * taken it. Where the system asks for less motion none is asked either: the
 * marks stand still (the running icon, the wire's dashes), still saying
 * that it runs. A window merely not in front is seen: a run is watched
 * beside another window.
 */
import { PAGE_PX } from "../utils/pageScale";
export const RUNNING_FRAME_MS = 33;

/** The longest a running mark moves at one frame, in seconds: a stalled page does not leap. */
const LONGEST_STEP = 0.1;

/** Whether the page's continuous motion may ask for frames: `seen` (none asked unseen), `still` (none asked, the marks at rest), told of a change by `watch`. */
export type MotionGate = { seen: () => boolean; still: () => boolean; watch: (changed: () => void) => () => void };

const LESS_MOTION = "(prefers-reduced-motion: reduce)";
const lessMotion = () => (typeof matchMedia === "function" ? matchMedia(LESS_MOTION) : null);

/** The page's gate: seen while the web view does not say its document is hidden; still where the system asks for less motion. */
export const pageMotion: MotionGate = {
  seen: () => typeof document === "undefined" || document.visibilityState !== "hidden",
  still: () => !!lessMotion()?.matches,
  watch(changed) {
    const less = lessMotion();
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", changed);
    less?.addEventListener?.("change", changed);
    return () => {
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", changed);
      less?.removeEventListener?.("change", changed);
    };
  },
};

let asked = 0;
/** How many frames the page's running marks have asked for, all told: for tests, which count frames, not time. */
export const runningFramesAsked = () => asked;

/**
 * A running mark's frame-asker. `ask` one frame, after RUNNING_FRAME_MS,
 * where none is asked for yet and the gate lets it; `shown` whether the
 * page's tab is the one shown; `step` the seconds the mark moves at the
 * frame drawn - none while it stands, none at the first frame after it
 * stood - and `time` how far it has moved in all, so that it goes on where
 * it stood; `stop` once it no longer moves, or before it is let go.
 */
export type RunningTick = {
  ask: (invalidate: () => void) => void;
  shown: (on: boolean) => void;
  step: (dt: number) => number;
  time: () => number;
  stop: () => void;
};

export function runningTick(gate: MotionGate = pageMotion): RunningTick {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let again: (() => void) | null = null;
  let unwatch: (() => void) | null = null;
  let tab = true;
  let stood = false;
  let moved = 0;
  const moves = () => tab && gate.seen() && !gate.still();
  const frame = () => {
    asked++;
    again?.();
  };
  const halt = () => {
    if (timer != null) clearTimeout(timer);
    timer = null;
  };
  const changed = () => {
    if (!moves()) {
      halt();
      stood = true;
    } else if (stood && again && timer == null) frame(); // (seen again: one frame at once, the mark going on from where it stood)
  };
  return {
    ask(invalidate) {
      again = invalidate;
      unwatch ??= gate.watch(changed);
      if (!moves()) {
        halt();
        stood = true;
        return;
      }
      if (timer != null) return;
      timer = setTimeout(() => {
        timer = null;
        if (moves()) frame();
        else stood = true;
      }, RUNNING_FRAME_MS);
    },
    shown(on) {
      if (on === tab) return;
      tab = on;
      changed();
    },
    step(dt) {
      if (!moves()) return 0;
      if (stood) {
        stood = false;
        return 0;
      }
      const s = Math.min(Math.max(dt, 0), LONGEST_STEP);
      moved += s;
      return s;
    },
    time: () => moved,
    stop() {
      halt();
      unwatch?.();
      unwatch = null;
      again = null;
    },
  };
}

/**
 * Where a wire's dashes stand after `dt` seconds more (at most a tenth of
 * a second at once, a stalled page not leaping): `offset` further along at
 * `speed` page px a second, round the length of a dash and a gap, `dashPx`
 * and `gapPx` page px - in the world's units, at every zoom the same.
 */
export function dashAdvance(offset: number, dt: number, speed: number, dashPx: number, gapPx: number): number {
  return (offset + Math.min(dt, LONGEST_STEP) * speed * PAGE_PX) % ((dashPx + gapPx) * PAGE_PX);
}
