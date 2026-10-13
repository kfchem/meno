import { useEffect, useRef, type ReactElement } from "react";
import { useIsPresent } from "motion/react";
import { DURATION } from "./motion";

/**
 * How long a question - a consent, a discard - takes no click once it comes,
 * or once Meno's window is back in front with it up (`arrival`): the time
 * it takes to come in, and as long again. A click within it was
 * meant for what was there before (a double-click's second, the question
 * before it just answered), and a question is answered only once seen.
 */
export const QUESTION_ARRIVING_MS = 2 * DURATION.base * 1000;

/** An event a part coming or going keeps to itself (`heldWhile`). */
type Held = { stopPropagation(): void; preventDefault(): void };

/** The handlers `heldWhile` gives, to spread on a part's outermost element. */
export type HeldHandlers = ReturnType<typeof heldWhile>;

/**
 * What a part going out of view with motion's `exit` - a menu, Quick Add,
 * a card, a question - does with a press or a click on it while it fades:
 * nothing, and it lets none through to what is under it. It is still on
 * the page for that time, and a double-click's second click, landing on it
 * as it went, did again what the first had done (two bonds from Quick
 * Add's Bond, one on the other; the menu's Paste twice). So too a question
 * as it comes (`useLeaving`'s `arriving`): a click meant for the one
 * before is not its answer. Spread on its outermost element: its capture
 * handlers run before its buttons'.
 */
export function heldWhile(holding: boolean | (() => boolean)) {
  const hold = (e: Held) => {
    if (!(typeof holding === "function" ? holding() : holding)) return;
    e.stopPropagation();
    e.preventDefault();
  };
  return { onPointerDownCapture: hold, onMouseDownCapture: hold, onClickCapture: hold, onDoubleClickCapture: hold };
}

/**
 * When a question was last seen to come, and whether a press on it now is
 * too soon (`useLeaving`'s `arriving`): seen as it is put in front, or as
 * its window comes back in front - one asked while Meno was behind
 * another window, or hidden, had its moment pass unseen, and on Windows
 * the click that brings Meno back reaches the page, where Allow may be.
 * A press while the window is not in front is too soon too, whichever of
 * the two comes first.
 */
export function arrival(arrivingMs: number) {
  let since: number | null = null;
  return {
    /** The window as it is now: in view and in front, or not. */
    seen(inFront: boolean, now: number) {
      since = inFront ? now : null;
    },
    tooSoon(inFront: boolean, now: number) {
      return since == null || !inFront || now - since < arrivingMs;
    },
  };
}

/**
 * Whether the part this is called in is going out of view (motion's
 * `AnimatePresence` keeping it on the page while it fades), and the handlers
 * that keep presses and clicks on it to itself meanwhile (`heldWhile`) -
 * and, given `arriving` (ms), for that long after it is seen to come: put
 * in front, or its window back in front (`arrival`) - a question that must
 * be seen to be answered (ConsentDialog). What it listens for on the
 * window it is to stop listening for as it goes: a press elsewhere as it
 * fades is the next thing done, not one to close it.
 */
export function useLeaving(arriving = 0) {
  const leaving = !useIsPresent();
  const clock = useRef<ReturnType<typeof arrival> | null>(null);
  if (arriving > 0 && !clock.current) clock.current = arrival(arriving);
  useEffect(() => {
    const c = clock.current;
    if (!c) return;
    const look = () => c.seen(inFront(), performance.now());
    look();
    window.addEventListener("focus", look);
    window.addEventListener("blur", look);
    document.addEventListener("visibilitychange", look);
    return () => {
      window.removeEventListener("focus", look);
      window.removeEventListener("blur", look);
      document.removeEventListener("visibilitychange", look);
    };
  }, []);
  return { leaving, held: heldWhile(() => leaving || (clock.current?.tooSoon(inFront(), performance.now()) ?? false)) };
}

/** Whether Meno's window is in view and in front, taking the keys and the pointer. */
function inFront(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus();
}

/**
 * `useLeaving` for a part a component puts straight under its own
 * `AnimatePresence` (a hook there is above the presence, and never sees it
 * go): put under it in the part's place, with the part's key.
 */
export function Leaving({ arriving = 0, children }: { arriving?: number; children: (held: HeldHandlers, leaving: boolean) => ReactElement }) {
  const { leaving, held } = useLeaving(arriving);
  return children(held, leaving);
}
