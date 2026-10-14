import type { Atom, Bond, Model } from "../store/types";

/**
 * What was made of each structure (by its first atom's id, with the atoms
 * and bonds it was made from), and how the drawing fell into structures:
 * for `byStructure` to take again. Made with `structureValues`.
 */
export type StructureValues<T> = {
  made: Map<number, { atoms: Atom[]; bonds: Bond[]; value: T }>;
  /** The drawing's atoms' ids and its bonds as they were split, and each structure's atoms and bonds by their places. */
  split: { ids: number[]; bonds: readonly Bond[]; parts: { atoms: number[]; bonds: number[] }[] } | null;
};

/** Nothing made yet. */
export function structureValues<T>(): StructureValues<T> {
  return { made: new Map(), split: null };
}

/**
 * What `of` makes of each structure of a drawing - atoms joined by bonds,
 * in the drawing's order, the structures in the order of their first atoms
 * - made again only for a structure one of whose atoms or bonds is not the
 * object it was: a drag over a drawing of a thousand structures works out
 * the one it moves. `kept` holds what was made, and is brought up to date.
 * For what `of` finds in a structure without looking past it.
 */
export function byStructure<T>(model: Model, kept: StructureValues<T>, of: (part: Model) => T): T[] {
  // (split again only where the bonds or the atoms there are changed: a
  // drag moves atoms, and keeps both - the bonds the same objects, in a
  // list made anew at each change)
  if (!kept.split || !sameBonds(kept.split.bonds, model.bonds) || !sameIds(kept.split.ids, model.atoms)) kept.split = split(model);
  const was = kept.made;
  const made = new Map<number, { atoms: Atom[]; bonds: Bond[]; value: T }>();
  const out: T[] = [];
  for (const part of kept.split.parts) {
    const key = model.atoms[part.atoms[0]].id;
    const it = was.get(key);
    if (it && same(it.atoms, part.atoms, model.atoms) && same(it.bonds, part.bonds, model.bonds)) {
      made.set(key, it);
      out.push(it.value);
      continue;
    }
    const atoms = part.atoms.map((i) => model.atoms[i]);
    const bonds = part.bonds.map((k) => model.bonds[k]);
    const value = of({ atoms, bonds });
    made.set(key, { atoms, bonds, value });
    out.push(value);
  }
  kept.made = made;
  return out;
}

/** The drawing split into its structures, by its atoms' and bonds' places; a bond to an atom it does not have is left out. */
function split(model: Model): NonNullable<StructureValues<unknown>["split"]> {
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
  const from = new Int32Array(model.bonds.length).fill(-1);
  model.bonds.forEach((b, k) => {
    const i = index.get(b.a);
    const j = index.get(b.b);
    if (i == null || j == null) return;
    from[k] = i;
    const p = top(i);
    const q = top(j);
    if (p !== q) up[Math.max(p, q)] = Math.min(p, q);
  });
  const parts: { atoms: number[]; bonds: number[] }[] = [];
  const partOf = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const r = top(i);
    if (partOf[r] < 0) {
      partOf[r] = parts.length;
      parts.push({ atoms: [], bonds: [] });
    }
    parts[partOf[r]].atoms.push(i);
  }
  for (let k = 0; k < from.length; k++) if (from[k] >= 0) parts[partOf[top(from[k])]].bonds.push(k);
  return { ids: model.atoms.map((a) => a.id), bonds: model.bonds, parts };
}

function sameBonds(a: readonly Bond[], b: readonly Bond[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return false;
  return true;
}

function sameIds(ids: readonly number[], atoms: readonly Atom[]): boolean {
  if (ids.length !== atoms.length) return false;
  for (let i = 0; i < ids.length; i++) if (ids[i] !== atoms[i].id) return false;
  return true;
}

/** Whether `was` holds the objects at `places` of `all`, in order. */
function same<T>(was: readonly T[], places: readonly number[], all: readonly T[]): boolean {
  if (was.length !== places.length) return false;
  for (let k = 0; k < places.length; k++) if (was[k] !== all[places[k]]) return false;
  return true;
}
