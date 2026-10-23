/**
 * How things move in Meno. Nothing on screen changes at a jump: a highlight
 * eases in and out, a menu or a card comes and goes, the drawing and the view
 * go where they are sent rather than appear there. Short and understated, and
 * what belongs together moves together, in the same time and the same way.
 */

/** How long things take, in seconds. */
export const DURATION = {
  /** A colour, a highlight, a hover. */
  quick: 0.12,
  /** Something coming into view or going: a menu, a card, a mark. */
  base: 0.16,
  /** The drawing or the view going somewhere: a Clean-up, an undo, a fit. */
  move: 0.22,
} as const;

/** The easing of all of it: quick out of the start, settling gently (CSS's `--ease-meno`). */
export const EASE: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

/**
 * The easing of something going out of view - a menu closing, a card or a
 * mark going - as gentle out of its start as into its end (CSS's
 * `--ease-meno-leave`). Quick out of the start, as `EASE` is, a menu fading
 * out had lost half of itself in its first frame and most of it in the
 * next, and read as gone at once (found on Windows, 2026-10-05); this way
 * its first frames still show it going.
 */
export const EASE_LEAVE: [number, number, number, number] = [0.4, 0, 0.6, 1];

/**
 * The easing of a panel sliding open or shut beside the canvas, which moves
 * the drawing with it: as gentle out of the start as into the end, so that
 * neither way does the drawing set off at a jump.
 */
export const EASE_SLIDE: [number, number, number, number] = [0.45, 0, 0.55, 1];

/** Time constants for following a moving target, in seconds. */
export const TAU = {
  quick: 0.05,
  move: 0.07,
  /** A molecule in 3D going to its place, and a workflow's set with it. */
  place: 0.08,
} as const;

/** The spring of things that swell and settle: the 3D viewer's. */
export const SPRING = { stiffness: 150, damping: 15 } as const;

/** `current` one step `dt` (seconds) nearer `target`, following with time constant `tau`. */
export function follow(current: number, target: number, dt: number, tau: number): number {
  return target + (current - target) * Math.exp(-dt / tau);
}

/** A cubic Bézier easing curve - EASE, EASE_LEAVE, as CSS's cubic-bezier() - at `u` of its time: how far along it is. */
export function eased(curve: readonly [number, number, number, number], u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const t = u;
  const [x1, y1, x2, y2] = curve;
  const at = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  // (the curve's parameter whose x is t: by halving, as CSS finds it, to well within a pixel)
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2;
    if (at(x1, x2, mid) < t) lo = mid;
    else hi = mid;
  }
  return at(y1, y2, (lo + hi) / 2);
}

/** The easing curve: cubic, out. */
export function easeOut(u: number): number {
  const t = Math.min(Math.max(u, 0), 1);
  return 1 - (1 - t) ** 3;
}

/**
 * The easing curve as gentle out of the start as into the end: cubic, in
 * and out - for what moves the drawing in place (a label being written, its
 * bonds drawing back), as EASE_SLIDE is for a panel.
 */
export function easeInOut(u: number): number {
  const t = Math.min(Math.max(u, 0), 1);
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * A clock for a short motion that counts frames as they are drawn, each at
 * most `most` seconds: a frame slow to come - the canvas busy as the motion
 * begins - takes it no further than one on time would, so that it is seen
 * all the way rather than mostly gone by the first frame.
 */
export function frameClock(most = 1 / 60) {
  let ms = 0;
  return {
    now: () => ms,
    tick: (dt: number) => void (ms += Math.min(Math.max(dt, 0), most) * 1000),
  };
}

/** How long something takes to go out of view, and how: `DURATION.base`, with `EASE_LEAVE`. */
export const LEAVE = { duration: DURATION.base, ease: EASE_LEAVE } as const;

/**
 * For motion's components: a fade, and a fade with a small rise, in
 * `DURATION.base` - coming with `EASE`, going with `EASE_LEAVE`.
 */
export const FADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0, transition: LEAVE },
  transition: { duration: DURATION.base, ease: EASE },
} as const;
export const RISE = {
  initial: { opacity: 0, y: 4, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 4, scale: 0.985, transition: LEAVE },
  transition: { duration: DURATION.base, ease: EASE },
} as const;

/**
 * A canvas follows its box frame by frame as the box changes - beside a panel
 * sliding open, say. (React Three Fiber's own measuring waits for the box to
 * be still for 50 ms, so the canvas kept its old size all the way and then
 * jumped.)
 */
export const CANVAS_RESIZE = { debounce: 0 } as const;
