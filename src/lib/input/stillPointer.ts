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

/** A watch on one view's pointer: what it has heard, and where the pointer rests. */
export function stillPointer() {
  let at: (Resting & { buttons: number }) | null = null;
  return {
    /** A pointer event heard on the view (pointermove, -down, -up, -leave, -cancel). */
    heard(e: PointerLike) {
      if (e.type === "pointerleave" || e.type === "pointercancel" || e.pointerType !== "mouse") {
        at = null;
        return;
      }
      at = { clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId, buttons: e.buttons };
    },
    /** Where the pointer rests over the view, with no button held; or null. */
    resting(): Resting | null {
      return at && at.buttons === 0 ? { clientX: at.clientX, clientY: at.clientY, pointerId: at.pointerId } : null;
    },
  };
}

/** Whether the view has moved from where it was. */
export function viewMoved(was: View | null, now: View): boolean {
  if (!was) return false;
  return was.x !== now.x || was.y !== now.y || was.zoom !== now.zoom;
}
