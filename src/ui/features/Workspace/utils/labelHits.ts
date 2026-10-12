/**
 * A label's other letters are its atom: the H of HO is the O, to the
 * pointer as to a press - hovered, clicked, double-clicked, dragged,
 * right-clicked - and not empty space (the maintainer, 2026-10-12). Where
 * each label reaches on the page, as the drawing was last laid out
 * (workflow/selectionSet#labelReach), is kept here for each canvas (its
 * store), for what finds the atom under the pointer outside the drawing's
 * own hit areas (hooks/useStructureEvents).
 */

type Pt = { x: number; y: number };
type Frame = { x0: number; x1: number; y0: number; y1: number };

const reaches = new WeakMap<object, ReadonlyMap<number, Frame>>();

/** Where each labelled atom's label reaches on `store`'s canvas now, by the atom's id. */
export function setLabelReach(store: object, reach: ReadonlyMap<number, Frame>): void {
  reaches.set(store, reach);
}

/** Where each labelled atom's label reaches on `store`'s canvas, as last laid out. */
export function labelReachOf(store: object): ReadonlyMap<number, Frame> | undefined {
  return reaches.get(store);
}

/** The atom whose label `p` (on the page) is on, if any. */
export function atomOfLabelAt(reach: ReadonlyMap<number, Frame> | undefined, p: Pt): number | null {
  if (!reach) return null;
  for (const [id, f] of reach) if (p.x >= f.x0 && p.x <= f.x1 && p.y >= f.y0 && p.y <= f.y1) return id;
  return null;
}
