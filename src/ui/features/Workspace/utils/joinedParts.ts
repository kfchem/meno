/**
 * One structure of several parts (docs/EDITOR-2D.md, *One structure of
 * several parts*): the atoms that share a number (`Atom.joined`) are one
 * structure, bonded or not - a salt, a complex, a map's side. The number is
 * all there is to it: every reader of bonds reads the bonds as they are, and
 * only what asks for a structure (chem/cleanUp `fragmentOf`,
 * `fragmentsHolding`; workflow/entries `structuresOf`) joins its parts.
 */
import { fragmentOf, fragmentsHolding } from "../chem/cleanUp";
import type { Atom, Model } from "../store/types";
import { structuresOf } from "../workflow/entries";

/** A number no atom of `atoms` has: one past the highest. */
export function freshJoined(atoms: readonly Pick<Atom, "joined">[]): number {
  return atoms.reduce((m, a) => Math.max(m, a.joined ?? 0), 0) + 1;
}

/**
 * The structures that hold `ids` made one: every atom of them given one fresh
 * number - any number some of them had already taken in, so that joining a
 * joined structure to another makes one of them all. Nothing moves.
 */
export function joinedStructures(model: Model, ids: Iterable<number>): Model {
  const pieces = fragmentsHolding(model, ids);
  if (pieces.length < 2) return model;
  const n = freshJoined(model.atoms);
  const all = new Set(pieces.flatMap((p) => [...p]));
  return { ...model, atoms: model.atoms.map((a) => (all.has(a.id) ? { ...a, joined: n } : a)) };
}

/**
 * What the menu offers: *Make one structure* where the atoms selected
 * (`picked`) are in two structures or more; *Separate* where the structure
 * holding the atom right-clicked (`at`) is of several parts.
 */
export function partsOffered(model: Model, picked: ReadonlySet<number>, at: number | null): { join: boolean; separate: boolean } {
  return {
    join: structuresOf(model).filter((s) => s.some((id) => picked.has(id))).length > 1,
    separate: at != null && [...fragmentOf(model, at)].some((id) => model.atoms.find((a) => a.id === id)?.joined != null),
  };
}

/** The structures of several parts that hold `ids` taken apart: their number taken off, each piece a structure of its own again. */
export function separatedStructures(model: Model, ids: Iterable<number>): Model {
  const all = new Set(fragmentsHolding(model, ids).flatMap((p) => [...p]));
  if (![...all].some((id) => model.atoms.find((a) => a.id === id)?.joined != null)) return model;
  return { ...model, atoms: model.atoms.map((a) => (all.has(a.id) && a.joined != null ? withoutJoined(a) : a)) };
}

const withoutJoined = <A extends Pick<Atom, "joined">>(a: A): A => {
  const { joined: _j, ...rest } = a;
  return rest as A;
};

/**
 * Each number kept only where it still joins two pieces or more: one left on
 * a single piece - the rest deleted, or read so from a file - is taken off,
 * the model given back as it is where there is none to take.
 */
export function joinsSettled(model: Model): Model {
  const by = new Map<number, number[]>();
  for (const a of model.atoms) if (a.joined != null) by.set(a.joined, [...(by.get(a.joined) ?? []), a.id]);
  if (!by.size) return model;
  const lone = new Set<number>();
  for (const [n, ids] of by) if (fragmentsHolding(model, ids, false).length < 2) lone.add(n);
  if (!lone.size) return model;
  return { ...model, atoms: model.atoms.map((a) => (a.joined != null && lone.has(a.joined) ? withoutJoined(a) : a)) };
}

/** Atoms brought in - a paste, a record added - with their numbers made fresh past those already here (`here`), so that what comes joins nothing on the page. */
export function joinedAdded<A extends Pick<Atom, "joined">>(atoms: readonly A[], here: readonly Pick<Atom, "joined">[]): A[] {
  if (!atoms.some((a) => a.joined != null)) return [...atoms];
  let next = freshJoined(here);
  const fresh = new Map<number, number>();
  return atoms.map((a) => {
    if (a.joined == null) return a;
    if (!fresh.has(a.joined)) fresh.set(a.joined, next++);
    return { ...a, joined: fresh.get(a.joined)! };
  });
}
