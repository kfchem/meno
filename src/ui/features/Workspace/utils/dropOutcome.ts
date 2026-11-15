import type { Model } from "../store/types";
import { mergeTarget } from "./dropMerge";
import { computeMoveSnap, onAnotherAtom, snapAngleAbout } from "./moveSnap";
import { bondLengthFrom } from "./magnified";

type Point = { x: number; y: number };

/** What dropping a dragged atom does: it becomes another atom, goes to a place, or stays where it was. */
export type DropOutcome = { merge: number } | { move: Point } | { stay: true };

/**
 * What the button's release does to an atom dragged, the pointer at
 * `pointer`: it becomes the atom the pointer is on, where it may
 * (utils/dropMerge); else it goes where it snaps to - to the pointer
 * itself, once held still (`free`), unless that is on an atom - and where
 * that is on an atom, or all places are taken, it stays. A drag merges
 * nothing but by the first, which the preview shows before the drop.
 * `grab` is how far the atom lay from the pointer as it was taken.
 */
export function dropOutcome(model: Model, movingId: number, pointer: Point, grab: Point, free: boolean): DropOutcome {
  const moving = model.atoms.find((a) => a.id === movingId);
  if (!moving) return { stay: true };
  const onto = mergeTarget(model, movingId, pointer);
  if (onto != null) return { merge: onto };
  const nbrs: number[] = [];
  for (const b of model.bonds) {
    if (b.a === movingId) nbrs.push(b.b);
    else if (b.b === movingId) nbrs.push(b.a);
  }
  // (as long as the bonds of its structure are shown)
  const L = bondLengthFrom(model.atoms, movingId);
  const only = nbrs.length === 1 ? model.atoms.find((a) => a.id === nbrs[0]) : undefined;
  let at: Point = { x: pointer.x + grab.x, y: pointer.y + grab.y };
  if (free && !onAnotherAtom(model, movingId, pointer, L)) {
    at = pointer;
  } else if (only) {
    const turn = snapAngleAbout(model, movingId, only, pointer, L);
    at = { x: only.x + L * Math.cos(turn), y: only.y + L * Math.sin(turn) };
  } else if (nbrs.length >= 2) {
    const snap = computeMoveSnap(model, movingId, pointer);
    if (Number.isFinite(snap.px) && Number.isFinite(snap.py)) at = { x: snap.px, y: snap.py };
  }
  return onAnotherAtom(model, movingId, at, L) ? { stay: true } : { move: at };
}
