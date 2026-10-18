/**
 * When the pointer leaving a label being written keeps it (docs/EDITOR-2D.md,
 * *Labels typed in place*): the pointer is still at the label within the
 * atom's own disc (ATOM_PICK_RADIUS_RATIO, as it is picked) or its letters,
 * or `STILL_AT` of a bond from either. Out past that for `LEAVE_MS`
 * together, the label is kept - at once, past `GONE` of a bond: a hand's
 * tremor keeps nothing, a move away keeps it. Only once the pointer has
 * been at the label: one opened from the atom's menu waits for it to come.
 */
import { ATOM_PICK_RADIUS_RATIO } from "../constants";

type Pt = { x: number; y: number };
/** The letters' box, on the page. */
type Box = { x0: number; x1: number; y0: number; y1: number };

export const STILL_AT = 0.15;
export const LEAVE_MS = 150;
export const GONE = 0.5;

/** How far `q` is out past where the pointer is still at the label: 0 where it is. `L`, a bond's length. */
export function pastLabel(q: Pt, at: Pt, box: Box, L: number): number {
  const disc = Math.hypot(q.x - at.x, q.y - at.y) - ATOM_PICK_RADIUS_RATIO * L;
  const out = Math.hypot(Math.max(box.x0 - q.x, 0, q.x - box.x1), Math.max(box.y0 - q.y, 0, q.y - box.y1));
  return Math.max(0, Math.min(disc, out) - STILL_AT * L);
}

/**
 * The pointer watched as it moves over a label being written: `point`, told
 * how far past it the pointer is (pastLabel) and whether a button is held -
 * a drag among its letters, selecting, leaves nothing; `out`, the pointer
 * gone from the canvas. `keep` is called once, as it leaves.
 */
export function leaveWatch(o: { keep: () => void; L: number; armed: boolean }) {
  let armed = o.armed;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let done = false;
  const stop = () => {
    if (timer != null) clearTimeout(timer);
    timer = null;
  };
  const keep = () => {
    stop();
    if (done) return;
    done = true;
    o.keep();
  };
  return {
    point(past: number, held: boolean) {
      if (done || held) return;
      if (past === 0) {
        armed = true;
        stop();
        return;
      }
      if (!armed) return;
      if (past > GONE * o.L) keep();
      else if (timer == null) timer = setTimeout(keep, LEAVE_MS);
    },
    out(held: boolean) {
      if (armed && !held) keep();
    },
    stop,
  };
}
