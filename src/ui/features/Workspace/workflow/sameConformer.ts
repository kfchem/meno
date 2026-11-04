/**
 * The one definition of the same conformer (the maintainer, 2026-10-21; the
 * RDKit plugin's `Sameness` is the same): two geometries of one molecule are
 * one conformer where all its atoms, hydrogens included, lie within
 * `SAME_CONFORMER` RMSD of each other - at its least over the ways the
 * molecule maps onto itself, each laid over the other by turning and moving
 * it, never by reflecting it, so that a conformer and its mirror image stay
 * two. Its mirror image is asked for apart (`mirrorOf`).
 *
 * The ways are those of its atoms but the hydrogens that hang on one atom,
 * at most `ALIKE_WAYS` of them, searched for atom by atom (`waysOf`), each
 * bond taken onto one of its order - a Hückel ring's all of one (`huckelBonds`:
 * which of a benzene ring's bonds a Kekulé structure makes double is no part
 * of its shape); those hydrogens are matched each to the nearest of their
 * kind on the atom it is taken to, once the rest are laid over. Past
 * `ALIKE_WAYS`, so are its atoms at the end of a chain; past that again,
 * atoms are taken in their own order alone. A molecule with fewer than three
 * other atoms not in a line - water, ethyne - has nothing to lay over by
 * them: the ways of all its atoms are tried instead.
 */
import { symmetryClasses } from "../../../../lib/layout/canonical";
import { huckelBonds } from "../../../../lib/chem/huckel";
import { rmsd } from "./rmsd";

/** The most two geometries of one conformer lie apart, in ångströms: all atoms, hydrogens included (the maintainer, 2026-10-21: keeps OH and NH rotamers apart). */
export const SAME_CONFORMER = 0.01;
/**
 * The most ways of mapping a molecule onto itself tried; past it, fewer atoms are mapped, or none. Each way tried
 * costs some 6 µs a pair of conformers laid every way (tetraphenylmethane, 384 ways, 2.5 ms a pair; Apple M4,
 * 2026-11-01), so a pair costs some 6 ms at most here, and most pairs are told apart by the bound before any.
 */
export const ALIKE_WAYS = 1000;

/** What a step says where `n` compounds' ways passed `ALIKE_WAYS`: their atoms were taken atom against atom, so a duplicate could be missed - never two made one. */
export const cappedSaid = (n: number) =>
  `${n} compound${n === 1 ? " has" : "s have"} more than ${ALIKE_WAYS.toLocaleString("en")} symmetric ways: duplicates of ${n === 1 ? "it" : "them"} could be missed`;

type Atom = { el: string; charge?: number; isotope?: number };
type Bond = { a1: number; a2: number; order: number };

/** What two geometries are, laid over each other at their best: their RMSD, and where each atom of the first is taken in the second. */
export type Laid = { rmsd: number; to: number[] };

export class Sameness {
  readonly n: number;
  private readonly core: number[];
  private readonly ways: number[][];
  /** What hangs on each atom of the core, by its kind: element, charge, isotope and bond. */
  private readonly hanging: Map<number, Map<string, number[]>>;
  /** Each element's atoms: the bound sorts their distances from the centre. */
  private readonly elements: number[][];
  /** Whether the ways were too many to try, and its atoms are taken in their own order alone. */
  readonly capped: boolean;

