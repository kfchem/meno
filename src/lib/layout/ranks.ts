/**
 * What tells a molecule's atoms apart, whatever order they come in: for
 * the layout's choices between atoms, rings and branches that would
 * otherwise go to whichever is listed first.
 *
 * Each atom is classed by what it is - its element, charge, H count, bonds
 * and their orders - and the classes refined by its neighbours' until they
 * part no further (Morgan's way); then by each stereocentre's configuration
 * and each double bond's cis or trans, read against its neighbours'
 * classes, which tells apart atoms the bonds alone leave alike. Atoms still
 * in one class are alike in every way the layout looks at - a tert-butyl's
 * methyls, a phenyl's two ortho carbons with the same bonds to them - or
 * nearly so (cuneane's, basketane's).
 *
 * A choice is made by the structure first (`atomClasses`); only between
 * atoms it leaves alike does the canonical rank decide (`canonicalRanks`):
 * the drawings either way are then the same drawing, or one is the other's
 * mirror image or turned.
 */
import { orderOf, type Molecule } from "./perceive";

type Ranked = { classes: number[]; canonical?: number[] };

const found = new WeakMap<Molecule, Ranked>();

/**
 * The classes and ranks of the structures ranked last, by everything the
 * ranking reads of them (`structureKey`): a layout perceives its molecule
 * afresh for each pass, and the same structure, atoms in the same order,
 * is ranked the same each time. The most recently used are kept.
 */
const byStructureKey = new Map<string, Ranked>();
const STRUCTURES_KEPT = 64;

/**
 * Everything the ranking reads of a molecule, written out: each atom with
 * its neighbours and the orders of its bonds to them, the bonds with their
 * cis or trans, the stereocentres. Two molecules with the same text are
 * ranked the same.
 */
function structureKey(mol: Molecule): string {
  const atoms = mol.el.map(
    (el, i) => `${el}|${mol.charge[i]}|${mol.hs[i]}|${mol.linked[i].length}|${mol.neighbours[i].map((b) => `${b}=${orderOf(mol, i, b)}`).join(",")}`,
  );
  const bonds = mol.bonds.map((b) => `${b.a}-${b.b}:${b.order}${b.stereo ? `:${b.stereo.refs[0]},${b.stereo.refs[1]}${b.stereo.cis ? "c" : "t"}` : ""}`);
  const tetra = [...mol.tetra.entries()].sort(([p], [q]) => p - q).map(([a, t]) => `${a}@${t.neighbours.join(",")}:${t.volume}`);
  return `${mol.n}#${atoms.join(";")}#${bonds.join(";")}#${tetra.join(";")}`;
}

/** The ranking kept for a molecule, its structure's where it was ranked before. */
function rankedOf(mol: Molecule): Ranked {
  const known = found.get(mol);
  if (known) return known;
  const k = structureKey(mol);
  let ranked = byStructureKey.get(k);
  if (ranked) byStructureKey.delete(k);
  else ranked = { classes: withStereo(mol, refine(mol, ranksOf(mol.el.map((_, i) => what(mol, i))))) };
  byStructureKey.set(k, ranked);
  if (byStructureKey.size > STRUCTURES_KEPT) byStructureKey.delete(byStructureKey.keys().next().value!);
  found.set(mol, ranked);
  return ranked;
}

/** Each atom's class: equal for atoms alike in everything the layout looks at, the same in any order. */
export function atomClasses(mol: Molecule): number[] {
  return rankedOf(mol).classes;
}

/**
 * Each atom alone, the same in any order: the classes (`atomClasses`), and
 * atoms of one class parted by taking each first in turn and refining
 * again, the order that writes the molecule least kept. Only the last
 * tie-break, between atoms the structure leaves alike.
 */
export function canonicalRanks(mol: Molecule): number[] {
  const known = rankedOf(mol);
  if (!known.canonical) {
    const first = mol.el.map((_, i) => what(mol, i));
    known.canonical = settled(known.classes, mol.n, (r) => withStereo(mol, refine(mol, r)), (r) => written(mol, first, r));
  }
  return known.canonical;
}

/** Two atoms compared by their classes, then their canonical ranks: the order of the atoms never decides. */
export function byStructure(mol: Molecule): (p: number, q: number) => number {
  const c = atomClasses(mol);
  let canon: number[] | null = null;
  return (p, q) => c[p] - c[q] || (p === q ? 0 : (canon ??= canonicalRanks(mol))[p] - canon[q]);
}

