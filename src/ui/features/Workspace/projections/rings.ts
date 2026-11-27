/**
 * The projections of a drawing: the rings of it that are a tool's - a chair, a Haworth ring - each as the drawing the tool would make of it, so that
 * what is done to a projection (its groups led out, Clean-up leaving it, *Draw flat*) is done to any of them alike. Pure.
 */
import type { Atom, Bond } from "../store/types";
import { chairOf, chairsIn, chairDrawing, depthRings, type ChairDrawing } from "./chair";
import { fusedRingsOn } from "./fuse";
import { haworthDrawing, haworthOf, haworthsIn } from "./haworth";

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
  const part = only ? { atoms: model.atoms.filter((a) => ids.has(a.id)), bonds: model.bonds.filter((b) => ids.has(b.a) && ids.has(b.b)) } : model;
  const rings = depthRings(part);
  const chairs = chairsIn(model, ids);
  for (const ring of chairs) {
    const c = chairOf(model, ring)!;
    // (a chair the tool fused on it: both rings drawn as the pair is - its second ring's places on the pair's four lines, and the places of
    // either ring that would land on an atom or another place drawn short - the first ring by the same drawing, its own atoms' places in it)
    const pairs = fusedRingsOn(model, ring, c, rings.filter((r) => !chairs.some((q) => q.length === r.length && q.every((id) => r.includes(id)))));
    const drawing = pairs.length === 1 ? pairs[0].drawing : chairDrawing({ at: c.at, form: c.form, flip: c.flip, firstId: 1, firstBondId: 1, length: c.scale });
    out.push({ kind: "chair", ring, drawing, index: c.index });
    for (const second of pairs) out.push({ kind: "chair", ...second });
  }
  for (const ring of haworthsIn(model, ids)) {
    const h = haworthOf(model, ring)!;
    out.push({ kind: "haworth", ring, drawing: haworthDrawing({ at: h.at, size: h.size, firstId: 1, firstBondId: 1, length: h.scale }), index: h.index });
  }
  if (!only) found.set(model.atoms, { bonds: model.bonds, out });
  return out;
}
