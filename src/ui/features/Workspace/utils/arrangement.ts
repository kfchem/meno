/**
 * Which of an atom's neighbours lie next to each other round it, as drawn: what a square-planar centre's arrangement is (cis or
 * trans), and what its mark - "which donors are next to each other is not given" - stays while (docs/LAYOUT-2D.md, *A metal with
 * four bonds*). Pure: the atom, the drawing's atoms and bonds in; a string out.
 */
import type { Atom, Bond } from "../store/types";
import { atomAs } from "./atomAs";

/** What an arrangement mark's `as` begins with: it is compared with `arrangementAs`, not `atomAs`. */
export const ARRANGED = "arrangement|";

/** The line an arrangement mark says. */
export const ARRANGEMENT_SAID = "Which donors are next to each other is not given.";

/** The atom as `atomAs` has it, and the pairs of its neighbours next to each other round it, by id: changed by moving them round. */
export function arrangementAs(a: Pick<Atom, "id" | "el" | "charge" | "x" | "y">, atoms: readonly Pick<Atom, "id" | "x" | "y">[], bonds: readonly Bond[]): string {
  const byId = new Map(atoms.map((p) => [p.id, p]));
  const round = bonds
    .filter((b) => b.a === a.id || b.b === a.id)
    .map((b) => (b.a === a.id ? b.b : b.a))
    .map((id) => ({ id, t: Math.atan2((byId.get(id)?.y ?? a.y) - a.y, (byId.get(id)?.x ?? a.x) - a.x) }))
    .sort((p, q) => p.t - q.t);
  const pairs = round.map((p, i) => {
    const q = round[(i + 1) % round.length];
    return p.id < q.id ? `${p.id}-${q.id}` : `${q.id}-${p.id}`;
  });
  return `${ARRANGED}${atomAs(a, bonds)}|${[...new Set(pairs)].sort().join(",")}`;
}
