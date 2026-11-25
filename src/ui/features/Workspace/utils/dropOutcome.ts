import type { Model } from "../store/types";
import { mergeTarget } from "./dropMerge";
import { computeMoveSnap, onAnotherAtom, snapAngleAbout } from "./moveSnap";
import { bondLengthFrom } from "./magnified";
import { projectionDrop } from "../projections/extend";

type Point = { x: number; y: number };

/** What dropping a dragged atom does: it becomes another atom, goes to a place, changes places with a projection's other group (`swap`: every atom that moves, and where), or stays where it was. */
export type DropOutcome = { merge: number } | { move: Point } | { swap: { id: number; x: number; y: number }[] } | { stay: true };

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
  // (a group of a chair, a Haworth ring or a Newman pair: to one of its atom's positions, paused or not, joined to nothing - projections/extend)
  const place = projectionDrop(model, movingId, pointer);
  if (place?.swap) return { swap: [...place.swap].map(([id, p]) => ({ id, x: p.x, y: p.y })) };
  if (place) return onAnotherAtom(model, movingId, place.to, bondLengthFrom(model.atoms, movingId)) ? { stay: true } : { move: place.to };
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
