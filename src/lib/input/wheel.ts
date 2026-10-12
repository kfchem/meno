/**
 * What a wheel event asks of a view: to zoom - a mouse wheel, or a pinch -
 * or to move - two fingers on a trackpad. Browsers deliver all of them as
 * the same event, so the fingers are told by the signs they leave: movement
 * sideways, fractions, small first steps. A mouse wheel moves in notches, a
 * pinch comes with Ctrl held (Chromium, on Windows too), and a wheel scrolled
 * a line at a time says so.
 *
 * The first event of a run decides, and the rest of the run goes the same
 * way, so a stroke of the fingers or a spin of the wheel is never read as
 * half one and half the other.
 */

export type WheelIntent = "zoom" | "pan";

export type WheelLike = {
  deltaX: number;
  deltaY: number;
  /** 0 pixels, 1 lines, 2 pages. */
  deltaMode: number;
  ctrlKey: boolean;
  shiftKey?: boolean;
  timeStamp: number;
};

/** How long a pause ends a run of wheel events. */
const RUN_MS = 250;

/**
 * A mouse wheel's first step is a notch: 40 px or more for a plain wheel
 * (WebKit, macOS), 100 px in Chromium on Windows, and 13 px for a mouse
 * scrolling smoothly - a Logitech MX Master 3S on macOS, measured on the
 * maintainer's machine, 13 for one notch and about 100 spun fast. Fingers
 * on a trackpad begin with a step of 1 or 2 px, however fast the stroke.
 */
const NOTCH_PX = 8;

/**
 * How near a whole number a step may be and still be whole: Windows' display
 * scaling leaves notches a hair off - ten at once came as 999.99993 px at
 * 175 % - where fingers leave real fractions.
 */
const WHOLE_WITHIN = 1e-3;

const whole = (v: number) => Math.abs(v - Math.round(v)) < WHOLE_WITHIN;

/** Whether an event, the first of its run, looks like fingers on a trackpad. */
export function looksLikeFingers(e: WheelLike): boolean {
  if (e.deltaMode !== 0) return false; // lines or pages: a wheel
  if (e.deltaX !== 0 && !e.shiftKey) return true; // sideways: fingers
  // (with Shift, Windows turns a wheel's notch sideways)
  if (!whole(e.deltaX) || !whole(e.deltaY)) return true;
  return Math.max(Math.abs(e.deltaX), Math.abs(e.deltaY)) < NOTCH_PX;
}

/**
 * Whether a wheel event with Ctrl held is a pinch, to be followed step by
 * step as the fingers go. Chromium hands a pinch on a trackpad over as the
 * wheel with Ctrl held, in small fractional steps. But on Windows Ctrl with
 * the mouse wheel is itself the ordinary way to zoom, and its notch - 100 px
 * - followed as a pinch zooms e times, 2.7, at a single click. So a notch is
 * told from a pinch the way the first step of a run is told from fingers,
 * and a notch zooms as the wheel's notch does without Ctrl.
 */
export function isPinch(e: WheelLike): boolean {
  return e.ctrlKey && looksLikeFingers(e);
}

/** A reader of wheel events for one view, remembering the run it is in. */
export function wheelReader(): (e: WheelLike) => WheelIntent {
  let run: { intent: WheelIntent; at: number } | null = null;
  return (e) => {
    if (e.ctrlKey) {
      run = null;
      return "zoom"; // a pinch, or Ctrl with the wheel
    }
    const going = run !== null && e.timeStamp - run.at < RUN_MS;
    const intent: WheelIntent = going
      ? run!.intent
      : looksLikeFingers(e)
        ? "pan"
        : "zoom";
    run = { intent, at: e.timeStamp };
    return intent;
  };
}

/**
 * How much of what a wheel has left to zoom (`left`, by the log of the
 * ratio) a frame of `dt` seconds takes, at `rate` of what is left a second:
 * the frames together take all of it and no more, however many there are
 * and however long the first was in coming after the view was still - a
 * frame counts for a thirtieth of a second at most. The last crumb is taken
 * whole.
 */
export function zoomTaken(left: number, dt: number, rate: number): number {
  const share = 1 - Math.exp(-rate * Math.min(Math.max(dt, 0), 1 / 30));
  return Math.abs(left) * (1 - share) < 1e-4 ? left : left * share;
}

/** What a wheel needs to know of a box to tell whether it scrolls: its overflow and how far it is scrolled. */
export type ScrollBox = {
  overflowX: string;
  overflowY: string;
  scrollLeft: number;
  scrollTop: number;
  scrollWidth: number;
  scrollHeight: number;
  clientWidth: number;
  clientHeight: number;
};

const scrolls = (overflow: string) => overflow === "auto" || overflow === "scroll";

/**
 * Whether a box - a list on the page, its rows longer than it is tall -
 * scrolls further the way a wheel goes, and so takes the wheel for itself,
 * rather than the view. Scrolled to its end that way, it gives it up.
 */
export function scrollsAlong(b: ScrollBox, dx: number, dy: number): boolean {
  const along = (d: number, at: number, size: number, seen: number) =>
    d < 0 ? at > 0 : d > 0 ? at + seen < size - 0.5 : false;
  return (
    (scrolls(b.overflowY) && b.scrollHeight > b.clientHeight && along(dy, b.scrollTop, b.scrollHeight, b.clientHeight)) ||
    (scrolls(b.overflowX) && b.scrollWidth > b.clientWidth && along(dx, b.scrollLeft, b.scrollWidth, b.clientWidth))
  );
}
