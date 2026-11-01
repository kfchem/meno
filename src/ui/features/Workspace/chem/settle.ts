/**
 * Conformers of one molecule, their equivalent branches given the same
 * places as in the first: as the page shows a structure's conformers in 3D
 * (`make3d` `asThePageShows`). A conformer search takes no account of which
 * of a CH2's two hydrogens, or of an isopropyl's two methyls, is which: one
 * index can be on one side in one conformer and on the other in the next,
 * and switching between them moves them across each other. Here each
 * equivalent group - neighbours of one atom of the same symmetry class (no
 * stereo), each the root of a branch that joins the rest only through it:
 * H's, a methyl, a t-butyl, CF3, an oxygen of a nitro group - is laid out as
 * it is in the first conformer, as the whole branches permute (an atom with
 * its branch, its atoms by their classes), whichever way fits best in the
 * parent's frame: the sum of squared distances, the parent and the atoms
 * about it laid over the first's. A pendant ring that is symmetric about its
 * bond (phenyl) may flip likewise. Went from the molecule's centre outward,
 * so that a branch's own groups are settled after the branch is. Local and
 * greedy: no automorphism of the whole molecule is searched for. Only atoms
 * of whole branches move, and only to places an equivalent branch had. The
 * first conformer is the reference and is not moved.
 */
import { huckelForm } from "../../../../lib/chem/huckel";
import { symmetryClasses } from "../../../../lib/layout/canonical";
import { eigenvalues } from "../workflow/rmsd";
import { bestTurn } from "../workflow/sameConformer";

/** How many whole branches a group may have for every way of laying them out to be tried (4! = 24). */
const MOST_BRANCHES = 4;
/** The largest pendant ring turned about its bond, and how many of its symmetries are tried. */
const MOST_RING_ATOMS = 16;
const MOST_SYMMETRIES = 64;
/**
 * The least triple product, in cubic ångströms, that says which way round three bonds go: a tetrahedral centre's
 * are some 0.9; a planar one's (an =CH2's) are nought but for noise, which says no way round - a hundredth of an
 * ångström in a place can turn its sign, and its hydrogens are then told apart by their fit alone.
 */
const HANDED = 0.05;

type Atom = { el: string; charge?: number };
type Bond = { a1: number; a2: number; order: number };
type Group = { p: number; roots: number[]; pend: Map<number, Set<number>> };