  constructor(atoms: readonly Atom[], bonds: readonly Bond[], first?: readonly number[]) {
    const n = atoms.length;
    this.n = n;
    const near: number[][] = atoms.map(() => []);
    for (const b of bonds) {
      near[b.a1].push(b.a2);
      near[b.a2].push(b.a1);
    }
    // (a hydrogen on one atom that is no hydrogen - not one of H2, nor a lone one)
    const hangs = new Set(atoms.flatMap((a, i) => (a.el === "H" && near[i].length === 1 && atoms[near[i][0]].el !== "H" ? [i] : [])));
    let found = waysOf(atoms, bonds, hangs);
    let hung = hangs;
    if (!found.complete) {
      const ends = new Set([...hangs, ...atoms.flatMap((a, i) => (a.el !== "H" && near[i].length === 1 ? [i] : []))]);
      const fewer = waysOf(atoms, bonds, ends);
      if (fewer.complete && fewer.core.length >= 3) {
        found = fewer;
        hung = ends;
      }
    }
    if (found.core.length < 3 || (first && !spread(first, found.core))) {
      found = waysOf(atoms, bonds, new Set());
      hung = new Set();
    }
    this.capped = !found.complete;
    this.core = found.core;
    this.ways = this.capped ? [found.core.map((_, k) => k)] : found.ways;
    this.hanging = new Map();
    for (const i of hung) {
      const on = near[i][0];
      const bond = bonds.find((b) => (b.a1 === i && b.a2 === on) || (b.a2 === i && b.a1 === on))!;
      const kind = `${atoms[i].el}|${atoms[i].charge ?? 0}|${atoms[i].isotope ?? 0}|${bond.order}`;
      const kinds = this.hanging.get(on) ?? new Map<string, number[]>();
      kinds.set(kind, [...(kinds.get(kind) ?? []), i]);
      this.hanging.set(on, kinds);
    }
    const by = new Map<string, number[]>();
    atoms.forEach((a, i) => by.set(a.el, [...(by.get(a.el) ?? []), i]));
    this.elements = [...by.keys()].sort().map((el) => by.get(el)!);
  }

  /** What `bound` compares of a geometry: each element's atoms' distances from its centre, in order. */
  signature(xyz: readonly number[]): Float64Array {
    const c = centreOf(xyz, this.n);
    const out = new Float64Array(this.n);
    let k = 0;
    for (const e of this.elements) {
      const r = e.map((i) => Math.hypot(xyz[3 * i] - c[0], xyz[3 * i + 1] - c[1], xyz[3 * i + 2] - c[2])).sort((a, b) => a - b);
      for (const v of r) out[k++] = v;
    }
    return out;
  }