/** A ring's atoms as the structure has them, the same in any order: its atoms' classes, sorted. */
export function ringKey(mol: Molecule, ring: readonly number[]): string {
  const c = atomClasses(mol);
  return ring
    .map((a) => c[a])
    .sort((p, q) => p - q)
    .map((v) => String(v).padStart(6, "0"))
    .join(",");
}

/** A ring's least canonical rank: the last tie-break between rings the structure leaves alike. */
export function ringRank(mol: Molecule, ring: readonly number[]): number {
  const r = canonicalRanks(mol);
  return Math.min(...ring.map((a) => r[a]));
}

/** What an atom is, by itself. */
function what(mol: Molecule, i: number): string {
  const orders = mol.neighbours[i].map((b) => orderOf(mol, i, b)).sort((p, q) => p - q);
  return [mol.el[i], mol.charge[i], mol.hs[i], mol.neighbours[i].length, orders.join("."), mol.linked[i].length].join("|");
}

/** Each atom's bonds to its neighbours, as `:order`, in the order of `Molecule.neighbours`. */
const bondsOut = new WeakMap<Molecule, string[][]>();

/** Classes refined by the neighbours' until they part no further. */
function refine(mol: Molecule, r: number[]): number[] {
  let out = bondsOut.get(mol);
  if (!out) {
    out = mol.neighbours.map((nb, i) => nb.map((b) => `:${orderOf(mol, i, b)}`));
    bondsOut.set(mol, out);
  }
  const bonds = out;
  for (;;) {
    const now = r;
    const { next, classes, before } = parted(now, (i) => [now[i], ...mol.neighbours[i].map((b, j) => `${now[b]}${bonds[i][j]}`).sort()].join(","));
    if (classes === before) return next;
    r = next;
  }
}

/**
 * Each atom's class (`r`) parted by what `key` says of it: the ranks
 * `ranksOf` gives the keys `${r[i]} padded to six}/${key(i)}`, the classes
 * first and then the keys within each - a key is written only for an atom
 * in a class of more than one. With how many classes there are after, and
 * before.
 */
function parted(r: readonly number[], key: (i: number) => string): { next: number[]; classes: number; before: number } {
  const members = new Map<number, number[]>();
  r.forEach((v, i) => {
    const m = members.get(v);
    if (m) m.push(i);
    else members.set(v, [i]);
  });
  const next = new Array<number>(r.length);
  let rank = 0;
  for (const v of [...members.keys()].sort((p, q) => p - q)) {
    const atoms = members.get(v)!;
    if (atoms.length === 1) {
      next[atoms[0]] = rank++;
      continue;
    }
    const keys = atoms.map(key);
    const distinct = [...new Set(keys)].sort();
    const at = new Map(distinct.map((k, i) => [k, rank + i]));
    atoms.forEach((a, i) => (next[a] = at.get(keys[i])!));
    rank += distinct.length;
  }
  return { next, classes: rank, before: members.size };
}

/** And by how each stereocentre and double bond is set, against the neighbours' classes. */
function withStereo(mol: Molecule, r: number[]): number[] {
  const stereoAt: number[][] = mol.el.map(() => []);
  mol.bonds.forEach((b, i) => {
    if (!b.stereo || b.order !== 2) return;
    stereoAt[b.a].push(i);
    stereoAt[b.b].push(i);
  });
  const key = (r: number[], i: number): string => {
    const parts: number[] = [];
    const t = mol.tetra.get(i);
    if (t) {
      const ns = t.neighbours.map((m) => (m < 0 ? -1 : r[m]));
      parts.push(new Set(ns).size === ns.length ? t.volume * parity(ns) : 0);
    }
    for (const k of stereoAt[i]) {
      const b = mol.bonds[k];
      // (the ref on the bond's first atom first)
      const refs = b.stereo!.refs;
      const [p, q] = mol.neighbours[b.a].includes(refs[0]) && refs[0] !== b.b ? refs : [refs[1], refs[0]];
      // (each end's other neighbour too, the ref compared with it)
      const end = (at: number, other: number, ref: number) => {
        const rest = mol.neighbours[at].filter((v) => v !== other);
        return rest.length < 2 ? 1 : Math.sign(r[ref] - r[rest.find((o) => o !== ref)!]) || 0;
      };
      parts.push((b.stereo!.cis ? 1 : -1) * end(b.a, b.b, p) * end(b.b, b.a, q));
    }
    return parts.join(",");
  };
  for (;;) {
    const before = r;
    const next = refine(mol, parted(r, (i) => key(before, i)).next);
    if (classesIn(next) === classesIn(r)) return next;
    r = next;
  }
}

