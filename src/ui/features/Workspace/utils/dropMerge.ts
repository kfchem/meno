import type { Model } from "../store/types";
import { hapticStars } from "../chem/eta";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";

/** How near the pointer must be to an atom for a dragged atom to be dropped onto it, in bond lengths. */
export const DROP_REACH = 0.4;

/** How clear of every other atom a snap stands, in bond lengths: no atom drawn all but on another. */
export const SNAP_CLEAR = 0.75;

const neighboursOf = (model: Pick<Model, "bonds">, id: number): Set<number> => {
  const out = new Set<number>();
  for (const b of model.bonds) {
    if (b.a === id) out.add(b.b);
    else if (b.b === id) out.add(b.a);
  }
  return out;
};

/**
 * Whether a dragged atom may become another atom on being dropped on it.
 * Only where nothing is lost by it but the atom: not onto an atom it is
 * bonded to (it would just vanish into its neighbour), and not onto one that
 * shares a neighbour with it (two bonds would fold into one, and the second's
 * order and wedge with it). A drag never merges what it was not meant to
 * (2026-11-11: dragging a tert-butyl's centre onto a methyl left the
 * structure with carbons gone).
 */
export function mayBecome(model: Pick<Model, "atoms" | "bonds">, movingId: number, targetId: number): boolean {
  if (movingId === targetId) return false;
  // (both there: one an undo took away while the button was down is no atom to become)
  if (!model.atoms.some((a) => a.id === movingId) || !model.atoms.some((a) => a.id === targetId)) return false;
  const mine = neighboursOf(model, movingId);
  if (mine.has(targetId)) return false;
  for (const n of neighboursOf(model, targetId)) if (mine.has(n)) return false;
  return true;
}

/**
 * The atom a dragged atom would become on being dropped with the pointer at
 * `pointer`: the nearest atom within DROP_REACH of the pointer itself - never
 * of where the drag snaps to - that `mayBecome` allows. A haptic bond's star
 * is no atom to land on (chem/eta).
 */
export function mergeTarget(model: Model, movingId: number, pointer: { x: number; y: number }): number | null {
  const stars = hapticStars(model);
  const reach = NOMINAL_BOND_LENGTH * DROP_REACH;
  let best: { id: number; d: number } | null = null;
  for (const a of model.atoms) {
    if (a.id === movingId || stars.has(a.id)) continue;
    const d = Math.hypot(pointer.x - a.x, pointer.y - a.y);
    if (d <= reach && (!best || d < best.d)) best = { id: a.id, d };
  }
  return best && mayBecome(model, movingId, best.id) ? best.id : null;
}
