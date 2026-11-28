/**
 * How the layout engine draws a drawing's bridged systems and cages in perspective (./cage), for the core's reading of rings drawn in
 * perspective (lib/chem/perception/projection/depth): which of the drawing's ring systems is a cage, and the views Meno draws it in -
 * its best, the same from the other side, those tied with it, and the next few. The reading is the core's; these views are the engine's.
 */
import type { CageViewsOf, ViewPoint } from "../chem/perception/projection/depth";
import { CAGE_MOST_ATOMS, everyCageView, isCage, type projectCage, type CageView } from "./cage";
import { perceive, type Molecule } from "./perceive";
import { ofTheStructure } from "../chem/perception/graph";

/** The engine's views of a drawing's ring systems, for `withRecognisedDepth` and `recognisedSaid` (lib/chem/perception/projection/depth). */
export const cageViews: CageViewsOf = (atoms, drawn) => {
  // (the drawing perceived by the engine once, and only where a system is asked of that could be a cage: a flake of many fused rings never)
  let mol: Molecule | null = null;
  const given = () => ({ atoms: atoms.map((a) => ({ el: a.el ?? "C", hs: a.hs })), bonds: drawn.filter(ofTheStructure).map(({ a, b, order }) => ({ a, b, order })) });
  const perceived = () => (mol ??= perceive(given()));
  return (system) => {
    // (no cage is larger than the engine takes one to be - its own test, `isCage` - and a bridged system so large has no views of its own)
    if (system.length > CAGE_MOST_ATOMS) return { cage: false, views: () => [] };
    // (the engine's ring system holding these atoms - its own ring set; it may hold more, a metal's star atoms round a ring bound to it)
    const m = perceived();
    const sys = m.systems.find((s) => system.every((i) => s.atoms.includes(i)));
    if (!sys) return { cage: false, views: () => [] };
    return { cage: isCage(m, sys), views: () => keptViews(given(), system, () => viewsOf(m, sys, system)) };
  };
};

/**
 * The views found so far, by what they are found from: the structure as the engine is given it here - each atom's element and H count,
 * each bond of the structure with its order, a hydrogen bond left out - and the system's atoms in the order asked, the order of the places
 * in each view. Nothing else goes into them: the engine is given no place, depth, wedge, bold bond or charge of the drawing (`cageViews`),
 * and its solid and its views are worked out from the structure alone, so two drawings with one key have the same views. The views are
 * handed out as they are kept, never to be changed. The oldest let go first.
 */
const kept = new Map<string, ViewPoint[][]>();

/** How many systems' views are kept (`kept`). */
const KEPT_VIEWS = 64;

function keptViews(given: { atoms: { el: string; hs: number }[]; bonds: { a: number; b: number; order: number }[] }, system: readonly number[], find: () => ViewPoint[][]): ViewPoint[][] {
  const key = `${given.atoms.map((a) => `${a.el}:${a.hs}`).join(" ")}|${given.bonds.map((b) => `${b.a}-${b.b}:${b.order}`).join(",")}|${system.join(",")}`;
  let views = kept.get(key);
  if (!views) {
    views = find();
    views.forEach((view) => view.forEach((p) => Object.freeze(p)));
    kept.set(key, views);
    if (kept.size > KEPT_VIEWS) kept.delete(kept.keys().next().value!);
  }
  return views;
}

/** The ways Meno draws a bridged system or a cage in perspective: each view its atoms' places and depths, in the order `order` gives them. */
function viewsOf(mol: Parameters<typeof projectCage>[0], sys: Parameters<typeof projectCage>[1], order: readonly number[]): ViewPoint[][] {
  const views: Omit<CageView, "other">[] = [];
  const add = (v: CageView | null) => {
    if (!v) return;
    views.push(v);
    if (v.other) views.push(v.other);
  };
  // (its best four of one hand, then every view tied with the best: from one search - cage.ts `everyCageView`)
  const { ranked, tied } = everyCageView(mol, sys);
  for (const v of ranked) add(v);
  for (const v of tied) add(v);
  return views.filter((v) => order.every((i) => v.pos.has(i) && v.depth.has(i))).map((v) => order.map((i) => ({ ...v.pos.get(i)!, z: v.depth.get(i)! })));
}
