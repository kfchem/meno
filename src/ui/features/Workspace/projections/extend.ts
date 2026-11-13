/**
 * A bond dragged out of an atom of a projection - a chair, a Haworth ring (docs/EDITOR-2D.md, *Projections*: groups are drawn by extension): it goes to
 * one of that atom's free positions as F9 gives them, seen as the solid is seen - the one whose seen direction is nearest the pointer's - and
 * nowhere between, so that nothing a projection is extended with is left unread. Pure: the model in, where the bond ends and what the place is called out.
 */
import type { Atom, Bond } from "../store/types";
import { seenPlaces, snapTo, type SeenPlace } from "./chair";
import { projectionsIn } from "./rings";

/** Where a bond out of `tip` ends, and what the place is called ("axial", "equatorial", "up", "down"). */
export type ChairExtension = { end: { x: number; y: number }; name: string };

const NEAR = 1e-3;

/**
 * The place a bond dragged out of atom `tip` to `pointer` takes, where `tip` is an atom of a projection of the tool's: the nearer of its free
 * positions that no group holds already. None where `tip` is on no such ring, or both its places are held, and the stroke goes as any.
 */
export function chairExtension(model: { atoms: readonly Atom[]; bonds: readonly Bond[] }, tip: number, pointer: { x: number; y: number }): ChairExtension | null {
  const atoms = model.atoms as Atom[];
  const bonds = model.bonds as Bond[];
  for (const found of projectionsIn({ atoms, bonds })) {
    if (!found.ring.includes(tip)) continue;
    const d = found.drawing;
    const k = found.index.get(tip)!;
    const here = atoms.find((a) => a.id === tip)!;
    // (the places a group holds already: a neighbour off the ring standing at one of the atom's free positions)
    const byId = new Map(atoms.map((a) => [a.id, a]));
    const places = seenPlaces(d, k);
    const taken: SeenPlace["free"]["kind"][] = [];
    for (const b of bonds) {
      const other = b.a === tip ? b.b : b.b === tip ? b.a : null;
      if (other == null || found.ring.includes(other)) continue;
      const g = byId.get(other);
      if (!g) continue;
      const held = places.find((p) => Math.hypot(g.x - here.x - (p.place.x - d.atoms[k].x), g.y - here.y - (p.place.y - d.atoms[k].y)) < NEAR * 100);
      if (held) taken.push(held.free.kind);
    }
    const place = snapTo(d, k, { x: pointer.x - here.x + d.atoms[k].x, y: pointer.y - here.y + d.atoms[k].y }, taken);
    if (!place) return null;
    // (the new atom where the free position says, as the ring's own atoms are: the seen vector of that bond, not a bond's length along it)
    return { end: { x: here.x + place.place.x - d.atoms[k].x, y: here.y + place.place.y - d.atoms[k].y }, name: place.free.kind };
  }
  return null;
}

/**
 * Where the bond after a projection's group goes, out of `tip`, its first atom - an atom whose one bond is to an atom of a projection of the
 * tool's, standing at one of that atom's free positions: 120 degrees from that bond, to the side nearer the pointer, `length` long. Never on
 * along the group's own line: two bonds in one line hide the atom between them, and a CH2OH drawn straight up reads as one bond to an OH
 * (docs/EDITOR-2D.md, *Projections*). None where `tip` is no such atom, and the stroke goes as any.
 */
export function groupBend(model: { atoms: readonly Atom[]; bonds: readonly Bond[] }, tip: number, pointer: { x: number; y: number }, length: number): { end: { x: number; y: number }; from: number } | null {
  const atoms = model.atoms as Atom[];
  const bonds = model.bonds as Bond[];
  const own = bonds.filter((b) => b.a === tip || b.b === tip);
  if (own.length !== 1) return null;
  const stem = own[0].a === tip ? own[0].b : own[0].a;
  const byId = new Map(atoms.map((a) => [a.id, a]));
  const here = byId.get(tip);
  const root = byId.get(stem);
  if (!here || !root) return null;
  for (const found of projectionsIn({ atoms, bonds })) {
    if (!found.ring.includes(stem) || found.ring.includes(tip)) continue;
    const d = found.drawing;
    const k = found.index.get(stem)!;
    // (the group stands at one of the ring atom's free positions: a bond drawn elsewhere by hand is the chemist's own)
    const at = seenPlaces(d, k).some((p) => Math.hypot(here.x - root.x - (p.place.x - d.atoms[k].x), here.y - root.y - (p.place.y - d.atoms[k].y)) < NEAR * 100);
    if (!at) return null;
    const back = Math.atan2(root.y - here.y, root.x - here.x);
    const want = Math.atan2(pointer.y - here.y, pointer.x - here.x);
    const off = (a: number) => Math.abs(Math.atan2(Math.sin(a - want), Math.cos(a - want)));
    const turns = [back + (2 * Math.PI) / 3, back - (2 * Math.PI) / 3];
    const angle = off(turns[0]) <= off(turns[1]) ? turns[0] : turns[1];
    return { end: { x: here.x + length * Math.cos(angle), y: here.y + length * Math.sin(angle) }, from: back };
  }
  return null;
}
