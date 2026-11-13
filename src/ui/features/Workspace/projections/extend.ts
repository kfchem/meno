/**
 * A bond dragged out of an atom of a chair (docs/EDITOR-2D.md, *Projections*: groups are drawn by extension): it goes to one of that atom's free
 * positions as F9 gives them, seen as the chair is seen - the one whose seen direction is nearest the pointer's - and nowhere between, so that
 * nothing the chair is extended with is left unread. Pure: the model in, where the bond ends and what the place is called out.
 */
import type { Atom, Bond } from "../store/types";
import { chairDrawing, chairOf, depthRings, seenPlaces, snapTo, type SeenPlace } from "./chair";

/** Where a bond out of `tip` ends, and what the place is called ("axial", "equatorial"). */
export type ChairExtension = { end: { x: number; y: number }; name: string };

const NEAR = 1e-3;

/**
 * The place a bond dragged out of atom `tip` to `pointer` takes, where `tip` is an atom of a chair of the tool's (`chairOf`): the nearer of its
 * free positions that no group holds already. None where `tip` is on no such chair, or both its places are held, and the stroke goes as any.
 */
export function chairExtension(model: { atoms: readonly Atom[]; bonds: readonly Bond[] }, tip: number, pointer: { x: number; y: number }): ChairExtension | null {
  const atoms = model.atoms as Atom[];
  const bonds = model.bonds as Bond[];
  // (nothing drawn with depth: nothing to look for, at every frame of every drag)
  if (!atoms.some((a) => a.z != null)) return null;
  for (const ring of depthRings({ atoms, bonds })) {
    if (!ring.includes(tip)) continue;
    const found = chairOf({ atoms }, ring);
    if (!found) continue;
    const d = chairDrawing({ at: found.at, form: found.form, flip: found.flip, firstId: 1, firstBondId: 1, length: found.scale });
    const k = found.index.get(tip)!;
    const here = atoms.find((a) => a.id === tip)!;
    // (the places a group holds already: a neighbour off the ring standing at one of the atom's free positions)
    const byId = new Map(atoms.map((a) => [a.id, a]));
    const places = seenPlaces(d, k);
    const taken: SeenPlace["free"]["kind"][] = [];
    for (const b of bonds) {
      const other = b.a === tip ? b.b : b.b === tip ? b.a : null;
      if (other == null || ring.includes(other)) continue;
      const g = byId.get(other);
      if (!g) continue;
      const held = places.find((p) => Math.hypot(g.x - here.x - (p.place.x - d.atoms[k].x), g.y - here.y - (p.place.y - d.atoms[k].y)) < NEAR * 100);
      if (held) taken.push(held.free.kind);
    }
    const place = snapTo(d, k, pointer, taken);
    if (!place) return null;
    // (the new atom where the free position says, as the chair's own atoms are: the seen vector of that bond, not a bond's length along it)
    return { end: place.place, name: place.free.kind };
  }
  return null;
}