  /**
   * The least two geometries of signatures `a` and `b` can lie apart: laid
   * over at their best, their centres are one, so each atom's distance from
   * it moves no more than the atom does; and of the ways of pairing atoms of
   * one element, distances sorted pair the closest.
   */
  bound(a: Float64Array, b: Float64Array): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
    return Math.sqrt(sum / this.n);
  }

  /** Geometry `a` laid over `b` at its least over the ways tried - or null, where no way could bring it within `most`. */
  apart(a: readonly number[], b: readonly number[], most = SAME_CONFORMER): Laid | null {
    const m = this.core.length;
    const ca = centreOf(a, this.n, this.core);
    const P = new Float64Array(3 * m);
    let gp = 0;
    this.core.forEach((i, k) => {
      for (let d = 0; d < 3; d++) {
        P[3 * k + d] = a[3 * i + d] - ca[d];
        gp += P[3 * k + d] ** 2;
      }
    });
    // (each way: its core's RMSD, turned and moved, over all n atoms - a bound on the whole - least first)
    const tried = this.ways.map((w) => {
      const to = w.map((k) => this.core[k]);
      const cb = centreOf(b, this.n, to);
      const Q = new Float64Array(3 * m);
      let gq = 0;
      to.forEach((j, k) => {
        for (let d = 0; d < 3; d++) {
          Q[3 * k + d] = b[3 * j + d] - cb[d];
          gq += Q[3 * k + d] ** 2;
        }
      });
      const { lambda, turn } = bestTurn(P, Q);
      return { to, cb, turn, least: Math.sqrt(Math.max(0, gp + gq - 2 * lambda) / this.n) };
    });
    tried.sort((x, y) => x.least - y.least);
    let best: Laid | null = null;
    for (const t of tried) {
      if (t.least > most || (best && t.least >= best.rmsd)) break;
      const laid = new Float64Array(3 * this.n);
      for (let i = 0; i < this.n; i++) {
        const v = [a[3 * i] - ca[0], a[3 * i + 1] - ca[1], a[3 * i + 2] - ca[2]];
        for (let d = 0; d < 3; d++) laid[3 * i + d] = t.turn[d][0] * v[0] + t.turn[d][1] * v[1] + t.turn[d][2] * v[2] + t.cb[d];
      }
      const to = Array.from({ length: this.n }, (_, i) => i);
      this.core.forEach((i, k) => (to[i] = t.to[k]));
      if (!this.hang(laid, b, to)) continue;
      const r = rmsd(a, to.map((j) => [b[3 * j], b[3 * j + 1], b[3 * j + 2]]).flat());
      if (r <= most && (!best || r < best.rmsd)) best = { rmsd: r, to };
    }
    return best;
  }

  /** Whether geometries `a` and `b` are one conformer. */
  same(a: readonly number[], b: readonly number[]): boolean {
    return this.apart(a, b) != null;
  }

  /**
   * Whether `b` is the mirror image of `a` - `a` reflected and laid over it
   * within `SAME_CONFORMER` - and, where it is, where each atom of `a` is
   * taken in it: `a`'s atom i plays in `b` the part of its atom `to[i]`.
   */
  mirrorOf(a: readonly number[], b: readonly number[]): Laid | null {
    return this.apart(
      a.map((v, k) => (k % 3 === 0 ? -v : v)),
      b,
    );
  }

  /**
   * Each atom that hangs on one of the core taken to the nearest free one of its kind on the atom that one is taken
   * to (`to`, filled in); false where those do not hang alike. (Greedy, not the best match: it can only find two
   * conformers apart that are the same, never make two different ones the same.)
   */
  private hang(laid: Float64Array, b: readonly number[], to: number[]): boolean {
    for (const [i, kinds] of this.hanging) {
      const theirs = this.hanging.get(to[i]);
      for (const [kind, mine] of kinds) {
        const other = theirs?.get(kind) ?? [];
        if (other.length !== mine.length) return false;
        const pairs: [number, number, number][] = [];
        for (const x of mine)
          for (const y of other) pairs.push([Math.hypot(laid[3 * x] - b[3 * y], laid[3 * x + 1] - b[3 * y + 1], laid[3 * x + 2] - b[3 * y + 2]), x, y]);
        pairs.sort((p, q) => p[0] - q[0]);
        const usedA = new Set<number>();
        const usedB = new Set<number>();
        for (const [, x, y] of pairs) {
          if (usedA.has(x) || usedB.has(y)) continue;
          to[x] = y;
          usedA.add(x);
          usedB.add(y);
        }
      }
    }
    return true;
  }
}

/**
 * The most steps the search for a molecule's ways takes - an atom tried as
 * the image of another - before it gives up, its ways then taken as too many
 * to try, as past `ALIKE_WAYS`. Pd(PPh3)4, whose ways are millions, passes
 * `ALIKE_WAYS` in some 40,000 (`work`), its two searches 12 ms in all (Apple
 * M4, 2026-11-01).
 */
export const WAY_STEPS = 200_000;
/** The steps the searches for ways have taken - counted so that a test can tell work bounded by `ALIKE_WAYS` from work that is not, which time on a busy machine cannot. */
export const work = { steps: 0 };

/**
 * The ways a molecule without `hangs` maps onto itself (each a way's k-th
 * entry: where the k-th of `core` goes, by its place there) - complete where
 * there are at most `ALIKE_WAYS`. They are searched for atom by atom, each
 * after one bonded to it where it has one, each taken only to an atom of its
 * kind - element, charge, isotope, the hydrogens hanging on it, its symmetry
 * class - whose bonds to those already taken are those its own are, of the
 * same orders; the search stops at `ALIKE_WAYS` + 1 ways, or `WAY_STEPS`.
 * The class only spares the search tries: the bonds checked both ways make
 * each way taken one of the molecule's own without it.
 */
