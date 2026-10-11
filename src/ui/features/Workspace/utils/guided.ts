import type { Model } from "../store/types";

/**
 * The atoms of the structure a guide's step points at (lib/plugins/guide,
 * `structure`): those selected, where any are; else the structure drawn
 * last - the one holding the atom added last.
 */
export function structureAtoms(model: Model, selected: ReadonlySet<number>): Model["atoms"] {
  if (selected.size) return model.atoms.filter((a) => selected.has(a.id));
  if (!model.atoms.length) return [];
  const last = model.atoms.reduce((m, a) => (a.id > m.id ? a : m));
  const near = new Map<number, number[]>();
  const link = (a: number, b: number) => (near.get(a) ?? near.set(a, []).get(a)!).push(b);
  for (const b of model.bonds) {
    link(b.a, b.b);
    link(b.b, b.a);
  }
  const seen = new Set([last.id]);
  const todo = [last.id];
  while (todo.length) {
    for (const n of near.get(todo.pop()!) ?? []) {
      if (seen.has(n)) continue;
      seen.add(n);
      todo.push(n);
    }
  }
  return model.atoms.filter((a) => seen.has(a.id));
}