/** The conformers `frames` (each x, y and z in turn, by atom) with their equivalent branches settled: the first as it is, the rest anew. */
export function settleEquivalents(atoms: readonly Atom[], bonds: readonly Bond[], frames: readonly (readonly number[])[]): number[][] {
  const out = frames.map((f) => [...f]);
  if (frames.length < 2) return out;
  const n = atoms.length;
  // (each atom's neighbours in the order of the bonds, as the conformer search gave them)
  const nbrs: number[][] = atoms.map(() => []);
  for (const b of bonds) {
    nbrs[b.a1].push(b.a2);
    nbrs[b.a2].push(b.a1);
  }
  // (a Hückel ring's bonds of one order: its atoms alike whichever Kekulé structure it has, a cyclooctatetraene's not)
  const ranks = symmetryClasses(
    huckelForm({
      atoms: atoms.map((a) => ({ el: a.el, ...(a.charge ? { charge: a.charge } : {}), hs: 0 })),
      bonds: bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })),
    }),
  );
  // (from the centre outward: the atom of the least eccentricity, the lowest index of them)
  const distances = (src: number) => {
    const d = new Map<number, number>([[src, 0]]);
    const order = [src];
    for (let k = 0; k < order.length; k++) {
      const a = order[k];
      for (const b of nbrs[a]) {
        if (!d.has(b)) {
          d.set(b, d.get(a)! + 1);
          order.push(b);
        }
      }
    }
    return { d, order };
  };
  let best: [number, number] | null = null;
  for (let a = 0; a < n; a++) {
    const { d } = distances(a);
    // (more than one molecule: left as it is)
    if (d.size !== n) return out;
    const ecc = Math.max(...d.values());
    if (!best || ecc < best[0]) best = [ecc, a];
  }
  const { d: depth, order } = distances(best![1]);

  /** The atoms hanging from p by c alone - null where c's side joins the rest of the molecule another way. */
  const branchOf = (p: number, c: number): Set<number> | null => {
    const seen = new Set([c]);
    const stack = [c];
    while (stack.length) {
      const a = stack.pop()!;
      for (const b of nbrs[a]) {
        if (b === p) {
          if (a !== c) return null;
          continue;
        }
        if (!seen.has(b)) {
          seen.add(b);
          stack.push(b);
        }
      }
    }
    return seen;
  };

  const ascending = (s: Iterable<number>) => [...s].sort((x, y) => x - y);

  /** The maps of a pendant ring's atoms onto themselves that keep its root, by classes and bonds. */
  const symmetries = (root: number, bset: Set<number>): Map<number, number>[] => {
    const list = [...bset].sort((x, y) => depth.get(x)! - depth.get(y)! || x - y);
    const targets = ascending(bset);
    const found: Map<number, number>[] = [];
    const m = new Map<number, number>();
    const used = new Set<number>();
    const extend = (i: number) => {
      if (found.length >= MOST_SYMMETRIES) return;
      if (i === list.length) {
        found.push(new Map(m));
        return;
      }
      const a = list[i];
      if (a === root) {
        m.set(a, a);
        used.add(a);
        extend(i + 1);
        used.delete(a);
        return;
      }
      for (const t of targets) {
        if (used.has(t) || ranks[t] !== ranks[a] || nbrs[t].length !== nbrs[a].length) continue;
        if ([...m].every(([b, mb]) => nbrs[t].includes(mb) === nbrs[a].includes(b))) {
          m.set(a, t);
          used.add(t);
          extend(i + 1);
          used.delete(t);
          m.delete(a);
        }
      }
    };
    extend(0);
    return found;
  };

  const groups: Group[] = [];
  const ambiguous = new Set<number>();
  for (const p of order) {
    const pend = new Map<number, Set<number>>();
    for (const c of nbrs[p]) {
      const bset = branchOf(p, c);
      if (bset) pend.set(c, bset);
    }
    const byRank = new Map<number, number[]>();
    for (const c of pend.keys()) byRank.set(ranks[c], [...(byRank.get(ranks[c]) ?? []), c]);
    for (const found of byRank.values()) {
      const roots = ascending(found);
      if (roots.length > 1 && roots.length <= MOST_BRANCHES) {
        groups.push({ p, roots, pend });
        for (const c of roots) for (const a of pend.get(c)!) ambiguous.add(a);
      } else if (roots.length === 1) {
        const bset = pend.get(roots[0])!;
        let inside = 0;
        for (const a of bset) for (const b of nbrs[a]) if (bset.has(b)) inside++;
        if (inside / 2 >= bset.size && bset.size <= MOST_RING_ATOMS) {
          const moved = symmetries(roots[0], bset);
          if (moved.length > 1) {
            groups.push({ p, roots, pend });
            // (atoms every symmetry keeps - the root, the para atom - stay where the frame can lean on them)
            for (const a of bset) if (moved.some((m) => m.get(a) !== a)) ambiguous.add(a);
          }
        }
      }
    }
  }

  /** A map of one branch onto an equivalent one - a parallel walk, equal classes at each step, bonds kept - or null. */
  const pairUp = (ra: number, rb: number, setA: Set<number>, setB: Set<number>): Map<number, number> | null => {
    const m = new Map([[ra, rb]]);
    const taken = new Set([rb]);
    const queue: [number, number][] = [[ra, rb]];
    const byRank = (x: number, y: number) => ranks[x] - ranks[y] || x - y;
    for (let k = 0; k < queue.length; k++) {
      const [a, b] = queue[k];
      const ca = nbrs[a].filter((x) => setA.has(x) && !m.has(x)).sort(byRank);
      const cb = nbrs[b].filter((x) => setB.has(x) && !taken.has(x)).sort(byRank);
      if (ca.length !== cb.length || ca.some((x, i) => ranks[x] !== ranks[cb[i]])) return null;
      ca.forEach((x, i) => {
        m.set(x, cb[i]);
        taken.add(cb[i]);
        queue.push([x, cb[i]]);
      });
    }
    if (m.size !== setA.size || taken.size !== m.size) return null;
    for (const a of setA) for (const b of nbrs[a]) if (setA.has(b) && !nbrs[m.get(a)!].includes(m.get(b)!)) return null;
    return m;
  };

  const first = frames[0];
  const at = (f: readonly number[], x: number): [number, number, number] => [f[3 * x], f[3 * x + 1], f[3 * x + 2]];

  /** Whether atoms of the first conformer lie other than in a line: its spread about their centre at least 1e-3 Å two ways. */
  const usable = (list: readonly number[]) => {
    if (list.length < 3) return false;
    const pts = list.map((x) => at(first, x));
    const c = [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / pts.length);
    const m = [0, 1, 2].map((r) => [0, 1, 2].map((s) => pts.reduce((sum, p) => sum + (p[r] - c[r]) * (p[s] - c[s]), 0)));
    const singular = eigenvalues(m).map((v) => Math.sqrt(Math.max(0, v))).sort((x, y) => y - x);
    return singular[1] > 1e-3;
  };

  /** The signs of the triple products of the vectors from the centre to the roots and to the atoms about it, each triple with a root - nought where it is under `HANDED`. */
  const handedness = (rootsAt: number[][], anchorsAt: number[][], centre: readonly number[]) => {
    const vs = [...rootsAt, ...anchorsAt].map((x) => x.map((v, k) => v - centre[k]));
    const k = rootsAt.length;
    const signs: number[] = [];
    for (let i = 0; i < vs.length; i++)
      for (let j = i + 1; j < vs.length; j++)
        for (let l = j + 1; l < vs.length; l++) {
          if (i >= k) continue;
          const [a, b, c] = [vs[i], vs[j], vs[l]];
          const det = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
          signs.push(Math.abs(det) <= HANDED ? 0 : det > 0 ? 1 : -1);
        }
    return signs;
  };
  /** Whether signs `got` go the way `want` does, wherever it says a way. */
  const sameWay = (got: number[], want: number[]) => want.every((w, i) => w === 0 || got[i] === w);

  const settled = new Set(Array.from({ length: n }, (_, i) => i).filter((i) => !ambiguous.has(i)));
  const seen = new Set<string>();
  for (const { p, roots, pend } of groups) {
    const key = `${p}:${roots.join()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const branches = roots.map((c) => pend.get(c)!);
    const inside = new Set(branches.flatMap((b) => [...b]));
    // (each way of laying the branches out again: atom a takes the place atom cand[a] had)
    let cands: Map<number, number>[] = [];
    if (roots.length > 1) {
      const maps = roots.map((ri, i) => roots.map((rj, j) => pairUp(ri, rj, branches[i], branches[j])));
      if (maps.some((row) => row.some((mm) => !mm))) continue;
      for (const perm of permutations(roots.length)) {
        const cand = new Map<number, number>();
        perm.forEach((j, i) => maps[i][j]!.forEach((v, k) => cand.set(k, v)));
        cands.push(cand);
      }
    } else {
      cands = symmetries(roots[0], branches[0]);
      if (cands.length < 2) continue;
    }
    // (the parent's frame: it and the atoms about it, outside the branches - those settled; where they are too few
    //  or lie in a line, those of an equivalent pair too, which a flip of theirs may still turn)
    const shell = new Set([p]);
    for (const x of nbrs[p]) {
      if (inside.has(x)) continue;
      shell.add(x);
      for (const y of nbrs[x]) if (!inside.has(y)) shell.add(y);
    }
    if (roots.length === 1) shell.add(roots[0]);
    let frame = ascending([...shell].filter((x) => settled.has(x) || x === p || (roots.length === 1 && x === roots[0])));
    if (!usable(frame)) {
      frame = ascending(shell);
      if (!usable(frame)) continue;
    }
    const anchors = ascending(nbrs[p].filter((x) => !inside.has(x))).slice(0, 2);
    const identity = Math.max(
      0,
      cands.findIndex((c) => [...inside].every((a) => c.get(a) === a)),
    );
    for (const f of out.slice(1)) {
      const now = [...f];
      // (the frame laid over the first's: turned and moved, never reflected)
      const pc = centreOf(now, frame);
      const qc = centreOf(first, frame);
      const P = new Float64Array(frame.flatMap((x) => at(now, x).map((v, k) => v - pc[k])));
      const Q = new Float64Array(frame.flatMap((x) => at(first, x).map((v, k) => v - qc[k])));
      const { turn } = bestTurn(P, Q);
      const placed = (x: number) => {
        const v = at(now, x).map((w, k) => w - pc[k]);
        return [0, 1, 2].map((d) => turn[d][0] * v[0] + turn[d][1] * v[1] + turn[d][2] * v[2] + qc[d]);
      };
      const scored = cands.map((cand) => {
        let cost = 0;
        for (const a of inside) {
          const x = placed(cand.get(a)!);
          const r = at(first, a);
          cost += (x[0] - r[0]) ** 2 + (x[1] - r[1]) ** 2 + (x[2] - r[2]) ** 2;
        }
        return cost;
      });
      // (first its handedness: the roots and the atoms about their parent keep the sense they have in the first - a
      //  CH2's hydrogens keep their sides, a methyl's its cyclic order - and then the fit)
      let keep = cands.map((_, k) => k);
      if (roots.length > 1 && roots.length + anchors.length >= 3) {
        const want = handedness(
          roots.map((r) => at(first, r)),
          anchors.map((x) => at(first, x)),
          at(first, p),
        );
        const same = keep.filter((k) =>
          sameWay(
            handedness(
              roots.map((r) => at(now, cands[k].get(r)!)),
              anchors.map((x) => at(now, x)),
              at(now, p),
            ),
            want,
          ),
        );
        if (same.length) keep = same;
      }
      const cost = (k: number) => (k === identity ? scored[k] - 1e-9 : scored[k]);
      const pick = keep.reduce((b, k) => (cost(k) < cost(b) ? k : b));
      if (pick !== identity && (!keep.includes(identity) || scored[pick] < scored[identity] - 1e-6)) {
        const chosen = cands[pick];
        for (const a of inside) {
          const x = at(now, chosen.get(a)!);
          for (let d = 0; d < 3; d++) f[3 * a + d] = x[d];
        }
      }
    }
    for (const a of inside) settled.add(a);
  }
  return out;
}

function centreOf(xyz: readonly number[], atoms: readonly number[]): number[] {
  return [0, 1, 2].map((d) => atoms.reduce((s, x) => s + xyz[3 * x + d], 0) / atoms.length);
}

/** Every order of 0 .. n - 1, in lexicographic order. */
function permutations(n: number): number[][] {
  if (n === 0) return [[]];
  const out: number[][] = [];
  for (let first = 0; first < n; first++)
    for (const rest of permutations(n - 1)) out.push([first, ...rest.map((x) => (x >= first ? x + 1 : x))]);
  return out;
}
