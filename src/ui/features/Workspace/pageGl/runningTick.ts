/**
 * How often the marks of a running step - its icon turning, the dashes of
 * its wire moving - ask for a frame: about thirty a second, not one at
 * every display frame. The canvas draws on demand, and every frame redraws
 * the whole page, so what a page costs a frame it costs as often as the
 * marks ask; the marks go by the clock, not by the frames, and move as fast
 * at thirty as at sixty.
 *
 * And whether they may ask at all: this is the one place that decides it
 * for every running mark of the page (`pageMotion`). Unseen - Meno's window
 * minimised or hidden, as the back end says from the window's own state
 * (`tellWindowSeen`, src-tauri/src/windowseen.rs); the page's document
 * hidden; or the page's tab not the one shown - none is asked; seen again,
 * the motion goes on where it stood, not where the clock would have taken
 * it. Where the system asks for less motion none is asked either: the marks
 * stand still (the running icon, the wire's dashes), still saying that it
 * runs. A window merely not in front is seen: a run is watched beside
 * another window. One covered by others, or on another desktop, is unseen
 * only where the system itself tells the page so.
 */
import { PAGE_PX } from "../utils/pageScale";
export const RUNNING_FRAME_MS = 33;

/** The longest a running mark moves at one frame, in seconds: a stalled page does not leap. */
const LONGEST_STEP = 0.1;

/** Whether the page's continuous motion may ask for frames: `seen` (none asked unseen), `still` (none asked, the marks at rest), told of a change by `watch`. */
export type MotionGate = { seen: () => boolean; still: () => boolean; watch: (changed: () => void) => () => void };

const LESS_MOTION = "(prefers-reduced-motion: reduce)";
const lessMotion = () => (typeof matchMedia === "function" ? matchMedia(LESS_MOTION) : null);

/** What the back end last said of Meno's window: seen, unseen (minimised or hidden), or nothing yet - taken as seen. */
let windowWord: boolean | null = null;
const windowWatchers = new Set<() => void>();

/** The back end's word on whether Meno's window can be seen (src-tauri/src/windowseen.rs): every running mark told at once. */
export function tellWindowSeen(seen: boolean | null): void {
  if (seen === windowWord) return;
  windowWord = seen;
  for (const changed of [...windowWatchers]) changed();
}

/** The page's gate: seen while the back end does not say its window is minimised or hidden and the document is not hidden; still where the system asks for less motion. */
export const pageMotion: MotionGate = {
  seen: () => windowWord !== false && (typeof document === "undefined" || document.visibilityState !== "hidden"),
  still: () => !!lessMotion()?.matches,
  watch(changed) {
    const less = lessMotion();
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", changed);
    less?.addEventListener?.("change", changed);
    windowWatchers.add(changed);
    return () => {
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", changed);
      less?.removeEventListener?.("change", changed);
      windowWatchers.delete(changed);
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
