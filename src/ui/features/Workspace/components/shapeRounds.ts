import { cornerRadius, type ShapeGeometry } from "../../../../lib/chem/shapes";

/**
 * A document's rectangles' corners as the canvas draws them (Shapes2D),
 * kept with the document - by its store - not the page: every tab's canvas
 * is there at once, its shapes numbered its own, so one held for all mixed
 * one tab's shape 1 with another's. Those being rounded by their handle
 * (drawn as it goes, not eased); each one's radius as it is drawn now, in
 * points - eased after an undo - and those to tell as it changes: the
 * handle goes with the corners.
 */
export type Rounds = { byHand: Set<number>; shown: Map<number, number>; moved: Set<() => void> };

const kept = new WeakMap<object, Rounds>();

/** The corners of the document whose store is `store`. */
export function roundsOf(store: object): Rounds {
  let r = kept.get(store);
  if (!r) kept.set(store, (r = { byHand: new Set(), shown: new Map(), moved: new Set() }));
  return r;
}

/** How far in a rectangle's corners' handle stands from where their curve begins, along its top and down from it, on the screen, in pixels; less in a small one. */
export const ROUND_IN_PX = 14;

type Box = ShapeGeometry & { id: number };

/** How far in the handle stands, in page units, `px` of them to the pixel. */
export function roundInOf(s: Box, px: number): number {
  return Math.min(ROUND_IN_PX * px, (s.y1 - s.y0) / 2, (s.x1 - s.x0) / 4);
}

/**
 * Where a rectangle's corners' handle stands: in from where their curve
 * begins along its top - from its corner, square - and as far down from
 * it, the curve where its document's canvas draws it now (`rounds`).
 */
export function roundHandleAt(s: Box, pointPx: number, px: number, rounds: Rounds): { x: number; y: number } {
  const inset = roundInOf(s, px);
  const shown = rounds.shown.get(s.id);
  return { x: s.x0 + cornerRadius(shown != null ? { ...s, radius: shown } : s, pointPx) + inset, y: s.y1 - inset };
}
