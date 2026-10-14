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

const found = new WeakMap<Molecule, { classes: number[]; canonical?: number[] }>();

/** Each atom's class: equal for atoms alike in everything the layout looks at, the same in any order. */
export function atomClasses(mol: Molecule): number[] {
  const known = found.get(mol);
  if (known) return known.classes;
  const classes = withStereo(mol, refine(mol, ranksOf(mol.el.map((_, i) => what(mol, i)))));
  found.set(mol, { classes });
  return classes;
}

/**
 * Each atom alone, the same in any order: the classes (`atomClasses`), and
 * atoms of one class parted by taking each first in turn and refining
 * again, the order that writes the molecule least kept. Only the last
 * tie-break, between atoms the structure leaves alike.
 */
export function canonicalRanks(mol: Molecule): number[] {
  const classes = atomClasses(mol);
  const known = found.get(mol)!;
  if (!known.canonical) {
    const first = mol.el.map((_, i) => what(mol, i));
    known.canonical = settled(classes, mol.n, (r) => withStereo(mol, refine(mol, r)), (r) => written(mol, first, r));
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

/** Classes refined by the neighbours' until they part no further. */
function refine(mol: Molecule, r: number[]): number[] {
  for (;;) {
    const keys = r.map((v, i) => [v, ...mol.neighbours[i].map((b) => `${r[b]}:${orderOf(mol, i, b)}`).sort()].join(","));
    const next = ranksOf(keys.map((k, i) => `${String(r[i]).padStart(6, "0")}/${k}`));
    if (classesIn(next) === classesIn(r)) return next;
    r = next;
  }
}

/** And by how each stereocentre and double bond is set, against the neighbours' classes. */
function withStereo(mol: Molecule, r: number[]): number[] {
  const stereoAt: number[][] = mol.el.map(() => []);
  mol.bonds.forEach((b, i) => {
    if (!b.stereo || b.order !== 2) return;
    stereoAt[b.a].push(i);
    stereoAt[b.b].push(i);
  });
  const keys = (r: number[]): string[] =>
    mol.el.map((_, i) => {
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
    });
  for (;;) {
    const k = keys(r);
    const next = refine(mol, ranksOf(r.map((v, i) => `${String(v).padStart(6, "0")}/${k[i]}`)));
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
      const leaf = search(refined(ranksOf(r.map((v, i) => `${String(v).padStart(6, "0")}/${i === m ? 0 : 1}`))));
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
