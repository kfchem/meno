/**
 * A copy put beside what it was made from - a molecule in 3D a value was
 * set on that is a calculation's result, which is never edited itself - is
 * seen: where it is out of view, the view glides just as far as shows it
 * and what it was made from; where both do not fit, as far as shows the
 * copy. Undone, the view goes back, if it is still where the copy took it.
 */
import type { ViewGoal } from "../components/viewGoal";

/** A box on the page, in its units (y up). */
export type PageBox = { minX: number; maxX: number; minY: number; maxY: number };

/** How much room is kept round what is brought into view, in screen pixels. */
export const SEEN_ROOM_PX = 24;

/** What of the page the view shows: the canvas's size, and how much of its right side the column covers, in screen pixels. */
export type Seen = { width: number; height: number; cover: number };

/** The view, moved as little as brings `box` (with room round it) inside what is seen; none, where it is already. Null where it cannot fit at this zoom. */
function shiftedOver(view: ViewGoal, seen: Seen, box: PageBox): ViewGoal | null | "fits" {
  const z = view.zoom;
  const room = SEEN_ROOM_PX / z;
  const left = view.x - seen.width / 2 / z;
  const right = left + Math.max(0, seen.width - seen.cover) / z;
  const bottom = view.y - seen.height / 2 / z;
  const top = view.y + seen.height / 2 / z;
  const b = { minX: box.minX - room, maxX: box.maxX + room, minY: box.minY - room, maxY: box.maxY + room };
  if (b.maxX - b.minX > right - left || b.maxY - b.minY > top - bottom) return null;
  const dx = b.minX < left ? b.minX - left : b.maxX > right ? b.maxX - right : 0;
  const dy = b.minY < bottom ? b.minY - bottom : b.maxY > top ? b.maxY - top : 0;
  return dx === 0 && dy === 0 ? "fits" : { zoom: z, x: view.x + dx, y: view.y + dy };
}

/**
 * Where the view is to glide so that `copy`, just put beside `from`, is
 * seen: none where it is seen already; else as little as shows both, or -
 * where both do not fit at this zoom - as shows the copy, its middle in the
 * middle of what is seen where even it does not fit. The zoom is kept.
 */
export function viewShowingCopy(view: ViewGoal, seen: Seen, from: PageBox, copy: PageBox): ViewGoal | null {
  const alone = shiftedOver(view, seen, copy);
  if (alone === "fits") return null;
  const both = shiftedOver(view, seen, { minX: Math.min(from.minX, copy.minX), maxX: Math.max(from.maxX, copy.maxX), minY: Math.min(from.minY, copy.minY), maxY: Math.max(from.maxY, copy.maxY) });
  if (both && both !== "fits") return both;
  if (alone) return alone;
  // (larger than what is seen: its middle in the middle of it)
  const z = view.zoom;
  return { zoom: z, x: (copy.minX + copy.maxX) / 2 + seen.cover / 2 / z, y: (copy.minY + copy.maxY) / 2 };
}

/** The view the copy's glide began from, to go back to as the copy is undone - where the view is still where the glide took it; none, where it has been moved since. */
export function viewBack(before: ViewGoal, went: ViewGoal, now: ViewGoal): ViewGoal | null {
  const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
  // (within a pixel of where it went, at the same zoom)
  const still = near(now.zoom, went.zoom) && Math.abs(now.x - went.x) * now.zoom <= 1 && Math.abs(now.y - went.y) * now.zoom <= 1;
  return still ? before : null;
}
