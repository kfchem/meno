/**
 * A pointer resting over a view while the view moves under it - two fingers
 * on a trackpad, a wheel's zoom, a glide, a fit - comes to be over something
 * else without moving. What is lit as under it, and what a press there will
 * take hold of, is found again then, as a move of no distance would find it:
 * the way a browser moves the pointer by nothing after a page scrolls.
 *
 * Only a mouse rests: a finger or a pen lifted is over nothing. And with a
 * button held a gesture has the pointer, and finds for itself.
 */

export type PointerLike = {
  type: string;
  clientX: number;
  clientY: number;
  pointerId: number;
  pointerType: string;
  buttons: number;
};

/** Where a pointer rests, to be moved to again. */
export type Resting = { clientX: number; clientY: number; pointerId: number };

export type View = { x: number; y: number; zoom: number };

/**
 * A watch on one view's pointer: what it has heard, where the pointer rests,
 * and whether something has moved under it since it was last found.
 */
export function stillPointer() {
  let at: (Resting & { buttons: number }) | null = null;
  let due = false;
  const resting = (): Resting | null =>
    at && at.buttons === 0 ? { clientX: at.clientX, clientY: at.clientY, pointerId: at.pointerId } : null;
  return {
    /**
     * A pointer event heard on the view (pointermove, -down, -up, -leave,
     * -cancel). True where the pointer has come to rest with something
     * moved under it: a frame is wanted, to find again what is under it.
     */
    heard(e: PointerLike): boolean {
      if (e.type === "pointerleave" || e.type === "pointercancel" || e.pointerType !== "mouse") {
        at = null;
        due = false;
        return false;
      }
      at = { clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId, buttons: e.buttons };
      // (a move finds for itself)
      if (e.type === "pointermove" && e.buttons === 0) due = false;
      return due && e.type === "pointerup" && e.buttons === 0;
    },
    /** Where the pointer rests over the view, with no button held; or null. */
    resting,
    /** Something has moved under the pointer: the view, or what is on it. */
    moved() {
      due = true;
    },
    /**
     * Where to move the pointer by no distance, once, to find again what is
     * under it: when something has moved under it, and it rests - a move
     * made with a button held waits until the button is let go.
     */
    findAgain(): Resting | null {
      if (!due) return null;
      const r = resting();
      if (r) due = false;
      return r;
    },
  };
}

/** Whether the view has moved from where it was. */
export function viewMoved(was: View | null, now: View): boolean {
  if (!was) return false;
  return was.x !== now.x || was.y !== now.y || was.zoom !== now.zoom;
}
