/**
 * Structures in 2D shown magnified (docs/WORKSPACE.md, *Magnified
 * display*): a structure shown k times as large as it is is held where it
 * is shown - its atoms k times as far apart, about its centre - with
 * `magnified: k` on each of its atoms, and laid out in the style k times
 * over. Whatever is chemistry - a file, a copy for another program, a
 * plugin's input - reads it at its true size again (`atTrueSize`). Pure.
 */

type Pt = { x: number; y: number };
/** An atom as held: where, and how large its structure is shown. */
type Held = { id: number; x: number; y: number; magnified?: number };
/** A bond as held, between two atoms by id - and, a haptic bond, the ring's atoms it binds. */
type Joined = { a: number; b: number; endpoints?: readonly number[] };

/** How large an atom's structure is shown: 1, at its true size. */
export function magnifiedOfAtom(a: { magnified?: number }): number {
  const k = a.magnified;
  return k != null && Number.isFinite(k) && k > 0 ? k : 1;
}

/** The structures of a drawing - atoms joined by bonds, a haptic bond's ring with it - each as its atoms' places in `atoms`. */
export function structuresOf(atoms: readonly { id: number }[], bonds: readonly Joined[]): number[][] {
  const at = new Map(atoms.map((a, i) => [a.id, i]));
  const up = atoms.map((_, i) => i);
  const top = (i: number): number => {
    while (up[i] !== i) i = up[i] = up[up[i]];
    return i;
  };
  const join = (x: number | undefined, y: number | undefined) => {
    if (x == null || y == null) return;
    const a = top(x);
    const b = top(y);
    if (a !== b) up[Math.max(a, b)] = Math.min(a, b);
  };
  for (const b of bonds) {
    join(at.get(b.a), at.get(b.b));
    for (const e of b.endpoints ?? []) join(at.get(b.a), at.get(e));
  }
  const groups = new Map<number, number[]>();
  atoms.forEach((_, i) => {
    const r = top(i);
    const g = groups.get(r);
    if (g) g.push(i);
    else groups.set(r, [i]);
  });
  return [...groups.values()];
}

/** The middle of the box round some atoms: what a structure is shown magnified about. */
export function centreOf(atoms: readonly Pt[]): Pt {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const a of atoms) {
    if (a.x < x0) x0 = a.x;
    if (a.x > x1) x1 = a.x;
    if (a.y < y0) y0 = a.y;
    if (a.y > y1) y1 = a.y;
  }
  return Number.isFinite(x0) ? { x: (x0 + x1) / 2, y: (y0 + y1) / 2 } : { x: 0, y: 0 };
}

/** An atom `by` times as far from `about`, and shown so (`k`; 1, at its true size). */
function placed<A extends Held>(a: A, about: Pt, by: number, k: number): A {
  const { magnified: _was, ...rest } = a;
  const moved = { ...rest, x: about.x + (a.x - about.x) * by, y: about.y + (a.y - about.y) * by } as A;
  return k === 1 ? moved : { ...moved, magnified: k };
}

/**
 * A drawing as chemistry reads it: each structure shown magnified at its
 * true size again - its atoms as near together again as they are, about
 * its centre, and no longer said to be magnified. The very drawing given,
 * where none is.
 */
export function atTrueSize<M extends { atoms: readonly Held[]; bonds: readonly Joined[] }>(model: M): M {
  if (!model.atoms.some((a) => magnifiedOfAtom(a) !== 1)) return model;
  const atoms = [...model.atoms];
  for (const group of structuresOf(model.atoms, model.bonds)) {
    const k = magnifiedOfAtom(model.atoms[group[0]]);
    if (k === 1) continue;
    const c = centreOf(group.map((i) => model.atoms[i]));
    for (const i of group) atoms[i] = placed(model.atoms[i], c, 1 / k, 1);
  }
  return { ...model, atoms };
}

/**
 * The atoms of `ids` - a structure, or several, as they are held - shown
 * `k` times as large as they are, each structure about its own centre:
 * moved from how large it is shown now to `k`, each atom saying so (1, its
 * true size: none). Others as they were.
 */
export function magnifiedTo<A extends Held>(atoms: readonly A[], bonds: readonly Joined[], ids: ReadonlySet<number>, k: number): A[] {
  const out = [...atoms];
  for (const group of structuresOf(atoms, bonds)) {
    if (!group.some((i) => ids.has(atoms[i].id))) continue;
    const was = magnifiedOfAtom(atoms[group[0]]);
    if (was === k && group.every((i) => magnifiedOfAtom(atoms[i]) === k)) continue;
    const c = centreOf(group.map((i) => atoms[i]));
    for (const i of group) out[i] = placed(atoms[i], c, k / was, k);
  }
  return out;
}

/**
 * Each structure's atoms all saying one magnification: where an edit left
 * a structure saying several - two joined, atoms added - the one most of
 * its atoms say (the first's, where as many say each), said by all, none
 * moved. As it was, where every structure says one.
 */
export function oneMagnificationEach<A extends Held>(atoms: readonly A[], bonds: readonly Joined[]): readonly A[] {
  let out: A[] | null = null;
  for (const group of structuresOf(atoms, bonds)) {
    const ks = group.map((i) => magnifiedOfAtom(atoms[i]));
    if (ks.every((k) => k === ks[0])) continue;
    const count = new Map<number, number>();
    for (const k of ks) count.set(k, (count.get(k) ?? 0) + 1);
    let best = ks[0];
    for (const [k, c] of count) if (c > (count.get(best) ?? 0)) best = k;
    out ??= [...atoms];
    for (const i of group) {
      const { magnified: _was, ...rest } = atoms[i];
      out[i] = (best === 1 ? rest : { ...rest, magnified: best }) as A;
    }
  }
  return out ?? atoms;
}
