import type { Atom, Bond, Model } from "../store/types";

/** What was made of each structure, by its first atom's id, with the atoms and bonds it was made from. */
export type StructureValues<T> = Map<number, { atoms: Atom[]; bonds: Bond[]; value: T }>;

/**
 * What `of` makes of each structure of a drawing - atoms joined by bonds,
 * in the drawing's order, the structures in the order of their first atoms
 * - made again only for a structure one of whose atoms or bonds is not the
 * object it was: a drag over a drawing of a thousand structures works out
 * the one it moves. `kept` holds what was made, and is brought up to date.
 * For what `of` finds in a structure without looking past it.
 */
export function byStructure<T>(model: Model, kept: StructureValues<T>, of: (part: Model) => T): T[] {
  const n = model.atoms.length;
  const index = new Map<number, number>();
  model.atoms.forEach((a, i) => index.set(a.id, i));
  const up = new Int32Array(n);
  for (let i = 0; i < n; i++) up[i] = i;
  // (without recursion: a long chain would overflow the stack)
  const top = (i: number): number => {
    let r = i;
    while (up[r] !== r) r = up[r];
    while (up[i] !== r) {
      const next = up[i];
      up[i] = r;
      i = next;
    }
    return r;
  };
  const ends: [number, number][] = [];
  for (const b of model.bonds) {
    const i = index.get(b.a);
    const j = index.get(b.b);
    if (i == null || j == null) {
      ends.push([-1, -1]);
      continue;
    }
    ends.push([i, j]);
    const p = top(i);
    const q = top(j);
    if (p !== q) up[Math.max(p, q)] = Math.min(p, q);
  }
  const parts = new Map<number, Model>();
  for (let i = 0; i < n; i++) {
    const r = top(i);
    let part = parts.get(r);
    if (!part) parts.set(r, (part = { atoms: [], bonds: [] }));
    part.atoms.push(model.atoms[i]);
  }
  model.bonds.forEach((b, k) => {
    if (ends[k][0] >= 0) parts.get(top(ends[k][0]))!.bonds.push(b);
  });
  const was = new Map(kept);
  kept.clear();
  const out: T[] = [];
  for (const part of parts.values()) {
    const key = part.atoms[0].id;
    const it = was.get(key);
    const value = it && same(it.atoms, part.atoms) && same(it.bonds, part.bonds) ? it.value : of(part);
    kept.set(key, { atoms: part.atoms, bonds: part.bonds, value });
    out.push(value);
  }
  return out;
}

function same<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return false;
  return true;
}
