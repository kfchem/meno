/**
 * The last click on the drawing, as the browser counts it: 2 for the
 * second click of a double-click, reckoned by the system's own
 * double-click time (which the user may have set longer than any time the
 * drawing could assume). A click edits its atom's label a moment after it
 * unless the second click of a double-click has come since.
 */

let last = { detail: 0, at: Number.NEGATIVE_INFINITY };

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** Notes a click: its `detail`, the count the browser gives it. */
export function noteClick(detail: number): void {
  last = { detail, at: now() };
}

/** Whether the second click of a double-click has come since `since` (a `performance.now()`). */
export function doubleClickedSince(since: number): boolean {
  return last.detail >= 2 && last.at >= since;
}

let pressed = Number.NEGATIVE_INFINITY;

/** Notes a press of the button on the drawing, wherever it is. */
export function notePress(): void {
  pressed = now();
}

/**
 * Whether a click at `since` (a `performance.now()`) still edits its atom's
 * label: no second click of a double-click has come since, and no press
 * either - a press elsewhere, to move the view or on a bond, begins
 * something else, which the edit would break into half a second later.
 */
export function clickStillEdits(since: number): boolean {
  return !doubleClickedSince(since) && pressed < since;
}

/**
 * Whether a click's label edit, its time come, is held off by what is
 * going on: a bond or a chain being drawn, an atom moved, or a label being
 * written already - typed over another atom since the click, which the
 * click's edit would take the place of, the letters typed lost.
 */
export function clickEditHeldOff(st: { extend: { active: boolean }; moveDrag: { active: boolean }; labelEdit: { active: boolean } }): boolean {
  return st.extend.active || st.moveDrag.active || st.labelEdit.active;
}

/** Now, as `doubleClickedSince` takes it. */
export function clickClock(): number {
  return now();
}

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
