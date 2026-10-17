/**
 * Which smallest set of its rings a bridged system is drawn from.
 *
 * A bridged system often has more than one set of rings as small as can
 * be: quinuclidine has three six-membered cycles and any two are a
 * smallest set; ibogaine's isoquinuclidine the same, with its
 * seven-membered ring fused on a side of two of them. Which of them
 * `smallestRings` keeps goes by the order of the atoms - the canonical
 * rank - and the system's flat drawing goes by the set it is laid out
 * from: which rings are laid regular, which arcs round a bridge. So each
 * set is tried, the system laid flat from it, and the one whose drawing
 * reads best is kept - read by a measure that does not depend on which
 * set it was laid out from (`flatCost`'s room against every set's rings,
 * and the rings' shapes as the set they fit best has them). Between
 * drawings as good, the first set in the order of its rings' lowest
 * atoms: the canonical rank, last.
 */

import { flatCost, isCage, smallestSets } from "./cage";
import type { Point } from "./geometry";
import type { Molecule, RingSystem } from "./perceive";
import { misshapen, narrowGap } from "./ringSystem";

/** At most this many smallest sets tried for one system; one with more tries those whose rings are least bridged. */
export const MOST_SETS_TRIED = 8;

/**
 * The smallest sets of a system's rings to lay it out flat from: every
 * one, or - where there are more than `MOST_SETS_TRIED` - those whose rings
 * are bridged across one another least (fewest pairs sharing three atoms
 * or more, then fewest atoms shared in all), which lie flat most readily.
 * In the order `smallestSets` has them; a system with one set, that one.
 */
export function ringSetsToTry(mol: Molecule, sys: RingSystem): number[][][] {
  const sets = smallestSets(mol, sys);
  if (sets.length <= MOST_SETS_TRIED) return sets;
  const weigh = (set: readonly (readonly number[])[]) => {
    let bridged = 0;
    let shared = 0;
    set.forEach((r, j) =>
      set.forEach((q, k) => {
        if (k <= j) return;
        const s = q.filter((a) => r.includes(a)).length;
        shared += s;
        if (s >= 3) bridged++;
      }),
    );
    return { bridged, shared };
  };
  return sets
    .map((set, k) => ({ set, k, ...weigh(set) }))
    .sort((p, q) => p.bridged - q.bridged || p.shared - q.shared || p.k - q.k)
    .slice(0, MOST_SETS_TRIED)
    .sort((p, q) => p.k - q.k)
    .map((t) => t.set);
}

/**
 * The molecule with a system's rings those of `set` - a smallest set of
 * them, as many of each size as it has - each in place of one as long,
 * in the order `set` has them, and each atom's rings to match. Its other
 * rings, systems and everything else are the molecule's own.
 */
export function withRingSet(mol: Molecule, sys: RingSystem, set: readonly (readonly number[])[]): Molecule {
  const rings = mol.rings.slice();
  const byLength = new Map<number, number[][]>();
  for (const r of set) byLength.set(r.length, [...(byLength.get(r.length) ?? []), [...r]]);
  for (const i of sys.rings) rings[i] = byLength.get(rings[i].length)!.shift()!;
  const ringsOf = mol.ringsOf.slice();
  for (const a of sys.atoms) ringsOf[a] = [];
  for (const i of [...sys.rings].sort((p, q) => p - q)) for (const a of rings[i]) ringsOf[a].push(i);
  return { ...mol, rings, ringsOf };
}

/** A system laid flat: its atoms' places, and how near the viewer each is where a bridge is drawn across a ring. */
type Flat = { pos: Map<number, Point>; depth?: Map<number, number> };

/**
 * The molecule with each of its ring systems that has more than one
 * smallest set of rings - and is no cage, drawn in perspective from its
 * solid whatever its set, nor bound face-on to a metal - given the set
 * its flat drawing (`layFlat`) reads best from. How well a drawing reads
 * is `flatCost` with the room for its bonds out, its rings' shapes and its
 * narrow gaps, as `layoutFlat` weighs them, each read the same whichever
 * set the drawing came from: the shapes by the set they fit best.
 */
export function drawnRingSets(mol: Molecule, layFlat: (mol: Molecule, sys: RingSystem) => Flat): Molecule {
  const apart = new Set([...mol.eta.map((e) => e.system), ...mol.dienes.map((d) => d.system), ...mol.units.map((u) => u.system)]);
  let out = mol;
  mol.systems.forEach((sys, i) => {
    if (apart.has(i) || sys.rings.length < 2) return;
    const sets = ringSetsToTry(out, sys);
    if (sets.length < 2 || isCage(out, sys)) return;
    const mols = sets.map((set) => withRingSet(out, sys, set));
    const reads = (m: Molecule, { pos, depth }: Flat) =>
      flatCost(m, sys, pos, depth, true) + 20 * Math.min(...mols.map((t) => misshapen(t, sys, pos))) + 3 * narrowGap(m, sys, pos);
    let best = mols[0];
    let bestFlat: Flat | null = null;
    let least = Infinity;
    for (const m of mols) {
      const flat = layFlat(m, sys);
      const cost = reads(m, flat);
      if (cost < least - 1e-9) [best, bestFlat, least] = [m, flat, cost];
    }
    // (and the drawings of the systems chosen for before it: each laid
    // out from its own rings alone, which this one keeps)
    kept.set(best, new Map([...(kept.get(out) ?? []), [sys, bestFlat!]]));
    out = best;
  });
  return out;
}

/** Each system's flat drawing from the set chosen, by the molecule chosen for: taken once (`keptFlat`). */
const kept = new WeakMap<Molecule, Map<RingSystem, Flat>>();

/**
 * The flat drawing `drawnRingSets` laid a system out as from the set it
 * chose, for the molecule it gave: the same as laying it flat again, which
 * the layout would do next. Taken once - its places are the caller's to
 * move - and then none.
 */
export function keptFlat(mol: Molecule, sys: RingSystem): Flat | null {
  const flats = kept.get(mol);
  const flat = flats?.get(sys) ?? null;
  flats?.delete(sys);
  return flat;
}
