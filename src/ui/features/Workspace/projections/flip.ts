/**
 * *Flip chair* on a page (docs/EDITOR-2D.md, *Projections*): the ring flip of a chair of the tool's as a change to make, guarded - the compound is
 * the same after it, or nothing is moved and Meno says so. Pure: the model in, the places out.
 */
import { sameStereo } from "../chem/engineLayout";
import type { Model } from "../store/types";
import { chairsIn, flipChairMoves } from "./chair";

export type Flip = { moves: { id: number; x: number; y: number; z?: number }[] } | { refused: string };

/**
 * The flip of the one chair in the structure `ids`: every ring atom's place and depth as the flipped solid has them, each group from axial to
 * equatorial or back on its own face. None where the structure holds no chair or more than one (the fused systems: cis flips as a whole, trans not,
 * and the tool does not offer either yet), or a group stands at neither of its atom's free positions (drawn by hand: nothing is guessed). `refused`
 * where the flip would have changed the compound - a fault of Meno's, said as one and nothing moved.
 */
export function flipOf(model: Model, ids: ReadonlySet<number>): Flip | null {
  const rings = chairsIn(model, ids);
  if (rings.length !== 1) return null;
  const moved = flipChairMoves(model, rings[0]);
  if (!moved) return null;
  const after: Model = { atoms: model.atoms.map((a) => (moved.has(a.id) ? { ...a, ...moved.get(a.id)! } : a)), bonds: model.bonds };
  if (!sameStereo(model, after)) return { refused: "Flipping the chair would have changed the compound, so nothing was moved. That is a fault in Meno, not in the drawing." };
  return { moves: [...moved].map(([id, m]) => ({ id, ...m })) };
}
