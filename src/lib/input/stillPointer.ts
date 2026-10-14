/**
 * A pointer held still over a view while the view moves under it - two
 * fingers on a trackpad, a wheel's zoom, a glide, a fit - comes to be over
 * something else without moving. What is lit as under it, and what a press
 * there will take hold of, is found again then, as a move of no distance
 * would find it: the way a browser moves the pointer by nothing after a
 * page scrolls - and likewise when the window is resized round it. With a
 * button held, what the press drags - an atom, a box's corner - goes on
 * following the pointer the same way, rather than staying where the view
 * took it and jumping back at the next move.
 *
 * Only a mouse stays over the view: a finger or a pen lifted is over nothing.
 */

export type PointerLike = {
  type: string;
  clientX: number;
  clientY: number;
  pointerId: number;
  pointerType: string;
  buttons: number;
};

/** Where a pointer is, and the buttons held: to be moved there again. */
export type PointerAt = { clientX: number; clientY: number; pointerId: number; buttons: number };

/** Where a view looks, how near, and how large it is (a window resized moves what is under the pointer too). */
export type View = { x: number; y: number; zoom: number; width: number; height: number };

/**
 * How often, at most, what is under a pointer with no button held is found
 * again while the view goes on moving under it, in ms: each finding tries
 * everything on the canvas - 7 to 10 ms a frame over 28 000 atoms - and
 * what is lit can wait a few frames. With a button held, what the press
 * drags follows at every frame.
 */
export const FIND_EVERY_MS = 100;

/**
 * A watch on one view's pointer: what it has heard, and whether something
 * has moved under the pointer since it was last found.
 */
export function stillPointer() {
  let at: PointerAt | null = null;
  let due = false;
  let last = -Infinity;
  return {
    /**
     * A pointer event heard on the view (pointermove, -down, -up, -leave,
     * -cancel). True where the button has been let go with something moved
     * under the pointer still to be found: a frame is wanted, to find it.
     */
    heard(e: PointerLike): boolean {
      if (e.type === "pointerleave" || e.type === "pointercancel" || e.pointerType !== "mouse") {
        at = null;
        due = false;
        return false;
      }
      at = { clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId, buttons: e.buttons };
      // (a move finds for itself)
      if (e.type === "pointermove") due = false;
      return due && e.type === "pointerup";
    },
    /** Something has moved under the pointer: the view, or what is on it. */
    moved() {
      due = true;
    },
    /**
     * Where to move the pointer by no distance, once, to find again what is
     * under it: when something has moved under it, and it is over the view.
     */
    findAgain(now: number = performance.now()): PointerAt | null {
      if (!due || !at) return null;
      // (no button held, found a moment ago: put off - `wait` says for how long)
      if (at.buttons === 0 && now - last < FIND_EVERY_MS) return null;
      due = false;
      last = now;
      return { ...at };
    },
    /** How long until a finding put off (`findAgain`) is due, in ms; null where none waits. */
    wait(now: number = performance.now()): number | null {
      return due && at ? Math.max(0, FIND_EVERY_MS - (now - last)) : null;
    },
  };
}

/** Whether the view has moved from where it was. */
export function viewMoved(was: View | null, now: View): boolean {
  if (!was) return false;
  return was.x !== now.x || was.y !== now.y || was.zoom !== now.zoom || was.width !== now.width || was.height !== now.height;
}

/**
 * Whether the view has moved under a press held still: the page point under
 * the pointer `now` lies `px` screen pixels or more from the one the press
 * began on, `was`, at `zoom` pixels a page unit - as far as a press may
 * travel before it is no click (MOV_PX).
 */
export function movedUnderPress(was: { x: number; y: number }, now: { x: number; y: number }, zoom: number, px: number): boolean {
  return Math.hypot(now.x - was.x, now.y - was.y) * zoom >= px;
}