/** How many steps the search for a canonical order takes at most. */
const settleBudget = (n: number) => 200 + 20 * n;

/**
 * Classes parted to one atom each by taking alike atoms first in turn: the
 * order that writes the molecule least. Two orders that write it the same
 * show a symmetry of it, and the atoms it takes onto each other are not
 * tried again.
 */
function settled(start: number[], n: number, refined: (r: number[]) => number[], writes: (r: number[]) => string): number[] {
  let budget = settleBudget(n);
  type Leaf = { text: string; r: number[]; symmetries: number[][] };
  const search = (r: number[]): Leaf => {
    if (classesIn(r) === n) return { text: writes(r), r, symmetries: [] };
    const counts = new Map<number, number>();
    for (const v of r) counts.set(v, (counts.get(v) ?? 0) + 1);
    const cell = Math.min(...[...counts].filter(([, c]) => c > 1).map(([v]) => v));
    const root = r.map((_, i) => i);
    const find = (a: number): number => (root[a] === a ? a : (root[a] = find(root[a])));
    const join = (g: readonly number[]) => g.forEach((b, a) => (root[find(a)] = find(b)));
    let best: Leaf | null = null;
    const tried: number[] = [];
    const symmetries: number[][] = [];
    for (let m = 0; m < n; m++) {
      if (r[m] !== cell || tried.some((t) => find(t) === find(m))) continue;
      if (best && budget <= 0) break;
      budget--;
      const leaf = search(refined(parted(r, (i) => (i === m ? "0" : "1")).next));
      tried.push(m);
      for (const g of leaf.symmetries) {
        symmetries.push(g);
        join(g);
      }
      if (!best || leaf.text < best.text) best = leaf;
      else if (leaf.text === best.text) {
        const at = new Array<number>(n);
        leaf.r.forEach((p, a) => (at[p] = a));
        const g = best.r.map((p) => at[p]);
        symmetries.push(g);
        join(g);
      }
    }
    return { text: best!.text, r: best!.r, symmetries };
  };
  return search(start).r;
}

/** The molecule written by its atoms' places (`r`, each atom alone): the same text for two orders only where they are the same molecule the same way. */
function written(mol: Molecule, what: readonly string[], r: readonly number[]): string {
  const at = new Array<number>(r.length);
  r.forEach((p, a) => (at[p] = a));
  const pad = (v: number) => String(v).padStart(6, "0");
  const atoms = at.map((a) => {
    const t = mol.tetra.get(a);
    return t ? `${what[a]}@${t.volume * parity(t.neighbours.map((m) => (m < 0 ? Infinity : r[m])))}` : what[a];
  });
  const bonds = mol.bonds
    .map((b) => {
      const [p, q] = r[b.a] < r[b.b] ? [b.a, b.b] : [b.b, b.a];
      const st = b.stereo && b.order === 2 ? `:${b.stereo.cis ? "c" : "t"}${pad(r[b.stereo.refs[p === b.a ? 0 : 1]])}${pad(r[b.stereo.refs[p === b.a ? 1 : 0]])}` : "";
      return `${pad(r[p])}${pad(r[q])}:${b.order}${st}`;
    })
    .sort();
  return `${atoms.join(";")}|${bonds.join(" ")}`;
}

/** Each key's rank among the distinct keys, in sorted order. */
function ranksOf(keys: readonly string[]): number[] {
  const distinct = [...new Set(keys)].sort();
  const at = new Map(distinct.map((k, i) => [k, i]));
  return keys.map((k) => at.get(k)!);
}

const classesIn = (r: readonly number[]) => new Set(r).size;

/** The sign of the permutation that sorts `xs` (distinct) ascending. */
function parity(xs: readonly number[]): 1 | -1 {
  let sign: 1 | -1 = 1;
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) if (xs[i] > xs[j]) sign = sign === 1 ? -1 : 1;
  return sign;
}
