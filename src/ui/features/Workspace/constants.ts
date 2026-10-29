// Shared visual/picking constants for Workspace 2D
// Keep atom pick hit radius exactly in sync with the blue hover highlight size.

// Outer radius of the hover highlight disk/ring relative to NOMINAL_BOND_LENGTH

export const ATOM_HOVER_RING_RADIUS_RATIO = 0.26; // world-units ratio

/**
 * How long after a click its label is edited, and how soon a second click
 * makes it a double-click instead. The system's own double-click time is
 * half a second by default (macOS): a click's edit must wait at least that
 * long, or the second click of a double-click comes after the first has
 * already begun editing.
 */
export const DOUBLE_CLICK_MS = 500;

/**
 * How far a press has to travel to be a drag rather than a click, in px.
 * The browser calls the end of a drag a click all the same, wherever the
 * button comes up; the drawing does not (see utils/press).
 */
export const MOV_PX = 5;

/**
 * How long a press held still takes to be a long press, in ms, as Settings
 * (*General*, *A long press*) says: it selects the whole structure on an
 * atom or a bond, and on empty space begins a box. It is counted while the
 * button is held - a click's label edit waits DOUBLE_CLICK_MS after it comes
 * up - and only on the first press of clicks: the second of a double-click
 * held still waits to be dragged. Normal was 320 ms until 2026-10-28 (the
 * maintainer: about 260). Each is well past a click's press - a tenth of a
 * second or so, and past `LONG_PRESS_SHOW_MS` before anything shows - and
 * short of `DOUBLE_CLICK_MS` and `FREE_MS` (Workspace/longPress.test).
 */
export const LONG_PRESSES = { shorter: 220, normal: 260, longer: 400 } as const;
/** A long press shows nothing for its first part, so that a click shows nothing. */
export const LONG_PRESS_SHOW_MS = 120;

/**
 * How long a pause in a drag takes to let a bond or a moved atom go where
 * the pointer is, off the grid - or to lay down the bond a chain is on. A
 * drag slows down as it arrives, and should not let go of the grid on its
 * way there.
 */
export const FREE_MS = 700;

// Atom picking hit radius (instanced circle used for raycasting)
// Must match the hover ring radius for exact visual parity.
export const ATOM_PICK_RADIUS_RATIO = ATOM_HOVER_RING_RADIUS_RATIO;

/**
 * How much slower a chain's guide moves than it did (the maintainer,
 * 2026-10-15: "a little more nyu-nyu-nyu, a little slower"): 1 is as it was;
 * the honeycomb's opening, its folding and its following of the chain's end
 * all take this much longer. The one number to tune.
 */
export const CHAIN_EASE = 1.3;
