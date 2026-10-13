import { useEffect, useState, type ReactElement } from "react";
import { useIsPresent } from "motion/react";
import { DURATION } from "./motion";

/**
 * How long a question - a consent, a discard - takes no click once it comes:
 * the time it takes to come in, and as long again. A click within it was
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
export function heldWhile(holding: boolean) {
  const hold = (e: Held) => {
    if (!holding) return;
    e.stopPropagation();
    e.preventDefault();
  };
  return { onPointerDownCapture: hold, onMouseDownCapture: hold, onClickCapture: hold, onDoubleClickCapture: hold };
}

/**
 * Whether the part this is called in is going out of view (motion's
 * `AnimatePresence` keeping it on the page while it fades), and the handlers
 * that keep presses and clicks on it to itself meanwhile (`heldWhile`) -
 * and, given `arriving` (ms), for that long after it comes too: a question
 * that must be seen to be answered (ConsentDialog). What it listens for on
 * the window it is to stop listening for as it goes: a press elsewhere as it
 * fades is the next thing done, not one to close it.
 */
export function useLeaving(arriving = 0) {
  const leaving = !useIsPresent();
  const [arrived, setArrived] = useState(arriving <= 0);
  useEffect(() => {
    if (arrived) return;
    const t = window.setTimeout(() => setArrived(true), arriving);
    return () => window.clearTimeout(t);
  }, [arrived, arriving]);
  return { leaving, held: heldWhile(leaving || !arrived) };
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
