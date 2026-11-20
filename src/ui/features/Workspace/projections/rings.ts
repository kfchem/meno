/**
 * The projections of a drawing: the rings of it that are a tool's - a chair, a Haworth ring - each as the drawing the tool would make of it, so that
 * what is done to a projection (its groups led out, Clean-up leaving it, *Draw flat*) is done to any of them alike. Pure.
 */
import type { Atom, Bond } from "../store/types";
import { chairOf, chairsIn, chairDrawing, type ChairDrawing } from "./chair";
import { haworthDrawing, haworthOf, haworthsIn } from "./haworth";
import { newmansIn } from "./newman";

/** A projection found: what it is, its ring's atoms in order round it, the tool's drawing of it where it stands, and each atom's place in that drawing. */
export type FoundProjection = { kind: "chair" | "haworth"; ring: number[]; drawing: ChairDrawing; index: Map<number, number> };

/** The projections of a whole drawing, found once for each drawing (its atoms and bonds as they are): every frame of a stroke asks again. */
const found = new WeakMap<readonly Atom[], { bonds: readonly Bond[]; out: FoundProjection[] }>();

/** The ring projections among the atoms `only` (a structure's) of a drawing, or among all of it. */
export function projectionsIn(model: { atoms: Atom[]; bonds: Bond[] }, only?: ReadonlySet<number>): FoundProjection[] {
  // (nothing drawn with depth: nothing to look for, at every frame of every drag)
  if (!model.atoms.some((a) => a.z != null)) return [];
  const hit = only ? undefined : found.get(model.atoms);
  if (hit && hit.bonds === model.bonds) return hit.out;
  const ids = only ?? new Set(model.atoms.map((a) => a.id));
  const out: FoundProjection[] = [];
  for (const ring of chairsIn(model, ids)) {
    const c = chairOf(model, ring)!;
    out.push({ kind: "chair", ring, drawing: chairDrawing({ at: c.at, form: c.form, flip: c.flip, firstId: 1, firstBondId: 1, length: c.scale }), index: c.index });
  }
  for (const ring of haworthsIn(model, ids)) {
    const h = haworthOf(model, ring)!;
    out.push({ kind: "haworth", ring, drawing: haworthDrawing({ at: h.at, size: h.size, firstId: 1, firstBondId: 1, length: h.scale }), index: h.index });
  }
  if (!only) found.set(model.atoms, { bonds: model.bonds, out });
  return out;
}

/** Whether a structure holds a projection: Clean-up leaves it as drawn, and *Draw flat* lays it out flat (docs/EDITOR-2D.md, *Projections*). */
export const isProjection = (model: { atoms: Atom[]; bonds: Bond[] }, ids: ReadonlySet<number>): boolean => projectionsIn(model, ids).length > 0 || newmansIn(model, ids).length > 0;
