/**
 * The Haworth tool's drawing (docs/EDITOR-2D.md, *Projections*; foundation part 10): a pyranose's ring of six or a furanose's of five, seen from
 * slightly above so that the nearer edge is drawn lower, the ring O behind and C-1 at the right-hand end (McNaught 1996, 2-Carb-5.4). Ordinary atoms and
 * bonds that carry their depth, like the chair's; the ring O is an atom like any, and can be changed. Free positions: up and down at each atom, vertical
 * on the page. Pure.
 */
import { haworth } from "../../../../lib/chem/perception/projection/solids";
import { standardView } from "../../../../lib/chem/perception/projection/views";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import type { Atom, Bond } from "../store/types";
import { depthRings, drawSolid, type ChairDrawing } from "./chair";

/** A Haworth ring of `size` 6 (a pyranose) or 5 (a furanose), its middle at `at`: atom k of the solid (the ring O first, then C-1 on) is `firstId + k`, its bond k `firstBondId + k`; the front edge bold. */
export function haworthDrawing(opts: { at: { x: number; y: number }; size?: 5 | 6; firstId: number; firstBondId: number; length?: number }): ChairDrawing {
  const solid = haworth(opts.size ?? 6);
  return drawSolid({ solid, view: standardView(solid), at: opts.at, firstId: opts.firstId, firstBondId: opts.firstBondId, length: opts.length, element: (k) => (k === 0 ? "O" : "C") });
}

/** A Haworth ring found on a page: its size, where its middle is, and each ring atom's place in the solid. */
export type FoundHaworth = { size: 5 | 6; at: { x: number; y: number }; index: Map<number, number> };

/**
 * The Haworth ring a ring of the drawing is, where its atoms' places and depths are the tool's, to within a part in a million of a bond - whatever
 * their elements, the ring O being an atom like any: none where they are not (a ring drawn by hand, or seen another way).
 */
export function haworthOf(model: { atoms: Atom[] }, ring: readonly number[]): FoundHaworth | null {
  const size = ring.length;
  if (size !== 5 && size !== 6) return null;
  const at = new Map(model.atoms.map((a) => [a.id, a]));
  const atoms = ring.map((id) => at.get(id));
  if (atoms.some((a) => !a || a.z == null)) return null;
  const places = atoms as Atom[];
  const middle = { x: places.reduce((s, a) => s + a.x, 0) / size, y: places.reduce((s, a) => s + a.y, 0) / size };
  const d = haworthDrawing({ at: middle, size, firstId: 1, firstBondId: 1 });
  for (let turn = 0; turn < size; turn++) {
    for (const way of [1, -1]) {
      const mine = places.map((_, i) => d.atoms[(turn + way * i + size) % size]);
      if (places.every((a, i) => Math.hypot(a.x - mine[i].x, a.y - mine[i].y, (a.z ?? 0) - (mine[i].z ?? 0)) < 1e-6 * NOMINAL_BOND_LENGTH * 100)) {
        return { size, at: middle, index: new Map(ring.map((id, i) => [id, (turn + way * i + size) % size])) };
      }
    }
  }
  return null;
}

/** The Haworth rings among the atoms `ids` (a structure's), each as atom ids in order round it. */
export function haworthsIn(model: { atoms: Atom[]; bonds: Bond[] }, ids: ReadonlySet<number>): number[][] {
  const part = { atoms: model.atoms.filter((a) => ids.has(a.id)), bonds: model.bonds.filter((b) => ids.has(b.a) && ids.has(b.b)) };
  return [...depthRings(part, 5), ...depthRings(part, 6)].filter((ring) => haworthOf(part, ring) != null);
}

