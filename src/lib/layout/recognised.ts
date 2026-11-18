/**
 * How the layout engine draws a drawing's bridged systems and cages in perspective (./cage), for the core's reading of rings drawn in
 * perspective (lib/chem/perception/projection/depth): which of the drawing's ring systems is a cage, and the views Meno draws it in -
 * its best, the same from the other side, those tied with it, and the next few. The reading is the core's; these views are the engine's.
 */
import type { CageViewsOf, ViewPoint } from "../chem/perception/projection/depth";
import { isCage, projectCage, tiedViews, type CageView } from "./cage";
import { perceive } from "./perceive";
import { ofTheStructure } from "../chem/perception/graph";

/** The engine's views of a drawing's ring systems, for `withRecognisedDepth` and `recognisedSaid` (lib/chem/perception/projection/depth). */
export const cageViews: CageViewsOf = (atoms, drawn) => {
  const bonds = drawn.filter(ofTheStructure);
  const mol = perceive({ atoms: atoms.map((a) => ({ el: a.el ?? "C", hs: a.hs })), bonds: bonds.map(({ a, b, order }) => ({ a, b, order })) });
  return (system) => {
    // (the engine's ring system holding these atoms: its own ring set, the same atoms)
    const sys = mol.systems.find((s) => s.atoms.length === system.length && system.every((i) => s.atoms.includes(i)));
    if (!sys) return { cage: false, views: () => [] };
    return { cage: isCage(mol, sys), views: () => viewsOf(mol, sys, system) };
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