function waysOf(atoms: readonly Atom[], bonds: readonly Bond[], hangs: ReadonlySet<number>): { core: number[]; ways: number[][]; complete: boolean } {
  const core = atoms.flatMap((_, i) => (hangs.has(i) ? [] : [i]));
  const place = new Map(core.map((i, k) => [i, k]));
  const n = core.length;
  const hs = core.map(() => 0);
  for (const b of bonds) {
    if (hangs.has(b.a1) && place.has(b.a2)) hs[place.get(b.a2)!]++;
    if (hangs.has(b.a2) && place.has(b.a1)) hs[place.get(b.a1)!]++;
  }
  const kept = bonds.filter((b) => place.has(b.a1) && place.has(b.a2)).map((b) => ({ a: place.get(b.a1)!, b: place.get(b.a2)!, order: b.order }));
  // (a way takes a bond only to one of its order - a Hückel ring's bonds all of one: a phenyl turned half about its
  //  bond is the same conformer)
  const huckel = huckelBonds(n, kept);
  const orders = kept.map((b) => ({ ...b, order: huckel.has(pairKey(b.a, b.b)) ? IN_TURN : b.order }));
  const near: Map<number, number>[] = core.map(() => new Map());
  for (const b of orders) {
    near[b.a].set(b.b, b.order);
    near[b.b].set(b.a, b.order);
  }
  const classes = symmetryClasses({
    atoms: core.map((i, k) => ({ el: atoms[i].el, ...(atoms[i].charge ? { charge: atoms[i].charge } : {}), hs: hs[k] })),
    bonds: orders.map((b) => ({ ...b, order: b.order === IN_TURN ? AROMATIC : b.order })),
  });
  const kind = core.map((i, k) => `${atoms[i].el}|${atoms[i].charge ?? 0}|${atoms[i].isotope ?? 0}|${hs[k]}|${classes[k]}|${near[k].size}`);
  // (atoms in turn: each after one bonded to it, a part at a time)
  const sequence: number[] = [];
  const from = new Array<number>(n).fill(-1);
  const seen = new Array<boolean>(n).fill(false);
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    seen[s] = true;
    sequence.push(s);
    for (let q = sequence.length - 1; q < sequence.length; q++)
      for (const t of near[sequence[q]].keys())
        if (!seen[t]) {
          seen[t] = true;
          from[t] = sequence[q];
          sequence.push(t);
        }
  }
  const image = new Array<number>(n).fill(-1);
  const taken = new Array<number>(n).fill(-1);
  const ways: number[][] = [];
  let steps = 0;
  let cut = false;
  const fits = (a: number, t: number) => {
    if (kind[a] !== kind[t]) return false;
    for (const [b, o] of near[a]) if (image[b] >= 0 && near[t].get(image[b]) !== o) return false;
    for (const u of near[t].keys()) if (taken[u] >= 0 && !near[a].has(taken[u])) return false;
    return true;
  };
  const extend = (k: number) => {
    if (k === n) {
      ways.push([...image]);
      return;
    }
    const a = sequence[k];
    const among = from[a] >= 0 ? near[image[from[a]]].keys() : kind.keys();
    for (const t of among) {
      if (cut || ways.length > ALIKE_WAYS) return;
      if (taken[t] >= 0) continue;
      if (++steps > WAY_STEPS) {
        cut = true;
        return;
      }
      if (!fits(a, t)) continue;
      image[a] = t;
      taken[t] = a;
      extend(k + 1);
      image[a] = -1;
      taken[t] = -1;
    }
  };
  extend(0);
  work.steps += steps;
  return { core, ways, complete: !cut && ways.length <= ALIKE_WAYS };
}

const pairKey = (x: number, y: number) => (x < y ? `${x},${y}` : `${y},${x}`);

