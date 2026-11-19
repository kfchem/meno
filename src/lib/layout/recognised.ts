/**
 * How the layout engine draws a drawing's bridged systems and cages in perspective (./cage), for the core's reading of rings drawn in
 * perspective (lib/chem/perception/projection/depth): which of the drawing's ring systems is a cage, and the views Meno draws it in -
 * its best, the same from the other side, those tied with it, and the next few. The reading is the core's; these views are the engine's.
 */
import type { CageViewsOf, ViewPoint } from "../chem/perception/projection/depth";
import { CAGE_MOST_ATOMS, isCage, projectCage, tiedViews, type CageView } from "./cage";
import { perceive, type Molecule } from "./perceive";
import { ofTheStructure } from "../chem/perception/graph";

/** The engine's views of a drawing's ring systems, for `withRecognisedDepth` and `recognisedSaid` (lib/chem/perception/projection/depth). */
export const cageViews: CageViewsOf = (atoms, drawn) => {
  // (the drawing perceived by the engine once, and only where a system is asked of that could be a cage: a flake of many fused rings never)
  let mol: Molecule | null = null;
  const perceived = () =>
    (mol ??= perceive({ atoms: atoms.map((a) => ({ el: a.el ?? "C", hs: a.hs })), bonds: drawn.filter(ofTheStructure).map(({ a, b, order }) => ({ a, b, order })) }));
  return (system) => {
    // (no cage is larger than the engine takes one to be - its own test, `isCage` - and a bridged system so large has no views of its own)
    if (system.length > CAGE_MOST_ATOMS) return { cage: false, views: () => [] };
    // (the engine's ring system holding these atoms - its own ring set; it may hold more, a metal's star atoms round a ring bound to it)
    const m = perceived();
    const sys = m.systems.find((s) => system.every((i) => s.atoms.includes(i)));
    if (!sys) return { cage: false, views: () => [] };
    return { cage: isCage(m, sys), views: () => viewsOf(m, sys, system) };
  };
};

/** The ways Meno draws a bridged system or a cage in perspective: each view its atoms' places and depths, in the order `order` gives them. */
function viewsOf(mol: Parameters<typeof projectCage>[0], sys: Parameters<typeof projectCage>[1], order: readonly number[]): ViewPoint[][] {
  const views: Omit<CageView, "other">[] = [];
  const add = (v: CageView | null) => {
    if (!v) return;
    views.push(v);
    if (v.other) views.push(v.other);
  };
  for (let rank = 0; rank < 4; rank++) add(rank ? projectCage(mol, sys, rank) : projectCage(mol, sys));
  for (const v of tiedViews(mol, sys)) add(v);
  return views.filter((v) => order.every((i) => v.pos.has(i) && v.depth.has(i))).map((v) => order.map((i) => ({ ...v.pos.get(i)!, z: v.depth.get(i)! })));
}
