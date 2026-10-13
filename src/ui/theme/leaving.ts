import { useIsPresent } from "motion/react";

/** An event a part going out of view keeps to itself (`heldWhileLeaving`). */
type Held = { stopPropagation(): void; preventDefault(): void };

/**
 * What a part going out of view with motion's `exit` - a menu, Quick Add -
 * does with a press or a click on it while it fades: nothing, and lets none
 * through to what is under it. It is still on the page for that time, and
 * a double-click's second click, landing on it as it went, did again what
 * the first had done (two bonds from Quick Add's Bond, one on the other).
 * Spread on its outermost element: its capture handlers run before its
 * buttons'.
 */
export function heldWhileLeaving(leaving: boolean) {
  const hold = (e: Held) => {
    if (!leaving) return;
    e.stopPropagation();
    e.preventDefault();
  };
  return { onPointerDownCapture: hold, onMouseDownCapture: hold, onClickCapture: hold, onDoubleClickCapture: hold };
}

/**
 * Whether the part this is called in is going out of view (motion's
 * `AnimatePresence` keeping it on the page while it fades), and the handlers
 * that keep presses and clicks on it to itself meanwhile (`heldWhileLeaving`).
 * What it listens for on the window it is to stop listening for then too: a
 * press elsewhere as it goes is the next thing done, not one to close it.
 */
export function useLeaving() {
  const leaving = !useIsPresent();
  return { leaving, held: heldWhileLeaving(leaving) };
}