/** The order a Hückel ring's bonds are all taken as (`huckelBonds`): none a bond is given. */
const IN_TURN = 1.5;
/** A bond's order where it is aromatic, as the symmetry classes take it (lib/chem/identity `aromaticForm`'s). */
const AROMATIC = 4;
/** Whether `atoms` of a geometry lie other than in a line: else they could be turned about that line and lay over all the same. */
function spread(xyz: readonly number[], atoms: readonly number[]): boolean {
  const c = centreOf(xyz, xyz.length / 3, atoms);
  const v = atoms.map((i) => [xyz[3 * i] - c[0], xyz[3 * i + 1] - c[1], xyz[3 * i + 2] - c[2]]);
  const far = v.reduce((m, p) => (Math.hypot(...p) > Math.hypot(...m) ? p : m), [0, 0, 0]);
  const len = Math.hypot(...far);
  if (len < 1e-3) return false;
  const u = far.map((x) => x / len);
  // (any atom off the line through the centre along the farthest)
  return v.some((p) => {
    const along = p[0] * u[0] + p[1] * u[1] + p[2] * u[2];
    return Math.hypot(p[0] - along * u[0], p[1] - along * u[1], p[2] - along * u[2]) > 1e-3;
  });
}

function centreOf(xyz: readonly number[], n: number, atoms?: readonly number[]): [number, number, number] {
  const of = atoms ?? Array.from({ length: n }, (_, i) => i);
  const c: [number, number, number] = [0, 0, 0];
  for (const i of of) for (let d = 0; d < 3; d++) c[d] += xyz[3 * i + d] / of.length;
  return c;
}

/**
 * The turn that lays centred `p` over centred `q` at their best, and the
 * largest eigenvalue it comes from: the quaternion method (B. K. P. Horn,
 * J. Opt. Soc. Am. A 4, 629 (1987)), the eigenvector by Jacobi's rotations.
 * `turn` takes a point of `p` to its place over `q`.
 */
export function bestTurn(p: Float64Array, q: Float64Array): { lambda: number; turn: number[][] } {
  let xx = 0, xy = 0, xz = 0, yx = 0, yy = 0, yz = 0, zx = 0, zy = 0, zz = 0;
  for (let i = 0; i < p.length; i += 3) {
    xx += p[i] * q[i]; xy += p[i] * q[i + 1]; xz += p[i] * q[i + 2];
    yx += p[i + 1] * q[i]; yy += p[i + 1] * q[i + 1]; yz += p[i + 1] * q[i + 2];
    zx += p[i + 2] * q[i]; zy += p[i + 2] * q[i + 1]; zz += p[i + 2] * q[i + 2];
  }
  const m = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ];
  const { values, vectors } = eigen4(m);
  let k = 0;
  for (let i = 1; i < 4; i++) if (values[i] > values[k]) k = i;
  const [w, x, y, z] = vectors.map((r) => r[k]);
  const turn = [
    [w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z],
  ];
  return { lambda: values[k], turn };
}

/** A symmetric 4 x 4 matrix's eigenvalues and eigenvectors (as columns), by Jacobi's rotations. */
function eigen4(given: readonly (readonly number[])[]): { values: number[]; vectors: number[][] } {
  const a = given.map((r) => r.slice());
  const v: number[][] = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) off += a[i][j] * a[i][j];
    if (off < 1e-24) break;
    for (let p = 0; p < 4; p++) {
      for (let q = p + 1; q < 4; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 4; k++) {
          const kp = a[k][p];
          const kq = a[k][q];
          a[k][p] = c * kp - s * kq;
          a[k][q] = s * kp + c * kq;
        }
        for (let k = 0; k < 4; k++) {
          const pk = a[p][k];
          const qk = a[q][k];
          a[p][k] = c * pk - s * qk;
          a[q][k] = s * pk + c * qk;
        }
        for (let k = 0; k < 4; k++) {
          const kp = v[k][p];
          const kq = v[k][q];
          v[k][p] = c * kp - s * kq;
          v[k][q] = s * kp + c * kq;
        }
      }
    }
  }
  return { values: a.map((r, i) => r[i]), vectors: v };
}
