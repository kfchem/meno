/**
 * The Haworth tool's drawing (docs/EDITOR-2D.md, *Projections*; foundation part 10): a pyranose's ring of six or a furanose's of five, drawn as
 * the solids draw one (`drawn`, rule (H): a true view from above, the eye's height the angle whose sine is 2/3, so that the nearer edge is drawn
 * lower, the ring O behind and C-1 at the right-hand end - McNaught 1996, 2-Carb-5.4), larger than the style's bond (`HAWORTH_SCALE`).
 * Ordinary atoms and bonds that carry their depth, like the chair's; the ring O is an atom like any, and can be changed. Free positions: up
 * and down at each atom, straight up and down the page, at the drawn lengths. Pure.
 */
import { haworth } from "../../../../lib/chem/perception/projection/solids";
import { drawn } from "../../../../lib/chem/perception/projection/views";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import type { Atom, Bond } from "../store/types";
import { depthRings, type ChairDrawing } from "./chair";

/**
 * How much longer than the style's bond a Haworth ring's level bond is drawn, so that two labels inside the ring on one vertical - a front
 * atom's up group and the back atom's down group above it - do not meet: 1.8, the proportion of the figure under Brecher 2006's ST-1.9
 * against Meno's ACS style (at 1.5 those two labels touch). A matter of look, the look check's to settle on the sheet. Never under 1.25: below
 * 1.22 a group's place lies within the join's reach (`JOIN_REACH`) of a ring atom beside it.
 */
export const HAWORTH_SCALE = 1.8;

/**
 * A Haworth ring of `size` 6 (a pyranose) or 5 (a furanose), its middle at `at`: atom k of the solid (the ring O first, then C-1 on) is
 * `firstId + k`, its bond k `firstBondId + k`. Its near edge as the text prefers it (Brecher 2006, ST-1.9, the Haworth form its figure marks
 * preferred): the bottommost ring bond bold, and the two ring bonds that run to it wedge-shaped, broad at its ends - always the two with the
 * bold one, never wedge shapes without it, which the text rejects. A look (`Bond.display`): it states nothing the depth does not.
 */
export function haworthDrawing(opts: { at: { x: number; y: number }; size?: 5 | 6; firstId: number; firstBondId: number; length?: number }): ChairDrawing {
  const solid = haworth(opts.size ?? 6);
  const drawing = drawn(solid)!;
  const scale = opts.length ?? HAWORTH_SCALE * NOMINAL_BOND_LENGTH;
  const atoms: Atom[] = drawing.atoms.map((p, k) => ({
    id: opts.firstId + k,
    el: k === 0 ? "O" : "C",
    r: 0.9,
    x: opts.at.x + p.x * scale,
    y: opts.at.y + p.y * scale,
    z: p.z * scale,
    stereoCentre: true,
    stereoShown: true,
  }));
  // (the front edge: the ring bond of the two atoms nearest the viewer - the bottommost)
  const near = [...atoms.keys()].sort((a, b) => drawing.atoms[b].z - drawing.atoms[a].z).slice(0, 2);
  const plain: Bond[] = solid.bonds.map(([a, b], k) => ({ id: opts.firstBondId + k, a: opts.firstId + a, b: opts.firstId + b, order: 1 }));
  const front = plain.find((b) => near.includes(b.a - opts.firstId) && near.includes(b.b - opts.firstId))!;
  const bonds = plain.map((b): Bond => {
    if (b === front) return { ...b, display: "bold" };
    const at = b.a === front.a || b.a === front.b ? b.a : b.b === front.a || b.b === front.b ? b.b : null;
    if (at == null) return b;
    // (broad at the bold bond's end, narrow at the far one)
    return { ...b, display: "wedge" as const, narrow: at === b.a ? b.b : b.a };
  });
  return { atoms, bonds, ring: atoms.map((a) => a.id), solid, scale, drawing };
}

/** A Haworth ring found on a page: its size, how long its level bond is drawn, where its middle is, and each ring atom's place in the solid. */
export type FoundHaworth = { size: 5 | 6; scale: number; at: { x: number; y: number }; index: Map<number, number> };

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
  // (at the page's own scale: its level bond, the longest of the ring's as drawn)
  const scale = Math.max(...places.map((a, i) => Math.hypot(a.x - places[(i + 1) % size].x, a.y - places[(i + 1) % size].y)));
  const d = haworthDrawing({ at: middle, size, firstId: 1, firstBondId: 1, length: scale });
  for (let turn = 0; turn < size; turn++) {
    for (const way of [1, -1]) {
      const mine = places.map((_, i) => d.atoms[(turn + way * i + size) % size]);
      if (places.every((a, i) => Math.hypot(a.x - mine[i].x, a.y - mine[i].y, (a.z ?? 0) - (mine[i].z ?? 0)) < 1e-6 * NOMINAL_BOND_LENGTH * 100)) {
        return { size, scale, at: middle, index: new Map(ring.map((id, i) => [id, (turn + way * i + size) % size])) };
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

