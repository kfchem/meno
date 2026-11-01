/**
 * An entry's fragments: the molecules its bonds make of its atoms, as a
 * plugin is given them (docs/PLUGINS.md, *The entry a plugin is given*).
 * Two atoms are in one fragment where a path of the entry's bonds joins
 * them - a coordination bond as any other, so a metal and its ligands are
 * one - and in two where none does: two waters, or a salt's ions drawn
 * apart, are two. Meno's rule on Meno's structure, stated once here, so
 * that a plugin whose program takes molecules apart (NCIPLOT's
 * interactions between them) writes what it is given and works out none.
 */

/** A bond as the fragments read it: the two atoms it joins, by their number from 0. */
export type Joined = { a1: number; a2: number };

/**
 * The fragments of `count` atoms joined by `bonds`: each fragment's atoms by
 * their number, in order, and the fragments in the order of their first
 * atom. A bond naming an atom that is not there joins nothing.
 */
export function fragmentsOf(count: number, bonds: readonly Joined[]): number[][] {
  const parent = Array.from({ length: count }, (_, i) => i);
  const root = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const atom = (i: number) => Number.isInteger(i) && i >= 0 && i < count;
  for (const b of bonds) {
    if (!atom(b.a1) || !atom(b.a2)) continue;
    const r1 = root(b.a1);
    const r2 = root(b.a2);
    // (the smaller root kept: each fragment's root its first atom)
    if (r1 !== r2) parent[Math.max(r1, r2)] = Math.min(r1, r2);
  }
  const fragments = new Map<number, number[]>();
  for (let i = 0; i < count; i++) {
    const r = root(i);
    const got = fragments.get(r);
    if (got) got.push(i);
    else fragments.set(r, [i]);
  }
  return [...fragments.values()];
}
