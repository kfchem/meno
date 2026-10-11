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
 * A watch on one view's pointer: what it has heard, and whether something
 * has moved under the pointer since it was last found.
 */
export function stillPointer() {
  let at: PointerAt | null = null;
  let due = false;
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
    findAgain(): PointerAt | null {
      if (!due || !at) return null;
      due = false;
      return { ...at };
    },
  };
}

/** Whether the view has moved from where it was. */
export function viewMoved(was: View | null, now: View): boolean {
  if (!was) return false;
  return was.x !== now.x || was.y !== now.y || was.zoom !== now.zoom || was.width !== now.width || was.height !== now.height;
}
