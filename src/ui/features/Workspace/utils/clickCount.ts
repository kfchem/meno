/**
 * How many presses a press is, on empty space, a bond or an atom, in a
 * double-click's time - and a pointer's event met once.
 */

/** A press on empty space: when, and where in the window. */
export type EmptyPress = { t: number; x: number; y: number };

/**
 * Which press of a double-click a press on empty space is: the second, soon
 * after a first (within `within` ms) and near it (8 px); else a first - a
 * third among them too, since three on empty space ask for nothing two did
 * not (a chain is Quick Add's: the maintainer, 2026-10-10).
 */
export function pressOnEmpty(last: (EmptyPress & { count: number }) | null, press: EmptyPress, within: number): 1 | 2 {
  const near = !!last && press.t - last.t <= within && Math.hypot(press.x - last.x, press.y - last.y) < 8;
  return near && last!.count === 1 ? 2 : 1;
}

/** A press on a bond: which, and when. */
export type BondPress = { id: number; t: number };

/**
 * Which press of a double-click a press on a bond is: the second, on the
 * same bond soon after a first (within `within` ms); else a first. A second
 * press begins no long press, as on an atom or empty space (2026-10-13: a
 * double-click held a moment selected the bond's whole structure).
 */
export function pressOnBond(last: (BondPress & { count: number }) | null, press: BondPress, within: number): 1 | 2 {
  return !!last && last.id === press.id && press.t - last.t <= within && last.count === 1 ? 2 : 1;
}

/**
 * How many presses on one atom a press is, in a double-click's time: 1, or 2
 * where it follows the first. Never more: a third click is a click like the
 * first, and starts nothing (a chain is Quick Add's, or the atom menu's
 * *Chain from here*: the maintainer, 2026-10-16).
 */
export function pressNumber(last: { id: number | null; t: number; count: number }, id: number, now: number, windowMs: number): 1 | 2 {
  return last.id === id && now - last.t <= windowMs && last.count === 1 ? 2 : 1;
}

/**
 * A test that a pointer's event is met for the first time - one press, one
 * count. The canvas's renderer calls a handler once for each object a press
 * hits, so an atom's handlers, on its disc and on its label's letters both
 * (Atoms2D: a label's other letters are its atom), ran twice for a press
 * where the two overlap: a double-click's second press was counted as a
 * first, and dragged the atom instead of drawing a bond (the Windows
 * pre-release check, 2026-10-18). Each test keeps its own events; an event
 * without one (a test's, say) is always new.
 */
export function oncePerEvent(): (event: object | undefined | null) => boolean {
  const met = new WeakSet<object>();
  return (event) => {
    if (!event) return true;
    if (met.has(event)) return false;
    met.add(event);
    return true;
  };
}
