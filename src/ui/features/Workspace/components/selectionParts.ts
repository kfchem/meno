import { allylArcOf, hapticStars } from "../chem/eta";
import type { Model } from "../store/types";

type Point = { x: number; y: number };

/** A part of the drawing shaded as selected: an atom where it stands, or a bond between its atoms. */
export type ShadedPart = { atom?: Point; bond?: { p: Point; q: Point } };

/** How many instances a mesh is made with: room for `n`, doubling, so that it is made again seldom. */
export function roomFor(n: number): number {
  let room = 64;
  while (room < n) room *= 2;
  return room;
}

/**
 * The parts selected now - each atom, and each bond between two atoms
 * there are - with where each stands, keyed as their shading is: `a<id>`,
 * `b<id>`.
 */
export function selectedParts(shown: Model, atoms: ReadonlySet<number>, bonds: ReadonlySet<number>): Map<string, ShadedPart> {
  const at = new Map(shown.atoms.map((a) => [a.id, a]));
  const parts = new Map<string, ShadedPart>();
  // (a haptic bond's star no disc of its own: its bond is shaded to it - chem/eta)
  const stars = hapticStars(shown);
  for (const id of atoms) {
    const a = at.get(id);
    if (a && !stars.has(id)) parts.set(`a${id}`, { atom: { x: a.x, y: a.y } });
  }
  for (const b of shown.bonds) {
    if (!bonds.has(b.id)) continue;
    const p = at.get(b.a);
    const q = at.get(b.b);
    if (p && q) parts.set(`b${b.id}`, { bond: { p: { x: p.x, y: p.y }, q: { x: q.x, y: q.y } } });
    // (an η3-allyl's bond: its arc shaded with it, piece by piece - chem/eta)
    const arc = b.endpoints?.length === 3 ? allylArcOf(b, at, shown.bonds) : null;
    for (let k = 1; arc && k < arc.length; k++) parts.set(`b${b.id}~${k}`, { bond: { p: arc[k - 1], q: arc[k] } });
  }
  return parts;
}
