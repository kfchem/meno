/**
 * A press of the button on the drawing, from the button going down to the
 * click the browser fires for it.
 *
 * The browser fires that click wherever the button comes up, so the end of
 * a drag - a bond drawn out of an atom, a chain, an atom moved, the view
 * panned - is a click as far as it is concerned. For the drawing it is not:
 * a drag let go on an atom, a new one or one already there, does not go on
 * to edit that atom's label.
 */
import { MOV_PX } from "../constants";

export type Press = { x: number; y: number; travelled: boolean };

/** A press where the button went down, in client px. */
export function startPress(x: number, y: number): Press {
  return { x, y, travelled: false };
}

/** The press after the pointer has moved to (x, y) with the button down. */
export function movePress(p: Press, x: number, y: number): Press {
  if (p.travelled || Math.hypot(x - p.x, y - p.y) < MOV_PX) return p;
  return { ...p, travelled: true };
}

/**
 * Whether the click at (x, y) ends a drag rather than being a click: the
 * press it ends went further than a click's wobble on the way, even if it
 * came back to where it began.
 */
export function endsDrag(p: Press | null, x: number, y: number): boolean {
  if (!p) return false;
  return movePress(p, x, y).travelled;
}

/**
 * Whether a right press came while the primary button was held - a chorded
 * press, in the middle of a drag - as the menu's event says, or the last
 * pointer event did. A Ctrl-click on a Mac, the primary button alone, is a
 * right-click of its own and is not one.
 */
export function chordedPress(buttons: number, lastButtons: number): boolean {
  const both = (b: number) => (b & 1) !== 0 && (b & 2) !== 0;
  return both(buttons) || both(lastButtons);
}

/**
 * Whether a button has joined a press held with `held` buttons, as a
 * pointer event's `buttons` says: a chord.
 */
export function joinedBy(held: number, buttons: number): boolean {
  return (buttons & ~held) !== 0;
}

/**
 * Calls `chord` once should another button join the press begun with
 * `held` buttons - a second button's press comes as a move of the pointer
 * with more buttons, not as a press of its own - and returns the end of
 * the listening. A long press so joined is no press at all: no structure
 * selected, no click on release, no drag (2026-10-14) - the chord does nothing, rather than half of one, as the
 * menu opens none for it (`chordedPress`).
 */
export function onChord(held: number, chord: () => void): () => void {
  const look = (e: MouseEvent) => {
    if (!joinedBy(held, e.buttons)) return;
    off();
    chord();
  };
  const off = () => {
    for (const type of CHORD_EVENTS) window.removeEventListener(type, look, { capture: true });
  };
  for (const type of CHORD_EVENTS) window.addEventListener(type, look, { capture: true });
  return off;
}

/** What says a button has joined a press: the move with more buttons, and the second button's own mousedown and menu. */
const CHORD_EVENTS = ["pointermove", "mousedown", "contextmenu"] as const;

/**
 * What a press does to a chain traced with the button up (ChainGuide2D),
 * `since` ms after the trace began and the pointer `moved` or not since:
 * the primary button ends it, the other lets it go - but a primary press
 * as the trace begins, where it began, is the second of the double-click
 * that began it (Quick Add's chain icon double-clicked), and does nothing:
 * it ended the chain at its first bond, the trace that followed drawing
 * none.
 */
export function traceEndedBy(button: number, since: number, moved: boolean, doubleClickMs: number): "end" | "let go" | "second click" {
  if (button !== 0) return "let go";
  return !moved && since < doubleClickMs ? "second click" : "end";
}

/**
 * Whether a click (its `detail`, the count the system gives) opens or shuts
 * a panel that a click toggles - Quick Add's SMILES, Shapes, Calculations:
 * the first click of a double-click does, the second not. Double-clicked,
 * a panel opened and shut again at once, and was never seen open. A click
 * from the keyboard, its count naught, toggles as one.
 */
export function togglesOn(detail: number): boolean {
  return detail < 2;
}

/** What comes of a press after its pointerdown: none of it is heard of a press swallowed. */
const AFTER_PRESS = ["mousedown", "pointerup", "mouseup", "click", "auxclick", "contextmenu"] as const;

/**
 * A press swallowed (`down`, its pointerdown, heard first): nothing else
 * hears of it - not the press, nor its release, nor the click or the menu
 * that come of it. A press that closes a menu or Quick Add only closes it,
 * as on a Mac (the maintainer, 2026-10-12): it used to go on to the atom
 * under it, whose label began to be written half a second later. It is
 * over a moment after the release, or should no release come, after `most`
 * ms.
 */
export function swallowPress(down: Event, on: EventTarget = window, most = 10_000): void {
  down.stopPropagation();
  down.preventDefault();
  const stop = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    // (the click, or the auxclick, comes straight after the release)
    if (e.type === "pointerup") setTimeout(off, 0);
  };
  const off = () => {
    clearTimeout(late);
    for (const type of AFTER_PRESS) on.removeEventListener(type, stop, { capture: true });
  };
  for (const type of AFTER_PRESS) on.addEventListener(type, stop, { capture: true });
  const late = setTimeout(off, most);
}

/**
 * Whether a release on a bond (`id`) ends a click on it: the main button's,
 * after a press that began on that bond with it (`armed`). A right press
 * is the bond's menu's; a release after a press elsewhere is no click.
 * A press's arming is used up by its release: left armed, a right-click
 * on the bond clicked last cycled it (a wedge became hashed) and shut the
 * menu it opened.
 */
export function releaseClicksBond(armed: { armed: boolean; downBondId: number | null }, id: number, button: number): boolean {
  return button === 0 && armed.armed && armed.downBondId === id;
}
