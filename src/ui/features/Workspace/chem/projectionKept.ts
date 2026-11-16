/**
 * A drawing in perspective kept by Clean-up (docs/EDITOR-2D.md, *Drawn in
 * perspective*; the maintainer's ruling of 2026-11-13): a ring system the
 * drawing shows with a depth - a chair, a Haworth ring - that the engine
 * would lay flat is left where it is, depth and all, and what is flat on it
 * - each group, a chain, a ring of its own - is laid out by the engine onto
 * it: its first atom the way the drawing has it from the ring, the rest as
 * the engine lays the group out. A group joined to the ring by more than one
 * bond - a fused flat ring, a bridge - is part of the projection and kept as
 * drawn. Pure: places in, places out.
 */
import { perceive } from "../../../../lib/layout/perceive";
import type { LayoutInput } from "../../../../lib/layout/engine";

/** Where an atom of the drawing is, and its depth where it has one. */
export type Spot = { x: number; y: number; z?: number; stereoCentre?: boolean };

/** What is kept of a drawing in perspective: the atoms of the projections (by their places in the engine's input), and where each atom the projection moves goes. */
export type Kept = { projected: ReadonlySet<number>; places: ReadonlyMap<number, Spot> };

/**
 * The projections of a structure - ring systems all of whose atoms the drawing gives a depth (`was`) and the engine lays flat
 * (`flat`: no depth in its layout) - and where each of their atoms and each flat group on them goes. `at` is where the engine lays
 * each atom, in the drawing's own scale; `bond` the style's bond length, which the first bond of each group is drawn at.
 */
export function projectionsKept(
  input: LayoutInput,
  was: readonly (Spot | undefined)[],
  flat: (i: number) => boolean,
  at: (i: number) => { x: number; y: number },
  bond: number,
): Kept {
  const none: Kept = { projected: new Set(), places: new Map() };
  const n = input.atoms.length;
  if (!was.some((a, i) => i < n && a?.z != null)) return none;
  const mol = perceive({ atoms: input.atoms.map((a) => ({ el: a.el, hs: a.hs ?? 0 })), bonds: input.bonds.map(({ a, b, order }) => ({ a, b, order })) });
  const projected = new Set<number>();
  for (const sys of mol.systems) {
    if (sys.atoms.every((i) => i < n && was[i]?.z != null && flat(i))) for (const i of sys.atoms) projected.add(i);
  }
  if (!projected.size) return none;
  const places = new Map<number, Spot>();
  for (const i of projected) places.set(i, { x: was[i]!.x, y: was[i]!.y, z: was[i]!.z!, ...(was[i]!.stereoCentre ? { stereoCentre: true } : {}) });
  // (what is joined to a projection: each connected piece of what is not part of one, with the bonds that join it)
  const around: number[][] = input.atoms.map(() => []);
  for (const b of input.bonds) {
    around[b.a].push(b.b);
    around[b.b].push(b.a);
  }
  const seen = new Set<number>(projected);
  for (const p of projected) {
    for (const g of around[p]) {
      if (seen.has(g)) continue;
      const piece: number[] = [];
      const queue = [g];
      seen.add(g);
      while (queue.length) {
        const x = queue.shift()!;
        piece.push(x);
        for (const y of around[x]) {
          if (seen.has(y) || projected.has(y)) continue;
          seen.add(y);
          queue.push(y);
        }
      }
      const joins = piece.flatMap((x) => around[x].filter((y) => projected.has(y)).map((y) => [y, x] as const));
      if (joins.length !== 1) {
        // (joined by more than one bond: kept as drawn, with the projection)
        for (const x of piece) if (was[x]) places.set(x, { x: was[x]!.x, y: was[x]!.y });
        continue;
      }
      const [[from, first]] = joins;
      const [e0, e1] = [at(from), at(first)];
      const [d0, d1] = [was[from]!, was[first]!];
      // (the engine's bond from the ring to the group turned onto the drawing's, the group at the style's bond length from the ring)
      const turn = Math.atan2(d1.y - d0.y, d1.x - d0.x) - Math.atan2(e1.y - e0.y, e1.x - e0.x);
      const [c, s] = [Math.cos(turn), Math.sin(turn)];
      const ring = places.get(from)!;
      const dir = Math.atan2(d1.y - d0.y, d1.x - d0.x);
      const start = { x: ring.x + Math.cos(dir) * bond, y: ring.y + Math.sin(dir) * bond };
      for (const x of piece) {
        const p = at(x);
        const [dx, dy] = [p.x - e1.x, p.y - e1.y];
        places.set(x, { x: start.x + dx * c - dy * s, y: start.y + dx * s + dy * c });
      }
    }
  }
  return { projected, places };
}
