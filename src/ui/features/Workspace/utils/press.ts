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
