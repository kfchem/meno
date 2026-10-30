/**
 * Reaction atom mapping: every atom of a product, hydrogens included, paired
 * one to one with an atom of the reactant, in 3D.
 *
 * Ported from ACCeL (kfchem/accel, MIT) with the author's permission: the
 * atom mapper of accel/base/modeler.py on master (the same file as the
 * accel 0.3.0 release) - Modeler.get_maps and get_mapped, and the module
 * functions they call: _get_maps, _correct_maps, _order_maps and _kabsch,
 * with Modeler.incorporate, merge and get_splitted, and the parts of
 * accel/base/atoms.py (Atom, Atoms, Bonds, BondType) they rest on.
 *
 * The port is literal, function by function and branch by branch: every
 * condition, threshold, sign and iteration order of the original is kept,
 * including those that look redundant, so that the results are the same
 * atom for atom and map for map. Each function and block names the line
 * range of modeler.py (or atoms.py) it comes from, to be read side by side.
 * Python's own orders are kept where they decide anything: list and dict
 * insertion order, sorted() being stable, a set of small integers iterated
 * the way CPython iterates it (`pyIntSetAnd`), the DFS stack and the deque.
 * Where Python iterates a set of atoms - whose order follows the atoms'
 * memory addresses and so changes from one run of ACCeL to the next - the
 * port takes one fixed order, said where it happens (docs/ATOM-MAPPING.md,
 * *Where ACCeL's own order is not fixed*).
 *
 * MIT License
 *
 * Copyright (c) 2021, Keisuke Fukaya
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import { ELEMENTS } from "./elements";

// ---------------------------------------------------------------------------
// atoms.py: BondType (lines 13-27)
// ---------------------------------------------------------------------------

export const BondType = {
  undefined: -1,
  none: 0,
  single: 1,
  double: 2,
  triple: 3,
  aromatic: 4,
  single_or_double: 5,
  single_or_aromatic: 6,
  double_or_aromatic: 7,
  any: 8,
  contact: 9,
} as const;

/** An atom's bonded atoms by kind (atoms.py 96-119), and how many of `bonds` are hydrogens. */
type Near = { bonds: Atom[]; single: Atom[]; double: Atom[]; triple: Atom[]; aromatic: Atom[]; hs: number };
const NO_NEAR: Near = { bonds: [], single: [], double: [], triple: [], aromatic: [], hs: 0 };

/** The types `Atom.bonds` counts (atoms.py 96-99). */
const BONDS_TYPES: readonly number[] = [
  BondType.undefined,
  BondType.single,
  BondType.double,
  BondType.triple,
  BondType.aromatic,
  BondType.any,
];

// ---------------------------------------------------------------------------
// util/constants.py: Elements.symbols and canonicalize (lines 13-31)
// ---------------------------------------------------------------------------

/** Elements.symbols: "" first, then each element at its atomic number. */
export const SYMBOLS: readonly string[] = ["", ...ELEMENTS.map((e) => e.symbol)];
const LOWER_SYMBOLS = SYMBOLS.map((s) => s.toLowerCase());

/** Elements.canonicalize for a string: its symbol as the table spells it, "" for one not there. */
export function canonicalize(input: string): string {
  const i = LOWER_SYMBOLS.indexOf(String(input).trim().toLowerCase());
  return i < 0 ? "" : SYMBOLS[i];
}

// ---------------------------------------------------------------------------
// atoms.py: Atom (lines 37-187), Bonds (190-283), Atoms (286-459) - the
// parts the mapper uses. An atom's number is its place in its parent's list,
// counted from 1; its bonded atoms come in that order, from its row of the
// bond matrix.
// ---------------------------------------------------------------------------

export class Atom {
  symbol: string;
  x: number;
  y: number;
  z: number;
  parent: Atoms | null = null;
  /** Atom.cache: what _order_maps keeps on each atom (map_idx, original_number). */
  cache: { map_idx?: number | null; original_number?: number } = {};

  constructor(symbol: string, x = 0, y = 0, z = 0, parent: Atoms | null = null) {
    this.symbol = canonicalize(symbol);
    this.x = x;
    this.y = y;
    this.z = z;
    this.parent = parent;
  }

  /** Where it was last found in its parent's list (a hint: `number` checks it). */
  _at = -1;
  /** Its bonded atoms of each kind, as last read from its parent's bond matrix, and the matrix's version then. */
  private _near: Near | null = null;
  private _nearOf = -1;

  /** atoms.py 73-78: index in the parent's list + 1 (where it was last found, if it is still there). */
  get number(): number {
    const p = this.parent;
    if (!p) return null as unknown as number;
    if (p.list[this._at] !== this) this._at = p.list.indexOf(this);
    return this._at + 1;
  }

  /** atoms.py 80-94: the atoms in its row of the bond matrix, by kind, in index order - read once while the bonds stay as they are. */
  near(): Near {
    const p = this.parent;
    if (!p || !p.bonds) return NO_NEAR;
    if (this._near && this._nearOf === p.version) return this._near;
    const row = p.bonds[this.number - 1];
    const near: Near = { bonds: [], single: [], double: [], triple: [], aromatic: [], hs: 0 };
    for (let j = 0; j < row.length; j++) {
      const t = row[j];
      const b = p.list[j];
      if (BONDS_TYPES.includes(t)) {
        near.bonds.push(b);
        if (b.symbol === "H") near.hs++;
      }
      if (t === BondType.single) near.single.push(b);
      else if (t === BondType.double) near.double.push(b);
      else if (t === BondType.triple) near.triple.push(b);
      else if (t === BondType.aromatic) near.aromatic.push(b);
    }
    this._near = near;
    this._nearOf = p.version;
    return near;
  }

  // (each read as it is: callers take them as they are and never change them)
  get bonds(): readonly Atom[] {
    return this.near().bonds;
  }
  get single(): readonly Atom[] {
    return this.near().single;
  }
  get double(): readonly Atom[] {
    return this.near().double;
  }
  get triple(): readonly Atom[] {
    return this.near().triple;
  }
  get aromatic(): readonly Atom[] {
    return this.near().aromatic;
  }

  get xyz(): [number, number, number] {
    return [this.x, this.y, this.z];
  }

  /** atoms.py 150-154 */
  move(vector: readonly number[]): this {
    this.x = this.x + vector[0];
    this.y = this.y + vector[1];
    this.z = this.z + vector[2];
    return this;
  }

  /** atoms.py 156-166 (the parts kept here). */
  duplicate(atoms: Atoms | null = null): Atom {
    const n = new Atom("", 0, 0, 0, atoms);
    n.symbol = this.symbol;
    n.x = this.x;
    n.y = this.y;
    n.z = this.z;
    n.cache = { ...this.cache };
    return n;
  }
}

export class Atoms {
  list: Atom[] = [];
  /** Bonds._matrix, or null where the atoms have no bonds (atoms.py 286-290). */
  bonds: number[][] | null = null;
  /** Counted up whenever its atoms or bonds change: what an atom read of its neighbours is good for. */
  version = 0;

  [Symbol.iterator](): Iterator<Atom> {
    return this.list[Symbol.iterator]();
  }

  get length(): number {
    return this.list.length;
  }

  at(i: number): Atom {
    return this.list[i];
  }

  /** atoms.py 347-358 */
  get(value: number | Atom): Atom | null {
    if (value instanceof Atom) return this.list.includes(value) ? value : null;
    if (Number.isInteger(value) && 1 <= value && value <= this.list.length) return this.list[value - 1];
    return null;
  }

  /** atoms.py 360-366, `_new_atom_instance` 312-323: an atom with a parent is duplicated. */
  getNewAtom(value: Atom | [string, number, number, number]): Atom {
    const a = this.newAtomInstance(value);
    this.list.push(a);
    a._at = this.list.length - 1;
    this.version++;
    return a;
  }

  private newAtomInstance(value: Atom | [string, number, number, number]): Atom {
    let a: Atom;
    if (value instanceof Atom) {
      a = value.parent === null ? value : value.duplicate();
      a.parent = this;
    } else {
      a = new Atom(value[0], value[1], value[2], value[3], this);
    }
    return a;
  }

  /** MutableSequence.append -> insert (atoms.py 342-347): the bond matrix grows with it. */
  append(value: Atom): Atom {
    const a = this.newAtomInstance(value);
    this.list.push(a);
    a._at = this.list.length - 1;
    if (this.bonds !== null) {
      for (const row of this.bonds) row.push(0);
      this.bonds.push(new Array(this.list.length).fill(0));
    }
    this.version++;
    return a;
  }

  /** atoms.py 404-406 */
  initBonds(): this {
    const n = this.list.length;
    this.bonds = Array.from({ length: n }, () => new Array(n).fill(0));
    this.version++;
    return this;
  }

  /** Bonds.__setitem__ (atoms.py 217-224), by atom numbers. */
  setBond(numberA: number, numberB: number, value: number): void {
    if (!this.bonds) this.initBonds();
    this.bonds![numberA - 1][numberB - 1] = value;
    this.bonds![numberB - 1][numberA - 1] = value;
    this.version++;
  }

  /** atoms.py 408-419 */
  addBond(numberA: number, numberB: number, bondType: number): this {
    if (this.bonds === null) this.initBonds();
    if (numberA > numberB) [numberA, numberB] = [numberB, numberA];
    if (numberA < 1 || this.list.length < numberB) throw new Error(`could not add bond between ${numberA} and ${numberB}`);
    this.setBond(numberA, numberB, bondType);
    return this;
  }

  hasBonds(): boolean {
    return this.bonds !== null;
  }

  /** Bonds.to_dict (atoms.py 196-205): (number a, number b, type) for a < b, none, undefined and contact left out. */
  bondsDict(): [number, number, number][] {
    const out: [number, number, number][] = [];
    const m = this.bonds;
    if (!m) return out;
    for (let ia = 0; ia < m.length; ia++) {
      for (let ib = 0; ib < m.length; ib++) {
        if (ia >= ib) continue;
        const t = m[ia][ib];
        if (t !== BondType.none && t !== BondType.undefined && t !== BondType.contact) out.push([ia + 1, ib + 1, t]);
      }
    }
    return out;
  }


  /** atoms.py 395-401 */
  duplicate(): Atoms {
    const n = new Atoms();
    n.list = this.list.map((a) => a.duplicate(n));
    if (this.bonds !== null) n.bonds = this.bonds.map((r) => r.slice());
    return n;
  }
}

// ---------------------------------------------------------------------------
// Python's behaviour, where the original's results depend on it.
// ---------------------------------------------------------------------------

const last = <T>(xs: readonly T[]): T => xs[xs.length - 1];

/** Python `==` on two flat lists of numbers, strings, booleans or null. */
function eqList(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Python `<` on numbers, or on tuples of numbers element by element. */
function pyLess(x: number | readonly number[], y: number | readonly number[]): boolean {
  if (typeof x === "number" && typeof y === "number") return x < y;
  const a = x as readonly number[];
  const b = y as readonly number[];
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return a.length < b.length;
}

/** sorted(xs, key=key, reverse=reverse): stable, by `<` only. */
function pySorted<T>(xs: readonly T[], key: (x: T) => number | readonly number[], reverse = false): T[] {
  const keyed = xs.map((x, i) => ({ x, k: key(x), i }));
  keyed.sort((p, q) => {
    // reverse=True keeps equal items in their original order, as Python's does
    const lt = reverse ? pyLess(q.k, p.k) : pyLess(p.k, q.k);
    const gt = reverse ? pyLess(p.k, q.k) : pyLess(q.k, p.k);
    if (lt) return -1;
    if (gt) return 1;
    return p.i - q.i;
  });
  return keyed.map((p) => p.x);
}

/** Python's max() of two values: the first unless the second is greater. */
function pyMax(a: number, b: number): number {
  return b > a ? b : a;
}

/**
 * round(x, 1): the nearest tenth to the exact binary value; an exact tie
 * (x * 4 an odd integer, as 0.25 or 0.75 is) goes to the even tenth.
 */
export function pyRound1(x: number): number {
  if (!Number.isFinite(x)) return x;
  const q = x * 4;
  if (Number.isInteger(q) && !Number.isInteger(x * 2)) {
    const t = x * 10;
    const lo = Math.floor(t);
    const even = lo % 2 === 0 ? lo : lo + 1;
    return even / 10;
  }
  return Number(x.toFixed(1));
}

/**
 * CPython's set of non-negative small integers (hash(n) == n): the order it
 * iterates them in, as setobject.c fills and resizes its table - linear
 * probes of 9, then perturbed probing; a resize to the first power of two
 * above 4 x used once fill x 5 >= mask x 3.
 */
class PyIntSet {
  private table: (number | null)[] = new Array(8).fill(null);
  private used = 0;
  private fill = 0;

  static from(values: readonly number[]): PyIntSet {
    const s = new PyIntSet();
    for (const v of values) s.add(v);
    return s;
  }

  has(v: number): boolean {
    return this.table.includes(v);
  }

  get size(): number {
    return this.used;
  }

  private static slot(table: (number | null)[], hash: number, stopAt: (e: number | null) => boolean): number {
    const mask = table.length - 1;
    let i = hash & mask;
    let perturb = hash;
    for (;;) {
      let j = i;
      let probes = i + 9 <= mask ? 9 : 0;
      for (;;) {
        if (stopAt(table[j])) return j;
        if (probes-- === 0) break;
        j++;
      }
      perturb = Math.floor(perturb / 32);
      i = (i * 5 + 1 + perturb) & mask;
    }
  }

  add(v: number): void {
    if (this.has(v)) return;
    const j = PyIntSet.slot(this.table, v, (e) => e === null);
    this.table[j] = v;
    this.fill++;
    this.used++;
    const mask = this.table.length - 1;
    if (this.fill * 5 < mask * 3) return;
    const minused = this.used > 50000 ? this.used * 2 : this.used * 4;
    let newsize = 8;
    while (newsize <= minused) newsize *= 2;
    const old = this.table;
    this.table = new Array(newsize).fill(null);
    for (const e of old) {
      if (e === null) continue;
      const k = PyIntSet.slot(this.table, e, (x) => x === null);
      this.table[k] = e;
    }
    this.fill = this.used;
  }

  values(): number[] {
    return this.table.filter((e): e is number => e !== null);
  }
}

/** list(set(a) & set(b)), in CPython's order: the smaller set walked (the right one on a tie), into a new set. */
export function pyIntSetAnd(a: readonly number[], b: readonly number[]): number[] {
  let so = PyIntSet.from(a);
  let other = PyIntSet.from(b);
  if (other.size > so.size) [so, other] = [other, so];
  const result = new PyIntSet();
  for (const k of other.values()) if (so.has(k)) result.add(k);
  return result.values();
}

/** list(set(a) - set(b)) - here used only where its length alone, or its one element, matters. */
function setDiff(a: readonly number[], b: readonly number[]): number[] {
  const out: number[] = [];
  for (const v of a) if (!b.includes(v) && !out.includes(v)) out.push(v);
  return out;
}

/** itertools.combinations(xs, r), in its order. */
export function* combinations<T>(xs: readonly T[], r: number): Generator<T[]> {
  const n = xs.length;
  if (r > n) return;
  const idx = Array.from({ length: r }, (_, i) => i);
  yield idx.map((i) => xs[i]);
  for (;;) {
    let i = r - 1;
    while (i >= 0 && idx[i] === i + n - r) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < r; j++) idx[j] = idx[j - 1] + 1;
    yield idx.map((k) => xs[k]);
  }
}

// ---------------------------------------------------------------------------
// numpy, as the original calls it: sums in numpy's orders (a 3-vector's
// left to right; a whole array's pairwise; a mean down a column row after
// row), np.cross's formula, det by LU with partial pivoting, arccos.
// ---------------------------------------------------------------------------

type V3 = [number, number, number];

const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
/** np.cross for 3-vectors: cp0 = a1*b2 - a2*b1, cp1 = a2*b0 - a0*b2, cp2 = a0*b1 - a1*b0. */
const cross = (a: readonly number[], b: readonly number[]): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
/** np.sum(a * b) and np.inner(a, b) for 3-vectors: (a0b0 + a1b1) + a2b2. */
const dot = (a: readonly number[], b: readonly number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** np.linalg.norm of a 3-vector: sqrt((x0² + x1²) + x2²). */
const norm = (a: readonly number[]): number => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
/** np.rad2deg / np.degrees */
const DEG = 180 / Math.PI;
const rad2deg = (x: number): number => x * DEG;
/**
 * np.arccos; with `clamp` (Meno's departures), a cosine that rounding has
 * pushed just past -1 or 1 taken as -1 or 1 - not a number otherwise. A
 * cosine that is not a number (a zero vector's) stays one either way.
 */
export const acosOf = (x: number, clamp: boolean): number => Math.acos(clamp ? Math.min(1, Math.max(-1, x)) : x);

/** numpy's pairwise sum of a contiguous array (pairwise_sum in loops_utils.h). */
function pairwiseSum(xs: readonly number[], lo = 0, n = xs.length): number {
  if (n < 8) {
    let res = 0;
    for (let i = 0; i < n; i++) res += xs[lo + i];
    return res;
  }
  if (n <= 128) {
    const r = xs.slice(lo, lo + 8);
    let i = 8;
    for (; i < n - (n % 8); i += 8) for (let j = 0; j < 8; j++) r[j] += xs[lo + i + j];
    let res = r[0] + r[1] + (r[2] + r[3]) + (r[4] + r[5] + (r[6] + r[7]));
    for (; i < n; i++) res += xs[lo + i];
    return res;
  }
  let n2 = Math.floor(n / 2);
  n2 -= n2 % 8;
  return pairwiseSum(xs, lo, n2) + pairwiseSum(xs, lo + n2, n - n2);
}

/** np.linalg.det of a 3x3 matrix: LU with partial pivoting, the product of the pivots and the permutation's sign. */
function det3(m: readonly (readonly number[])[]): number {
  const a = m.map((r) => r.slice());
  let sign = 1;
  for (let k = 0; k < 3; k++) {
    let p = k;
    for (let i = k + 1; i < 3; i++) if (Math.abs(a[i][k]) > Math.abs(a[p][k])) p = i;
    if (p !== k) {
      [a[p], a[k]] = [a[k], a[p]];
      sign = -sign;
    }
    if (a[k][k] === 0) continue;
    for (let i = k + 1; i < 3; i++) {
      const f = a[i][k] / a[k][k];
      for (let j = k; j < 3; j++) a[i][j] -= f * a[k][j];
    }
  }
  return sign * a[0][0] * a[1][1] * a[2][2];
}

/**
 * The singular value decomposition of a 3x3 matrix (one-sided Jacobi):
 * U, the singular values largest first, and V transposed, as
 * np.linalg.svd gives them up to the signs of paired columns.
 */
function svd3(m: readonly (readonly number[])[]): { u: number[][]; s: number[]; vt: number[][] } {
  const a = m.map((r) => r.slice());
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < 2; p++) {
      for (let q = p + 1; q < 3; q++) {
        let alpha = 0;
        let beta = 0;
        let gamma = 0;
        for (let i = 0; i < 3; i++) {
          alpha += a[i][p] * a[i][p];
          beta += a[i][q] * a[i][q];
          gamma += a[i][p] * a[i][q];
        }
        if (gamma === 0 || Math.abs(gamma) <= 1e-300) continue;
        off = Math.max(off, Math.abs(gamma) / Math.sqrt(alpha * beta || 1));
        const zeta = (beta - alpha) / (2 * gamma);
        const t = Math.sign(zeta || 1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = c * t;
        for (let i = 0; i < 3; i++) {
          const ap = a[i][p];
          const aq = a[i][q];
          a[i][p] = c * ap - s * aq;
          a[i][q] = s * ap + c * aq;
          const vp = v[i][p];
          const vq = v[i][q];
          v[i][p] = c * vp - s * vq;
          v[i][q] = s * vp + c * vq;
        }
      }
    }
    if (off < 1e-15) break;
  }
  const sv = [0, 1, 2].map((j) => Math.sqrt(a[0][j] * a[0][j] + a[1][j] * a[1][j] + a[2][j] * a[2][j]));
  const order = [0, 1, 2].sort((i, j) => sv[j] - sv[i]);
  const s = order.map((j) => sv[j]);
  const ucols: V3[] = [];
  const vcols: V3[] = order.map((j) => [v[0][j], v[1][j], v[2][j]]);
  const scale = s[0] || 1;
  for (let k = 0; k < 3; k++) {
    const j = order[k];
    if (s[k] > scale * 1e-13) {
      ucols.push([a[0][j] / s[k], a[1][j] / s[k], a[2][j] / s[k]]);
    } else if (k === 2 && ucols.length === 2) {
      ucols.push(cross(ucols[0], ucols[1]));
    } else {
      // complete an orthonormal basis: the axis least along those so far, made orthogonal to them
      let best: V3 = [1, 0, 0];
      let least = Infinity;
      for (const e of [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ] as V3[]) {
        const along = ucols.reduce((acc, u) => acc + Math.abs(dot(u, e)), 0);
        if (along < least) {
          least = along;
          best = e;
        }
      }
      let w: V3 = [...best];
      for (const u of ucols) {
        const d = dot(u, w);
        w = [w[0] - d * u[0], w[1] - d * u[1], w[2] - d * u[2]];
      }
      const n = norm(w);
      ucols.push([w[0] / n, w[1] / n, w[2] / n]);
    }
  }
  const u = [0, 1, 2].map((i) => [ucols[0][i], ucols[1][i], ucols[2][i]]);
  const vt = vcols.map((c) => [...c]);
  return { u, s, vt };
}

/** _kabsch (modeler.py 1868-1876): the RMSD of `tar` on `ref` after the best rotation. */
export function kabsch(refXyzs: readonly (readonly number[])[], tarXyzs: readonly (readonly number[])[]): number {
  const n = refXyzs.length;
  const mean = (xs: readonly (readonly number[])[]): V3 => {
    const m: V3 = [xs[0][0], xs[0][1], xs[0][2]];
    for (let i = 1; i < xs.length; i++) for (let k = 0; k < 3; k++) m[k] += xs[i][k];
    return [m[0] / xs.length, m[1] / xs.length, m[2] / xs.length];
  };
  const mr = mean(refXyzs);
  const mt = mean(tarXyzs);
  const ref = refXyzs.map((p) => sub(p, mr));
  const tar = tarXyzs.map((p) => sub(p, mt));
  // np.dot(tar_xyzs.T, ref_xyzs)
  const h: number[][] = [0, 1, 2].map((i) =>
    [0, 1, 2].map((j) => {
      let acc = 0;
      for (let k = 0; k < n; k++) acc += tar[k][i] * ref[k][j];
      return acc;
    }),
  );
  const { u, vt } = svd3(h);
  if (det3(u) * det3(vt) < 0.0) for (let i = 0; i < 3; i++) u[i][2] = -u[i][2];
  const r = [0, 1, 2].map((i) => [0, 1, 2].map((j) => u[i][0] * vt[0][j] + u[i][1] * vt[1][j] + u[i][2] * vt[2][j]));
  const sq: number[] = [];
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < 3; j++) {
      const rotated = tar[k][0] * r[0][j] + tar[k][1] * r[1][j] + tar[k][2] * r[2][j];
      const d = ref[k][j] - rotated;
      sq.push(d * d);
    }
  }
  return Math.sqrt(pairwiseSum(sq) / n);
}

// ---------------------------------------------------------------------------
// Modeler.merge, incorporate (modeler.py 350-371), get_splitted (376-412)
// ---------------------------------------------------------------------------

/** Modeler.merge (350-357): `atoms` appended, their bonds with them. */
export function merge(self: Atoms, atoms: Atoms): Atoms {
  const pLen = self.length;
  for (const a of atoms.list) self.append(a);
  for (const [fa, fb, val] of atoms.bondsDict()) self.setBond(fa + pLen, fb + pLen, val);
  return self;
}

/** Modeler.incorporate (359-371): `atoms` set beside `self` - past its far corner by `padding` on each axis - and merged in. */
export function incorporate(self: Atoms, atoms: Atoms, padding = 2.0): Atoms {
  const tAtoms = atoms.duplicate();
  const sXyzs = self.list.map((a) => a.xyz);
  const maxXyz = [0, 1, 2].map((i) => Math.max(...sXyzs.map((xyz) => xyz[i])));
  const tXyzs = tAtoms.list.map((a) => a.xyz);
  const minXyz = [0, 1, 2].map((i) => Math.min(...tXyzs.map((xyz) => xyz[i])));
  const vec = [0, 1, 2].map((i) => maxXyz[i] - minXyz[i] + padding);
  for (const a of tAtoms.list) a.move(vec);
  merge(self, tAtoms);
  return self;
}

/** Modeler.get_splitted (376-412), reduced to what _order_maps reads of it: each fragment's original atom numbers. */
export function getSplitted(atoms: Atoms): number[][] {
  let atomLl: number[][] = atoms.list.map((a) => [a.number]);
  const bondingTypes: readonly number[] = [
    BondType.single,
    BondType.double,
    BondType.triple,
    BondType.aromatic,
    BondType.single_or_double,
    BondType.single_or_aromatic,
    BondType.double_or_aromatic,
  ];
  for (const [b0, b1, type] of atoms.bondsDict()) {
    if (!bondingTypes.includes(type)) continue;
    const newL: number[] = [];
    for (const atomL of atomLl) {
      if (atomL.includes(b0) || atomL.includes(b1)) {
        newL.push(...atomL);
        atomL.length = 0;
      }
    }
    atomLl.push(newL);
  }
  atomLl = atomLl.filter((l) => l.length !== 0).map((l) => [...l].sort((p, q) => p - q));
  return atomLl;
}

// ---------------------------------------------------------------------------
// _get_maps (modeler.py 748-1254)
// ---------------------------------------------------------------------------

export type Pair = [Atom, Atom];
export type Chain = Pair[];

/**
 * Meno's departures from ACCeL - each off in `ACCEL_EXACT`, which the port
 * runs as the original does, and on in `MENO_DEPARTURES`, which Meno maps
 * with (docs/ATOM-MAPPING.md, *Where Meno departs from ACCeL*):
 *
 * - `firstOfGroupByGeometry`: three or more like atoms on an atom with no
 *   torsion to place the first of them by (no paired neighbour with a
 *   paired neighbour of its own - the methyl of an SN2 at a methyl) - the
 *   first is paired with the one nearest it, the two structures laid over
 *   one another by the pairs so far, rather than with the first by atom
 *   order (modeler.py 1069-1071, 1098).
 * - `clampTorsionCosine`: a torsion's cosine kept within [-1, 1], so that an
 *   atom exactly anti is not lost to rounding (modeler.py 980).
 * - `clampEzCosine`: likewise in _det_ez, so that an exactly anti torsion
 *   reads as E (modeler.py 951).
 * - `clampFaceCosine`: likewise in _order_maps' face tests, so that a face
 *   exactly opposite reads as the other face, not as under 90 degrees
 *   (modeler.py 1404, 1425, 1441).
 * - `skipUnflaggedFacePair`: a pair of faces, the same forwards and
 *   backwards, with no face flag, left out of the pericyclic score rather
 *   than failing (modeler.py 1720).
 * - `spectatorsByRmsd`: like molecules standing apart - SPECTATORS_AT_LEAST
 *   or more of one kind on each side, the same number, bonded to nothing
 *   else (a solvent's) - left out of the initial pairs until everything
 *   else is placed, then given ACCeL's own placement by RMSD
 *   (modeler.py 1161-1228), one kind after another: the placement ACCeL
 *   reaches once the rest is placed, reached directly, rather than every
 *   permutation of them tried on the way (modeler.py 792-843, 1230-1242).
 * - `spectatorsRefined` (with `spectatorsByRmsd`): each map's like molecules
 *   then given to one another again, whole, turned as their symmetry
 *   allows, for the least total RMSD (`refinedSpectators`) - which is the
 *   permutation ACCeL's ordering (total_rmsd, modeler.py 1564) puts first
 *   where it tries them all.
 * - `signedTorsion`: three or more like atoms on an atom, placed by a
 *   torsion - the first on the one side taken as ACCeL takes it (the torsion
 *   furthest from 0), and paired with the one on the other side whose
 *   torsion, sign and all, is nearest its own - rather than with the one
 *   furthest from 0 there too, whichever way round (modeler.py 1077-1094,
 *   965-987): a methyl turned 5 degrees is not taken as turned 120.
 * - `fewestBondChanges`: the maps ordered, after ACCeL's first key
 *   (metathesis_point), by how many bonds they form or break, those to
 *   hydrogen included - the fewest first - and only then by ACCeL's other
 *   keys (modeler.py 1857-1865): an elementary step makes and breaks as few
 *   bonds as it can.
 * - `transferAlignedH`: where a map moves one of an atom's like hydrogens to
 *   another atom, the one that moves is the one the donor can bring in line
 *   with the acceptor by turning least, and the place it takes on the
 *   acceptor the one in line with the donor - each map's chemistry kept,
 *   only which of the like hydrogens goes changed (`alignedTransfers`),
 *   after ACCeL's ordering, and only where the geometry is clear by
 *   `TRANSFER_MARGIN`: a hydrogen is passed along the line D-H...A, so the
 *   one already nearest that line is the one that goes.
 * - `localLeastTurn`: like hydrogens that stay on one atom, where the atom
 *   has two or more heavy neighbours, as many neighbours on both sides and
 *   the order of its bond to each it keeps, given to one another again for
 *   the least motion once the atom and those neighbours are laid over one
 *   another (`localLeastTurn`), after `transferAlignedH`: such a group
 *   cannot turn freely, so its hydrogens keep their places about their
 *   atom's frame through a step.
 */
export type Departures = {
  firstOfGroupByGeometry: boolean;
  clampTorsionCosine: boolean;
  clampEzCosine: boolean;
  clampFaceCosine: boolean;
  skipUnflaggedFacePair: boolean;
  spectatorsByRmsd: boolean;
  spectatorsRefined: boolean;
  signedTorsion: boolean;
  fewestBondChanges: boolean;
  transferAlignedH: boolean;
  localLeastTurn: boolean;
};
export const ACCEL_EXACT: Departures = {
  firstOfGroupByGeometry: false,
  clampTorsionCosine: false,
  clampEzCosine: false,
  clampFaceCosine: false,
  skipUnflaggedFacePair: false,
  spectatorsByRmsd: false,
  spectatorsRefined: false,
  signedTorsion: false,
  fewestBondChanges: false,
  transferAlignedH: false,
  localLeastTurn: false,
};
export const MENO_DEPARTURES: Departures = {
  firstOfGroupByGeometry: true,
  clampTorsionCosine: true,
  clampEzCosine: true,
  clampFaceCosine: true,
  skipUnflaggedFacePair: true,
  spectatorsByRmsd: true,
  spectatorsRefined: true,
  signedTorsion: true,
  fewestBondChanges: true,
  transferAlignedH: true,
  localLeastTurn: true,
};

/** What a trace hook is shown of each _get_maps call as it returns: its locals by their Python names. */
export type GetMapsSnapshot = {
  _recursion_counter: number;
  known_pairs: Chain | number[][];
  initial_pairs: Chain;
  initial_chains: Chain[];
  canonical_initial_chains: Chain[];
  h_matched_canonical_initial_chains: Chain[];
  extended_chains: Chain[];
  canonical_extended_chains: Chain[];
  extracted_canonical_extended_chains: Chain[];
  recursive_extended_chains: Chain[];
  return: Chain[];
};

export type MapperTrace = {
  /**
   * false: every recursive _get_maps call made, none answered from an earlier
   * one of the same known pairs (`ReuseContext`) - for following the original
   * call by call. The maps are the same either way.
   */
  reuse?: boolean;
  getMaps?: (s: GetMapsSnapshot) => void;
  orderMaps?: (evaluated: Evaluated[]) => void;
};

/** The key the original files a chain under: its (a, b) number pairs, sorted (stably) by a's number. */
function chainKey(chain: readonly Pair[]): string {
  // (sorted stably by a's number: equal numbers keep their order)
  const prs = chain.map((pr, i) => [pr[0].number, pr[1].number, i]);
  prs.sort((p, q) => p[0] - q[0] || p[2] - q[2]);
  let key = "";
  for (const t of prs) key += `${t[0]}:${t[1]},`;
  return key;
}

/** Each atom's first place in `atoms`, as list.index finds it. */
function firstPlaces(atoms: readonly Atom[]): Map<Atom, number> {
  const pos = new Map<Atom, number>();
  atoms.forEach((a, i) => {
    if (!pos.has(a)) pos.set(a, i);
  });
  return pos;
}

const symbolIndex = (s: string): number => SYMBOLS.indexOf(s);

/** _det_ez (945-957): whether a-b-c-d is a dihedral over 90 degrees either way (E). */
export function _det_ez(a: Atom, b: Atom, c: Atom, d: Atom, clamp = false): boolean {
  const vab = sub(a.xyz, b.xyz);
  const vcb = sub(c.xyz, b.xyz);
  const vdc = sub(d.xyz, c.xyz);
  const pvac = cross(vab, vcb);
  const pvbd = cross(vdc, vcb);
  // [Meno departure: clampEzCosine] a cosine rounded past -1 or 1 is taken as -1 or 1
  let angle = acosOf(dot(pvac, pvbd) / (norm(pvac) * norm(pvbd)), clamp);
  if (dot(pvac, cross(pvbd, vcb)) < 0) angle = -angle;
  angle = rad2deg(angle);
  if (angle > 90 || angle < -90) return true;
  return false;
}

/** _det_chirality (959-963), and _order_maps' det_chirality (1447-1451): det of b, c, d from a, over zero. */
export function _det_chirality(a: Atom, b: Atom, c: Atom, d: Atom): boolean {
  const neighborsXyz = [b, c, d].map((at) => sub(at.xyz, a.xyz));
  if (det3(neighborsXyz) > 0) return true;
  return false;
}

/** _get_most_dihedral (965-987): of `a_list`, the one whose a-b-c-d dihedral is furthest from 0, the last on a tie. */
export function _get_most_dihedral(a_list: readonly Atom[], b: Atom, c: Atom, d: Atom, clamp = false): [Atom, number] {
  let max_dihedral_a = a_list[0];
  let max_dihedral_angle = 0;
  const vb = b.xyz;
  const vc = c.xyz;
  const vd = d.xyz;
  const vcb = sub(vc, vb);
  const vdc = sub(vd, vc);
  for (const a of a_list) {
    const va = a.xyz;
    const vab = sub(va, vb);
    const pvac = cross(vab, vcb);
    const pvbd = cross(vdc, vcb);
    const dac = norm(pvac);
    const dbd = norm(pvbd);
    const cos = dot(pvac, pvbd) / (dac * dbd);
    // [Meno departure: clampTorsionCosine] a cosine rounded past -1 or 1 is taken as -1 or 1
    let angle = acosOf(cos, clamp);
    if (dot(pvac, cross(pvbd, vcb)) < 0) angle = -angle;
    angle = Math.abs(rad2deg(angle));
    if (max_dihedral_angle <= angle) {
      max_dihedral_a = a;
      max_dihedral_angle = angle;
    }
  }
  return [max_dihedral_a, max_dihedral_angle];
}

/** The a-b-c-d torsion with its sign, in degrees, as _get_most_dihedral reads it before taking its size. */
function signedTorsion(a: Atom, b: Atom, c: Atom, d: Atom, clamp: boolean): number {
  const vcb = sub(c.xyz, b.xyz);
  const pvac = cross(sub(a.xyz, b.xyz), vcb);
  const pvbd = cross(sub(d.xyz, c.xyz), vcb);
  let angle = acosOf(dot(pvac, pvbd) / (norm(pvac) * norm(pvbd)), clamp);
  if (dot(pvac, cross(pvbd, vcb)) < 0) angle = -angle;
  return rad2deg(angle);
}

/**
 * [Meno departure: signedTorsion] Of `bs`, the one whose b-c-d torsion is
 * nearest `torsion` (degrees, either way round the circle); the first on a tie.
 */
function nearestTorsion(bs: readonly Atom[], b: Atom, c: Atom, d: Atom, torsion: number, clamp: boolean): [Atom, number] {
  let best = bs[0];
  let bestTurn = Infinity;
  let bestTorsion = 0;
  for (const x of bs) {
    const t = signedTorsion(x, b, c, d, clamp);
    const turn = Math.abs(((((t - torsion) % 360) + 540) % 360) - 180);
    if (turn < bestTurn) {
      best = x;
      bestTurn = turn;
      bestTorsion = t;
    }
  }
  return [best, Math.abs(bestTorsion)];
}

/**
 * _get_large (1004-1037): of atoms of one element, the one whose
 * surroundings, sphere by sphere, hold the most of the heaviest elements;
 * all those left where up to 16 spheres do not tell them apart.
 */
export function _get_large(atoms: readonly Atom[]): Atom[] {
  let trees: Set<Atom>[][] = atoms.map((_a) => [new Set([_a])]);
  for (let _ = 0; _ < 16; _++) {
    for (const tree of trees) {
      tree.push(new Set());
      for (const _a of tree[tree.length - 2]) for (const n of _a.bonds) last(tree).add(n);
    }
    let dup_atoms = new Set(last(trees[0]));
    for (const tree of trees) dup_atoms = new Set([...dup_atoms].filter((x) => last(tree).has(x)));
    for (const tree of trees) tree[tree.length - 1] = new Set([...last(tree)].filter((x) => !dup_atoms.has(x)));
    if (Math.max(...trees.map((tree) => last(tree).size)) === 0) return trees.map((tree) => [...tree[0]][0]);
    let symbol_idxs_dict = new Map<number, number[]>();
    const all_symbol_set = new Set<number>();
    trees.forEach((tree, idx) => {
      symbol_idxs_dict.set(
        idx,
        [...last(tree)].map((a) => symbolIndex(a.symbol)),
      );
      for (const s of symbol_idxs_dict.get(idx)!) all_symbol_set.add(s);
    });
    for (const s_idx of [...all_symbol_set].sort((p, q) => q - p)) {
      const symbol_idxs_counts = new Map<number, number>();
      for (const [idx, symbol_idxs] of symbol_idxs_dict) symbol_idxs_counts.set(idx, symbol_idxs.filter((s) => s === s_idx).length);
      const max_count = Math.max(...symbol_idxs_counts.values());
      const filtered = new Map<number, number[]>();
      for (const [idx, symbol_idxs] of symbol_idxs_dict) if (symbol_idxs_counts.get(idx) === max_count) filtered.set(idx, symbol_idxs);
      symbol_idxs_dict = filtered;
      if (symbol_idxs_dict.size === 1) return [...trees[[...symbol_idxs_dict.keys()][0]][0]];
    }
    trees = [...symbol_idxs_dict.keys()].map((idx) => trees[idx]);
  }
  return trees.map((tree) => [...tree[0]][0]);
}

/** _isproper_bonding (845-868): whether b may stand for a, given the pairs so far. */
export function _isproper_bonding(atom_a: Atom, atom_b: Atom, side_pairs: readonly Pair[]): boolean {
  const atom_a_bonds = atom_a.bonds;
  const atom_b_bonds = atom_b.bonds;
  // I swaped these two if sentence, but I not sure it was needed. (original comment)
  if (atom_a_bonds.filter((a) => a.symbol === "H").length !== atom_b_bonds.filter((a) => a.symbol === "H").length) return false;
  if (atom_a_bonds.length !== atom_b_bonds.length) return true;
  const a_side_pairs = side_pairs.map((_ab) => _ab[0]);
  const b_side_pairs = side_pairs.map((_ab) => _ab[1]);
  const a_index_list = atom_a_bonds.filter((_a) => a_side_pairs.includes(_a)).map((_a) => a_side_pairs.indexOf(_a)).sort((p, q) => p - q);
  const b_index_list = atom_b_bonds.filter((_a) => b_side_pairs.includes(_a)).map((_a) => b_side_pairs.indexOf(_a)).sort((p, q) => p - q);
  if (!eqList(a_index_list, b_index_list)) {
    // trap 1,2-migration to return True
    const a_diff_idx = setDiff(a_index_list, b_index_list);
    const b_diff_idx = setDiff(b_index_list, a_index_list);
    if (a_diff_idx.length === 1 && b_diff_idx.length === 1) {
      if (
        a_side_pairs[b_diff_idx[0]].bonds.includes(a_side_pairs[a_diff_idx[0]]) &&
        b_side_pairs[a_diff_idx[0]].bonds.includes(b_side_pairs[b_diff_idx[0]])
      )
        return true;
    }
    return false;
  }
  return true;
}

/**
 * [Meno departure: firstOfGroupByGeometry] Of `bs`, the one nearest `a` once
 * b's structure is laid over a's: by the pairs so far within the two root
 * atoms' own molecules, where at least three of them span a plane (the best
 * rotation, as _kabsch finds it), else by the root pair's atoms set on one
 * another. The first of equals.
 */
export function nearestOver(
  a: Atom,
  bs: readonly Atom[],
  assigned_as: readonly Atom[],
  assigned_bs: readonly Atom[],
  root_pair: Pair,
  onTie: () => void = () => {},
): Atom {
  // (only pairs in the root's own molecule on each side: molecules apart stand where they were set, not where they react)
  const inA = moleculeOf(root_pair[0]);
  const inB = moleculeOf(root_pair[1]);
  const kept = assigned_as.map((_, i) => i).filter((i) => inA.has(assigned_as[i]) && inB.has(assigned_bs[i]));
  const fitted = kabschFit(
    kept.map((i) => assigned_as[i].xyz),
    kept.map((i) => assigned_bs[i].xyz),
  );
  const fit = fitted?.r ? { r: fitted.r, refMean: fitted.refMean, tarMean: fitted.tarMean } : null;
  // (whether the pairs span a plane, and which is nearest, are where the pairs' order - rounding with it - could tip them)
  if (fitted?.borderline) onTie();
  const place = (p: readonly number[]): V3 => {
    if (fit) {
      const q = sub(p, fit.tarMean);
      return [0, 1, 2].map((j) => q[0] * fit.r[0][j] + q[1] * fit.r[1][j] + q[2] * fit.r[2][j] + fit.refMean[j]) as V3;
    }
    const shift = sub(root_pair[0].xyz, root_pair[1].xyz);
    return [p[0] + shift[0], p[1] + shift[1], p[2] + shift[2]];
  };
  let best = bs[0];
  let bestD = Infinity;
  const ds: number[] = [];
  for (const b of bs) {
    const d = norm(sub(place(b.xyz), a.xyz));
    ds.push(d);
    if (d < bestD) {
      best = b;
      bestD = d;
    }
  }
  if (fit && ds.filter((d) => near(d, bestD)).length > 1) onTie();
  return best;
}

/** The atoms bonded, directly or not, to `atom`, itself among them. */
function moleculeOf(atom: Atom): Set<Atom> {
  const seen = new Set<Atom>([atom]);
  const todo = [atom];
  while (todo.length) {
    for (const n of todo.pop()!.bonds) {
      if (seen.has(n)) continue;
      seen.add(n);
      todo.push(n);
    }
  }
  return seen;
}

/** The rotation _kabsch finds, with the two centroids - none where the points do not span a plane. */
function kabschFit(
  refXyzs: readonly (readonly number[])[],
  tarXyzs: readonly (readonly number[])[],
): { r: number[][] | null; refMean: V3; tarMean: V3; borderline: boolean } | null {
  const n = refXyzs.length;
  if (n < 3) return null;
  const mean = (xs: readonly (readonly number[])[]): V3 => {
    const m: V3 = [0, 0, 0];
    for (const x of xs) for (let k = 0; k < 3; k++) m[k] += x[k];
    return [m[0] / n, m[1] / n, m[2] / n];
  };
  const refMean = mean(refXyzs);
  const tarMean = mean(tarXyzs);
  const ref = refXyzs.map((p) => sub(p, refMean));
  const tar = tarXyzs.map((p) => sub(p, tarMean));
  const h = [0, 1, 2].map((i) => [0, 1, 2].map((j) => tar.reduce((acc, t, k) => acc + t[i] * ref[k][j], 0)));
  const { u, s, vt } = svd3(h);
  const borderline = near(s[1], s[0] * 1e-6);
  if (s[1] <= s[0] * 1e-6) return { r: null, refMean, tarMean, borderline };
  if (det3(u) * det3(vt) < 0.0) for (let i = 0; i < 3; i++) u[i][2] = -u[i][2];
  const r = [0, 1, 2].map((i) => [0, 1, 2].map((j) => u[i][0] * vt[0][j] + u[i][1] * vt[1][j] + u[i][2] * vt[2][j]));
  return { r, refMean, tarMean, borderline };
}

/**
 * _get_maps (748-1254): the maps of atoms_a onto atoms_b - each a list of
 * (a, b) pairs. `known_pairs` are atom numbers at the top call, pairs of
 * atoms in the recursion (as in the original, which reads both through
 * Atoms.get).
 */
export function _get_maps(
  atoms_a: Atoms,
  atoms_b: Atoms,
  known_pairs: readonly (readonly [number | Atom, number | Atom])[] = [],
  terminal_first: boolean | null = null,
  _recursion_counter = 0,
  trace?: MapperTrace,
  dep: Departures = ACCEL_EXACT,
  ctx?: ReuseContext,
): Chain[] {
  const c: ReuseContext = ctx ?? { memo: new Map(), frames: [] };
  // (a recursive call's maps, its known pairs stripped, are those of the same pairs in any order - unless a
  // choice on the way was a tie that the pairs' order, or rounding with it, could tip: then made afresh)
  const reuse = trace?.reuse !== false && _recursion_counter !== 0;
  const key = reuse ? pairSetKey(known_pairs as readonly Pair[]) : "";
  if (reuse) {
    const hit = c.memo.get(key);
    if (hit) return hit;
  }
  c.frames.push(false);
  let fragile = false;
  try {
    let ret = getMapsCall(atoms_a, atoms_b, known_pairs, terminal_first, _recursion_counter, trace, dep, c);
    // [Meno departure: spectatorsRefined] the top call's maps, their like molecules given the least total RMSD
    if (_recursion_counter === 0 && dep.spectatorsByRmsd && dep.spectatorsRefined && c.spectators?.length) {
      const refined = new Map<string, Chain>();
      // (maps alike but for the like molecules end alike: the first of them refined, the rest given its pairing)
      const held = new Set(c.spectators.flatMap((k) => [...k]));
      const byRest = new Map<string, Map<Atom, Atom>>();
      for (const chain of ret) {
        const rest = chainKey(chain.filter((pr) => !held.has(pr[0])));
        const done = byRest.get(rest);
        let r: Chain;
        if (done && chain.every((pr) => !held.has(pr[0]) || done.has(pr[0]))) r = chain.map((pr) => (held.has(pr[0]) ? [pr[0], done.get(pr[0])!] : pr));
        else {
          r = refinedSpectators(chain, c.spectators);
          byRest.set(rest, new Map(r.filter((pr) => held.has(pr[0])).map((pr) => [pr[0], pr[1]])));
        }
        const k = chainKey(r);
        if (!refined.has(k)) refined.set(k, r);
      }
      ret = [...refined.values()];
    }
    fragile = c.frames[c.frames.length - 1];
    if (reuse && !fragile) c.memo.set(key, ret);
    return ret;
  } finally {
    c.frames.pop();
    if (fragile && c.frames.length) c.frames[c.frames.length - 1] = true;
  }
}

/**
 * Reusing recursive _get_maps calls (Meno's, for speed - the maps are the
 * same): each call's maps by the set of its known pairs, kept where nothing
 * on the way was a tie the pairs' order could tip; and, for the calls under
 * way, whether one was.
 */
export type ReuseContext = { memo: Map<string, Chain[]>; frames: boolean[]; spectators?: Set<Atom>[] };

/** A set of pairs as a key: their atoms' numbers, sorted. */
function pairSetKey(pairs: readonly Pair[]): string {
  return pairs
    .map((p) => `${p[0].number}:${p[1].number}`)
    .sort()
    .join(",");
}

/** Whether two values that decide a choice are so near that rounding, as the known pairs' order changes it, could swap them. */
const near = (x: number, y: number) => Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));

/** The most ways - permutations of a kind's molecules times their turns - that `refinedSpectators` tries every one of. */
export const SPECTATOR_WAYS_TRIED = 50_000;

/**
 * [Meno departure: spectatorsRefined] A map with its like molecules
 * (`kinds`) given to one another again, whole, for the least total RMSD
 * (_kabsch over every pair of the map, as total_rmsd is, modeler.py 1564):
 * - a kind with few enough molecules (SPECTATOR_WAYS_TRIED ways or fewer:
 *   five waters are 3 840) has every permutation of them tried, each
 *   molecule turned every way it can be, and the least kept - none of the
 *   permutations ACCeL tries one by one can be lower;
 * - then, for every kind, the two sides laid over one another by the map,
 *   each kind's molecules given those of the other at least cost (the
 *   Hungarian method), and laid over again, while that lowers the total.
 * A molecule turns only as a rigid body can (`properIsomorphisms`). Nothing
 * is taken that is not lower, so the map ends no worse than it began. The
 * pairs keep their places in the map: only the like molecules' atoms on
 * the product side change.
 */
export function refinedSpectators(chain: Chain, kinds: readonly Set<Atom>[]): Chain {
  let map: Chain = chain.slice();
  const at = new Map<Atom, number>();
  map.forEach((p, i) => at.set(p[0], i));
  const total = (m: Chain) =>
    kabsch(
      m.map((p) => p[0].xyz),
      m.map((p) => p[1].xyz),
    );
  type Setup = { ua: Atom[][]; ub: Atom[][]; ways: Atom[][][][] };
  const setups: Setup[] = [];
  for (const kind of kinds) {
    const ua = moleculesIn(kind, (a) => at.has(a));
    const onB = new Set(map.map((p) => p[1]));
    const ub = moleculesIn(kind, (b) => onB.has(b));
    if (ua.length !== ub.length || ua.length < 2) continue;
    // (only where the kind's molecules are paired among themselves: every partner of theirs one of the other side's)
    const partners = new Set(ua.flat().map((x) => map[at.get(x)!][1]));
    if (partners.size !== ub.flat().length || !ub.flat().every((b) => partners.has(b))) continue;
    // (each molecule turned only as it can be turned: of the ways its graph allows, those that fit it as a rigid
    // body as well as the best does - not a mirror image of a methyl, which no turn makes)
    setups.push({ ua, ub, ways: ua.map((u) => ub.map((v) => properIsomorphisms(u, v))) });
  }
  const assigned = (m: Chain, k: Setup, turns: readonly Atom[][]): Chain => {
    const next = m.slice();
    k.ua.forEach((u, i) => u.forEach((a, j) => (next[at.get(a)!] = [a, turns[i][j]])));
    return next;
  };
  let best = total(map);
  // every permutation and turn, where there are few enough - scored cheaply: the like molecules only change
  // which product atom stands for which, so neither side's centroid moves, and the best rotation's fit is the
  // sum of the singular values of the covariance (its smallest taken off where they would mirror), which is
  // the solute's covariance plus each molecule pair's own; the best by that is checked by _kabsch itself
  for (const k of setups) {
    const n = k.ua.length;
    let ways = 1;
    for (let i = 1; i <= n && ways <= SPECTATOR_WAYS_TRIED; i++) ways *= i * Math.max(...k.ways[i - 1].map((w) => w.length));
    if (ways > SPECTATOR_WAYS_TRIED) continue;
    const ca = centroidOf(map.map((p) => p[0]));
    const cb = centroidOf(map.map((p) => p[1]));
    const inKind = new Set(k.ua.flat());
    const covOf = (pairs: [Atom, Atom][]) => {
      const h = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (const [a, b] of pairs) {
        const ra = [a.x - ca[0], a.y - ca[1], a.z - ca[2]];
        const rb = [b.x - cb[0], b.y - cb[1], b.z - cb[2]];
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) h[3 * i + j] += rb[i] * ra[j];
      }
      return h;
    };
    const fixed = covOf(map.filter((p) => !inKind.has(p[0])) as [Atom, Atom][]);
    const part = k.ua.map((u, i) => k.ub.map((_, j) => k.ways[i][j].map((iso) => covOf(u.map((a, q) => [a, iso[q]] as [Atom, Atom])))));
    // (the largest eigenvalue of the quaternion matrix - Horn's, as Theobald's QCP finds it by Newton's method
    // from above: no larger than half the two sides' summed squares)
    let start = 0;
    for (const p of map) {
      start += (p[0].x - ca[0]) ** 2 + (p[0].y - ca[1]) ** 2 + (p[0].z - ca[2]) ** 2;
      start += (p[1].x - cb[0]) ** 2 + (p[1].y - cb[1]) ** 2 + (p[1].z - cb[2]) ** 2;
    }
    start /= 2;
    const fitOf = (h: number[]) => largestFit(h, start);
    const used = new Array(n).fill(false);
    const turns: Atom[][] = [];
    let bestFit = -Infinity;
    let bestTurns: Atom[][] | null = null;
    // (one covariance a depth, filled in place)
    const stack = Array.from({ length: n + 1 }, () => new Array<number>(9).fill(0));
    const go = (i: number, h: number[]) => {
      if (i === n) {
        const f = fitOf(h);
        if (f > bestFit + 1e-12) {
          bestFit = f;
          bestTurns = turns.slice();
        }
        return;
      }
      for (let j = 0; j < n; j++) {
        if (used[j]) continue;
        used[j] = true;
        k.ways[i][j].forEach((iso, o) => {
          const add = part[i][j][o];
          const into = stack[i + 1];
          for (let q = 0; q < 9; q++) into[q] = h[q] + add[q];
          turns.push(iso);
          go(i + 1, into);
          turns.pop();
        });
        used[j] = false;
      }
    };
    go(0, fixed);
    if (bestTurns) {
      // (the map's own pairing is where it starts: one no lower is not taken)
      const next = assigned(map, k, bestTurns);
      const t = total(next);
      if (t < best - 1e-12) {
        best = t;
        map = next;
      }
    }
  }
  // then laid over and paired again, while that lowers the total
  for (let round = 0; round < 100 && setups.length; round++) {
    const fit = kabschFit(
      map.map((p) => p[0].xyz),
      map.map((p) => p[1].xyz),
    );
    if (!fit?.r) break;
    const r = fit.r;
    const placed = (b: Atom): V3 => {
      const q = sub(b.xyz, fit.tarMean);
      return [0, 1, 2].map((j) => q[0] * r[0][j] + q[1] * r[1][j] + q[2] * r[2][j] + fit.refMean[j]) as V3;
    };
    const apart = (u: readonly Atom[], iso: readonly Atom[]) => {
      let d = 0;
      u.forEach((a, k) => {
        const pb = placed(iso[k]);
        d += (a.x - pb[0]) ** 2 + (a.y - pb[1]) ** 2 + (a.z - pb[2]) ** 2;
      });
      return d;
    };
    let next = map;
    for (const k of setups) {
      const nearest = k.ua.map((u, i) => k.ub.map((_, j) => k.ways[i][j].reduce((b, iso) => (apart(u, iso) < apart(u, b) ? iso : b), k.ways[i][j][0])));
      const cost = k.ua.map((u, i) => k.ub.map((_, j) => apart(u, nearest[i][j])));
      const assign = hungarian(cost);
      next = assigned(
        next,
        k,
        k.ua.map((_, i) => nearest[i][assign[i]]),
      );
    }
    const t = total(next);
    if (!(t < best - 1e-12)) break;
    best = t;
    map = next;
  }
  return map;
}

/**
 * The largest eigenvalue of Horn's quaternion matrix for a covariance `h`
 * (row-major, h[3i+j] = sum of b_i a_j): the sum of its singular values,
 * the smallest taken off where they would mirror - what the best rotation
 * makes of the covariance. Found by Newton's method on the characteristic
 * polynomial from `above`, which no eigenvalue exceeds (Theobald, Acta
 * Cryst. A 61, 478 (2005)).
 */
function largestFit(h: readonly number[], above: number): number {
  const [xx, xy, xz, yx, yy, yz, zx, zy, zz] = h;
  const k = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ];
  let c2 = 0;
  for (const x of h) c2 -= 2 * x * x;
  const c1 = -8 * (xx * (yy * zz - yz * zy) - xy * (yx * zz - yz * zx) + xz * (yx * zy - yy * zx));
  const det4 = (m: number[][]) => {
    const d3 = (a: number[][]) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
    let d = 0;
    for (let c = 0; c < 4; c++) {
      const minor = [1, 2, 3].map((r) => m[r].filter((_, j) => j !== c));
      d += (c % 2 ? -1 : 1) * m[0][c] * d3(minor);
    }
    return d;
  };
  const c0 = det4(k);
  let l = above;
  for (let i = 0; i < 50; i++) {
    const l2 = l * l;
    const p = l2 * l2 + c2 * l2 + c1 * l + c0;
    const dp = 4 * l2 * l + 2 * c2 * l + c1;
    if (dp === 0) break;
    const step = p / dp;
    l -= step;
    if (Math.abs(step) <= 1e-12 * Math.max(1, Math.abs(l))) break;
  }
  return l;
}

/** The mean place of atoms. */
function centroidOf(atoms: readonly Atom[]): V3 {
  const c: V3 = [0, 0, 0];
  for (const a of atoms) {
    c[0] += a.x;
    c[1] += a.y;
    c[2] += a.z;
  }
  return [c[0] / atoms.length, c[1] / atoms.length, c[2] / atoms.length];
}

/** The molecules of `kind` whose atoms `take` keeps, each as its atoms in index order. */
function moleculesIn(kind: Set<Atom>, take: (a: Atom) => boolean): Atom[][] {
  const seen = new Set<Atom>();
  const out: Atom[][] = [];
  for (const a of [...kind].sort((p, q) => p.number - q.number)) {
    if (seen.has(a) || !take(a)) continue;
    const mol = [...moleculeOf(a)].sort((p, q) => p.number - q.number);
    for (const x of mol) seen.add(x);
    out.push(mol);
  }
  return out.filter((m) => m.every(take));
}

/** Of the ways `u`'s atoms can stand for `v`'s, those whose rigid fit (Kabsch RMSD of the molecule alone) is within 0.1 Å of the best one's. */
function properIsomorphisms(u: readonly Atom[], v: readonly Atom[]): Atom[][] {
  const all = isomorphisms(u, v);
  if (all.length <= 1 || u.length < 3) return all;
  const fits = all.map((iso) =>
    kabsch(
      u.map((a) => a.xyz),
      iso.map((b) => b.xyz),
    ),
  );
  const best = Math.min(...fits);
  return all.filter((_, i) => fits[i] <= best + 0.1);
}

/** Every way the atoms of molecule `u` can stand for those of `v`, element for element and bond for bond (at most 720). */
function isomorphisms(u: readonly Atom[], v: readonly Atom[]): Atom[][] {
  const out: Atom[][] = [];
  if (u.length !== v.length) return out;
  const bondsIn = (m: readonly Atom[]) => m.map((a) => new Set(a.bonds));
  const ub = bondsIn(u);
  const vb = bondsIn(v);
  const pick: Atom[] = [];
  const used = new Set<Atom>();
  const go = (k: number) => {
    if (out.length >= 720) return;
    if (k === u.length) {
      out.push(pick.slice());
      return;
    }
    for (let j = 0; j < v.length; j++) {
      const c = v[j];
      if (used.has(c) || c.symbol !== u[k].symbol || ub[k].size !== vb[j].size) continue;
      let ok = true;
      for (let i = 0; i < k && ok; i++) ok = ub[k].has(u[i]) === vb[j].has(pick[i]);
      if (!ok) continue;
      pick.push(c);
      used.add(c);
      go(k + 1);
      pick.pop();
      used.delete(c);
    }
  };
  go(0);
  return out;
}

/** The least-cost assignment of rows to columns of a square matrix (the Hungarian method): each row's column. */
export function hungarian(cost: readonly (readonly number[])[]): number[] {
  const n = cost.length;
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0);
  const way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const rowTo = new Array(n).fill(0);
  for (let j = 1; j <= n; j++) if (p[j]) rowTo[p[j] - 1] = j - 1;
  return rowTo;
}

/** How many like molecules standing apart, of one kind, on each side, make a solvent placed by RMSD (`spectatorsByRmsd`): as many as ACCeL's own placement asks before it places any (modeler.py 1162). */
export const SPECTATORS_AT_LEAST = 4;

/**
 * [Meno departure: spectatorsByRmsd] The kinds of like molecules standing
 * apart, as many of each on either side, SPECTATORS_AT_LEAST or more: each
 * kind's atoms on both sides, the kinds in the order their first atoms
 * stand among atoms_a's. A molecule's kind is its graph: its atoms'
 * elements, and what each is bonded to, refined until nothing more tells
 * them apart.
 */
export function spectatorKinds(atoms_a: Atoms, atoms_b: Atoms): Set<Atom>[] {
  const molecules = (atoms: Atoms) => {
    const seen = new Set<Atom>();
    const out: { atoms: Atom[]; kind: string }[] = [];
    for (const a of atoms) {
      if (seen.has(a)) continue;
      const mol = [...moleculeOf(a)];
      for (const x of mol) seen.add(x);
      out.push({ atoms: mol, kind: graphKind(mol) });
    }
    return out;
  };
  const ma = molecules(atoms_a);
  const mb = molecules(atoms_b);
  const count = (ms: { kind: string }[], kind: string) => ms.filter((m) => m.kind === kind).length;
  const kinds: Set<Atom>[] = [];
  const done = new Set<string>();
  for (const m of ma) {
    if (done.has(m.kind)) continue;
    done.add(m.kind);
    const n = count(ma, m.kind);
    if (n < SPECTATORS_AT_LEAST || n !== count(mb, m.kind)) continue;
    kinds.push(new Set([...ma, ...mb].filter((x) => x.kind === m.kind).flatMap((x) => x.atoms)));
  }
  return kinds;
}

/** A molecule's graph as a string: the same for like molecules, whatever their atoms' order (colour refinement over elements and bonds). */
function graphKind(mol: readonly Atom[]): string {
  let label = new Map(mol.map((a) => [a, a.symbol]));
  let classes = new Set(label.values()).size;
  for (let round = 0; round < mol.length; round++) {
    const sig = new Map(mol.map((a) => [a, `${label.get(a)}(${a.bonds.map((b) => label.get(b)).sort().join(",")})`]));
    // (each signature renamed by its place among the molecule's sorted signatures, to keep them short)
    const names = [...new Set(sig.values())].sort();
    label = new Map(mol.map((a) => [a, `${names.indexOf(sig.get(a)!)}`]));
    const now = names.length;
    if (now === classes) {
      label = sig;
      break;
    }
    classes = now;
    label = new Map(mol.map((a) => [a, `${a.symbol}${names.indexOf(sig.get(a)!)}`]));
  }
  return [...label.values()].sort().join(";");
}

/** One _get_maps call, as modeler.py 748-1254 has it (`_get_maps` above answers it from an earlier one where it can). */
function getMapsCall(
  atoms_a: Atoms,
  atoms_b: Atoms,
  known_pairs: readonly (readonly [number | Atom, number | Atom])[],
  terminal_first: boolean | null,
  _recursion_counter: number,
  trace: MapperTrace | undefined,
  dep: Departures,
  ctx: ReuseContext,
): Chain[] {
  /** A choice on the way was a tie the known pairs' order could tip: this call's maps are not reused. */
  const tie = () => {
    ctx.frames[ctx.frames.length - 1] = true;
  };
  // 755-768
  const initial_pairs: Pair[] = [];
  if (terminal_first === null && atoms_a.length > 256) terminal_first = true;
  const given_known_as_ = known_pairs.map((pr) => atoms_a.get(pr[0]));
  const given_known_bs_ = known_pairs.map((pr) => atoms_b.get(pr[1]));
  if (given_known_as_.includes(null) || given_known_bs_.includes(null)) return [];
  const given_known_as = given_known_as_ as Atom[];
  const given_known_bs = given_known_bs_ as Atom[];
  // (`in` and `.index()` on the known atoms, as maps: the first place of each, as list.index gives)
  const knownPosA = firstPlaces(given_known_as);
  const knownPosB = firstPlaces(given_known_bs);

  // 770-790: the stages of initial-pair criteria, in order
  const ip_settings: boolean[][] = [
    [true, false, true, true, false, false],
    [false, true, true, true, false, false],
    [false, false, true, true, false, false],
    [false, false, false, true, true, false],
    [false, false, false, true, false, true],
    [false, false, false, true, false, false],
    [false, false, false, false, true, false],
    [false, false, false, false, false, true],
    [false, false, false, false, false, false],
  ];
  if (known_pairs.length === 0) ip_settings.splice(3, 1);
  if (_recursion_counter === 0 && known_pairs.length !== 0) {
    ip_settings.splice(2, 1);
    ip_settings.splice(1, 1);
  }
  if (!terminal_first) ip_settings.splice(0, 1);

  // [Meno departure: spectatorsByRmsd] like molecules standing apart held back: every kind at first, then
  // all but the first, and so on - the first stage that gives any initial pair is the one taken
  const kinds = dep.spectatorsByRmsd ? (ctx.spectators ??= spectatorKinds(atoms_a, atoms_b)) : [];
  for (let stage = 0; stage <= kinds.length && initial_pairs.length === 0; stage++) {
    const held = new Set<Atom>();
    for (const kind of kinds.slice(stage)) for (const a of kind) held.add(a);
    pairsWithout(held);
  }
  // 792-843
  function pairsWithout(held: Set<Atom>) {
  for (const ip_setting of ip_settings) {
    if (initial_pairs.length !== 0) break;
    const ip_terminal_first_check = ip_setting[0];
    const ip_check_hs = ip_setting[1];
    const ip_exclude_h = ip_setting[2];
    const ip_check_symbol = ip_setting[3];
    const ip_known_bond_check = ip_setting[4];
    const ip_isolated_check = ip_setting[5];

    let appended_known_idxs: number[] | null = null;
    let known_a_idxs: number[] = [];
    for (const atom_a of atoms_a) {
      if (knownPosA.has(atom_a)) continue;
      if (held.has(atom_a)) continue;
      if (ip_exclude_h && atom_a.symbol === "H") continue;
      const atom_a_bonds = atom_a.bonds;
      if (ip_known_bond_check) {
        known_a_idxs = atom_a_bonds.filter((_a) => knownPosA.has(_a)).map((_a) => knownPosA.get(_a)!).sort((p, q) => p - q);
        if (known_a_idxs.length === 0) continue;
      }
      for (const atom_b of atoms_b) {
        if (knownPosB.has(atom_b)) continue;
        if (held.has(atom_b)) continue;
        if (ip_exclude_h && atom_b.symbol === "H") continue;
        if (ip_check_symbol && atom_a.symbol !== atom_b.symbol) continue;
        const atom_b_bonds = atom_b.bonds;
        if (
          ip_terminal_first_check &&
          terminal_first &&
          atom_a_bonds.length - atom_a.near().hs > 1 &&
          atom_b_bonds.length - atom_b.near().hs > 1
        )
          continue;
        if (ip_check_hs && atom_a.near().hs !== atom_b.near().hs)
          continue;
        if (ip_isolated_check && !(atom_a_bonds.length === 0 && atom_b_bonds.length === 0)) continue;
        if (ip_known_bond_check) {
          const known_b_idxs = atom_b_bonds.filter((_b) => knownPosB.has(_b)).map((_b) => knownPosB.get(_b)!).sort((p, q) => p - q);
          if (known_b_idxs.length === 0) continue;
          if (!eqList(known_a_idxs, known_b_idxs)) continue;
          if (!(appended_known_idxs === null || eqList(appended_known_idxs, known_a_idxs))) continue;
          appended_known_idxs = known_a_idxs;
        }
        initial_pairs.push([atom_a, atom_b]);
      }
    }
  }
  }

  // 870-898: from each initial pair, every longest chain of bonded heavy-atom pairs, depth first
  let initial_chains: Chain[] = [[]];
  for (const initial_pair of initial_pairs) {
    const stack: Chain[] = [[initial_pair]];
    while (stack.length) {
      const side_pairs = stack.pop()!;
      if (side_pairs.length > last(initial_chains).length) initial_chains = [side_pairs];
      else if (side_pairs.length === last(initial_chains).length) initial_chains.push(side_pairs);
      const a_list = side_pairs.map((pr) => pr[0]);
      const b_list = side_pairs.map((pr) => pr[1]);
      for (const next_a of last(side_pairs)[0].bonds) {
        if (next_a.symbol === "H" || a_list.includes(next_a)) continue;
        if (knownPosA.has(next_a)) continue;
        for (const next_b of last(side_pairs)[1].bonds) {
          if (next_b.symbol === "H" || b_list.includes(next_b)) continue;
          if (next_a.symbol !== next_b.symbol) continue;
          if (knownPosB.has(next_b)) continue;
          if (!_isproper_bonding(next_a, next_b, side_pairs)) continue;
          stack.push([...side_pairs, [next_a, next_b]]);
        }
      }
    }
  }

  // 900-901
  if (initial_chains.length === 1 && initial_chains[0].length === 0) {
    trace?.getMaps?.({
      _recursion_counter,
      known_pairs: known_pairs as Chain,
      initial_pairs,
      initial_chains,
      canonical_initial_chains: [],
      h_matched_canonical_initial_chains: [],
      extended_chains: [],
      canonical_extended_chains: [],
      extracted_canonical_extended_chains: [],
      recursive_extended_chains: [],
      return: [],
    });
    return [];
  }

  // 903-906: one chain per set of pairs (the last one found, where it first was)
  const canonical_initial_chains = new Map<string, Chain>();
  for (const chain of initial_chains) canonical_initial_chains.set(chainKey(chain), chain);

  // 908-921: the H-count preference - the chains with fewest pairs whose hydrogens differ in number
  let min_invalid: number | null = null;
  let h_matched_canonical_initial_chains: Chain[] = [[]];
  for (const chain of canonical_initial_chains.values()) {
    let invalid_atoms = 0;
    for (const pair of chain) {
      const hs_of_a = pair[0].bonds.filter((a_) => a_.symbol === "H");
      const hs_of_b = pair[1].bonds.filter((b_) => b_.symbol === "H");
      if (hs_of_a.length !== hs_of_b.length) invalid_atoms += 1;
    }
    if (min_invalid === null || min_invalid > invalid_atoms) {
      h_matched_canonical_initial_chains = [chain];
      min_invalid = invalid_atoms;
    } else if (min_invalid === invalid_atoms) {
      h_matched_canonical_initial_chains.push(chain);
    }
  }

  // 923-943: 4 to 8 single-pair chains - the largest combinations of them with no atom twice
  if (
    4 <= h_matched_canonical_initial_chains.length &&
    h_matched_canonical_initial_chains.length <= 8 &&
    Math.max(...h_matched_canonical_initial_chains.map((chain) => chain.length)) === 1
  ) {
    const sole_chains = h_matched_canonical_initial_chains.map((chain) => chain[0]);
    const max_combs: Chain[] = [];
    for (let length = sole_chains.length; length >= 1; length--) {
      for (const comb of combinations(sole_chains, length)) {
        if (new Set(comb.map((cb) => cb[0])).size !== length) continue;
        if (new Set(comb.map((cb) => cb[1])).size !== length) continue;
        max_combs.push([...comb]);
      }
      if (max_combs.length !== 0) break;
    }
    if (max_combs.length !== 0) h_matched_canonical_initial_chains = max_combs;
  }

  // 989-1141: each chain extended over every atom it can reach, hydrogens included, by geometry where needed
  const extended_chains: Chain[] = [];
  for (const chain of h_matched_canonical_initial_chains) {
    const stack: Pair[] = chain.map((pr) => pr);
    if (_recursion_counter === 0 && known_pairs.length !== 0) {
      // deque.extendleft(zip(...)): each in turn to the left, so in reverse
      given_known_as.forEach((ka, i) => stack.unshift([ka, given_known_bs[i]]));
    }
    const assigned_as: Atom[] = [...given_known_as, ...chain.map((pr) => pr[0])];
    const assigned_bs: Atom[] = [...given_known_bs, ...chain.map((pr) => pr[1])];
    // (`in` and `.index()` on them, as maps kept with them)
    const posA = firstPlaces(assigned_as);
    const posB = firstPlaces(assigned_bs);

    // 998-1002
    const _new_assign = (new_pair: Pair, root_pair: Pair) => {
      assigned_as.push(new_pair[0]);
      assigned_bs.push(new_pair[1]);
      if (!posA.has(new_pair[0])) posA.set(new_pair[0], assigned_as.length - 1);
      if (!posB.has(new_pair[1])) posB.set(new_pair[1], assigned_bs.length - 1);
      stack.push([new_pair[0], new_pair[1]]);
      stack.unshift(root_pair);
    };

    while (stack.length) {
      // 1039-1046
      const root_pair = stack.shift()!;
      const next_as = root_pair[0].bonds.filter((_a) => !posA.has(_a));
      const next_bs = root_pair[1].bonds.filter((_b) => !posB.has(_b));
      if (next_as.length === 0 || next_bs.length === 0) continue;
      const a_sbls = next_as.map((_a) => _a.symbol);
      const b_sbls = next_bs.map((_b) => _b.symbol);
      const count = (xs: string[], s: string) => xs.filter((x) => x === s).length;

      // 1048-1051: an element both sides have one of
      const mono_subs = a_sbls.filter((_s) => count(a_sbls, _s) === 1 && count(b_sbls, _s) === 1);
      if (mono_subs.length >= 1) {
        _new_assign([next_as[a_sbls.indexOf(mono_subs[0])], next_bs[b_sbls.indexOf(mono_subs[0])]], root_pair);
        continue;
      }

      // 1053-1099: three or more of one element
      const tri_subs = a_sbls.filter((_s) => count(a_sbls, _s) >= 3 && count(b_sbls, _s) >= 3);
      if (tri_subs.length >= 1) {
        const large_as = _get_large(next_as.filter((_a) => _a.symbol === tri_subs[0]));
        const large_bs = _get_large(next_bs.filter((_b) => _b.symbol === tri_subs[0]));
        if (large_as.length === 1 && large_bs.length === 1) {
          _new_assign([large_as[0], large_bs[0]], root_pair);
          continue;
        }
        const not_large_as = next_as.filter((a) => !large_as.includes(a));
        const not_large_bs = next_bs.filter((b) => !large_bs.includes(b));
        if (not_large_as.length === 1 && not_large_bs.length === 1) {
          if (not_large_as[0].symbol === not_large_bs[0].symbol) {
            _new_assign([not_large_as[0], not_large_bs[0]], root_pair);
            continue;
          }
        }
        const known_a1_idxs = root_pair[0].bonds.filter((a) => posA.has(a)).map((a) => posA.get(a)!);
        const known_b1_idxs = root_pair[1].bonds.filter((b) => posB.has(b)).map((b) => posB.get(b)!);
        const known_1idxs = pyIntSetAnd(known_a1_idxs, known_b1_idxs);
        if (known_1idxs.length === 0) {
          // [Meno departure: firstOfGroupByGeometry] the nearest, not the first by atom order
          _new_assign([large_as[0], dep.firstOfGroupByGeometry ? nearestOver(large_as[0], large_bs, assigned_as, assigned_bs, root_pair, tie) : large_bs[0]], root_pair);
          continue;
        }
        let pre_large_a = large_as[0];
        let pre_large_b = large_bs[0];
        let max_dihedral = 0.0;
        let any_torsion = false;
        // (which pairs reached which most: the known pairs' order decides only between those at the very most)
        const reached: [number, Atom, Atom][] = [];
        for (const known_1idx of known_1idxs) {
          const known_a2_idxs = assigned_as[known_1idx].bonds
            .filter((a) => posA.has(a) && a !== root_pair[0])
            .map((a) => posA.get(a)!);
          const known_b2_idxs = assigned_bs[known_1idx].bonds
            .filter((b) => posB.has(b) && b !== root_pair[1])
            .map((b) => posB.get(b)!);
          const known_2idxs = pyIntSetAnd(known_a2_idxs, known_b2_idxs);
          for (const known_2idx of known_2idxs) {
            any_torsion = true;
            const [pre_a, dihedral_a] = _get_most_dihedral(large_as, root_pair[0], assigned_as[known_1idx], assigned_as[known_2idx], dep.clampTorsionCosine);
            // [Meno departure: signedTorsion] the other side's nearest pre_a's torsion, sign and all
            const [pre_b, dihedral_b] = dep.signedTorsion
              ? nearestTorsion(
                  large_bs,
                  root_pair[1],
                  assigned_bs[known_1idx],
                  assigned_bs[known_2idx],
                  signedTorsion(pre_a, root_pair[0], assigned_as[known_1idx], assigned_as[known_2idx], dep.clampTorsionCosine),
                  dep.clampTorsionCosine,
                )
              : _get_most_dihedral(large_bs, root_pair[1], assigned_bs[known_1idx], assigned_bs[known_2idx], dep.clampTorsionCosine);
            reached.push([pyMax(dihedral_a, dihedral_b), pre_a, pre_b]);
            if (pyMax(dihedral_a, dihedral_b) >= max_dihedral) {
              max_dihedral = pyMax(dihedral_a, dihedral_b);
              pre_large_a = pre_a;
              pre_large_b = pre_b;
            }
          }
        }
        // [Meno departure: firstOfGroupByGeometry] no torsion to go by: the nearest, not the first by atom order
        if (!any_torsion && dep.firstOfGroupByGeometry) pre_large_b = nearestOver(large_as[0], large_bs, assigned_as, assigned_bs, root_pair, tie);
        {
          const top = reached.filter((r) => r[0] === max_dihedral);
          if (top.some((r) => r[1] !== top[0][1] || r[2] !== top[0][2])) tie();
        }
        _new_assign([pre_large_a, pre_large_b], root_pair);
        continue;
      }

      // 1101-1139: two of one element - by the larger, else by chirality or E/Z
      const di_subs = a_sbls.filter((_s) => Math.min(count(a_sbls, _s), count(b_sbls, _s)) === 2);
      if (di_subs.length >= 1) {
        const large_as = _get_large(next_as.filter((_a) => _a.symbol === di_subs[0]));
        const large_bs = _get_large(next_bs.filter((_b) => _b.symbol === di_subs[0]));
        if (large_as.length === 1 && large_bs.length === 1) {
          _new_assign([large_as[0], large_bs[0]], root_pair);
          continue;
        }
        if (large_as.length === 1 || large_bs.length === 1) continue;
        if (root_pair[0].bonds.length !== root_pair[1].bonds.length) {
          // I'm not sure if this block is needed. (original comment)
          continue;
        }
        const known_as = root_pair[0].bonds.filter((_a) => posA.has(_a));
        const corre_bs = known_as.map((_a) => assigned_bs[posA.get(_a)!]);
        const known_bs = root_pair[1].bonds.filter((_b) => posB.has(_b));
        if (known_as.length === 2 && known_bs.length === 2) {
          const flag_a = _det_chirality(known_as[0], known_as[1], large_as[0], large_as[1]);
          const flag_b = _det_chirality(corre_bs[0], corre_bs[1], large_bs[0], large_bs[1]);
          if (flag_a === flag_b) _new_assign([large_as[0], large_bs[0]], root_pair);
          else _new_assign([large_as[0], large_bs[1]], root_pair);
          continue;
        }
        if (known_as.length === 1 && known_bs.length === 1) {
          let two_bond_pair: Pair | null = null;
          for (const _a of known_as[0].bonds.filter((x) => posA.has(x) && x !== root_pair[0])) {
            for (const _b of corre_bs[0].bonds.filter((x) => posB.has(x) && x !== root_pair[1])) {
              if (posA.get(_a)! === posB.get(_b)!) {
                two_bond_pair = [_a, _b];
                break;
              }
            }
          }
          if (two_bond_pair === null) continue;
          const flag_a = _det_ez(two_bond_pair[0], known_as[0], root_pair[0], large_as[0], dep.clampEzCosine);
          const flag_b = _det_ez(two_bond_pair[1], corre_bs[0], root_pair[1], large_bs[0], dep.clampEzCosine);
          if (flag_a === flag_b) _new_assign([large_as[0], large_bs[0]], root_pair);
          else _new_assign([large_as[0], large_bs[1]], root_pair);
          continue;
        }
      }
    }
    extended_chains.push(assigned_as.map((_a, i) => [_a, assigned_bs[i]] as Pair));
  }

  // 1143-1146
  const canonical_extended_chains = new Map<string, Chain>();
  for (const chain of extended_chains) canonical_extended_chains.set(chainKey(chain), chain);

  // 1151-1159: only those that place the most heavy atoms
  let extracted_canonical_extended_chains: Chain[] = [];
  const heavyCount = (chain: Chain) => chain.filter((pr) => pr[0].symbol !== "H").length;
  const max_h_len = Math.max(...[...canonical_extended_chains.values()].map(heavyCount));
  for (const chain of canonical_extended_chains.values()) {
    if (max_h_len > heavyCount(chain)) continue;
    extracted_canonical_extended_chains.push(chain);
  }

  // 1161-1228: four or more isolated molecules left to place - one at a time, by RMSD (water's hydrogens too)
  let appended_ecec: Chain[] = extracted_canonical_extended_chains.map((ecec) => ecec.slice(known_pairs.length));
  while (known_pairs.length !== 0 && appended_ecec.length >= 4 && new Set(appended_ecec.map((ecec) => ecec.length)).size === 1) {
    const unitKey = (atoms: Atom[]) =>
      pySorted(atoms, (a) => a.number)
        .map((a) => a.number)
        .join(",");
    const unit_bs = new Set(appended_ecec.map((pl) => unitKey(pl.map((p) => p[1]))));
    if (unit_bs.size === 1) break;
    const unit_as = new Set(appended_ecec.map((pl) => unitKey(pl.map((p) => p[0]))));
    if (unit_as.size === 1) break;

    let is_isolated = true;
    // all_unit = unit_as | unit_bs: whether any unit touches a known atom (any order gives the same answer)
    const unitsA = new Map<string, Atom[]>();
    const unitsB = new Map<string, Atom[]>();
    for (const pl of appended_ecec) {
      unitsA.set(unitKey(pl.map((p) => p[0])), pl.map((p) => p[0]));
      unitsB.set(unitKey(pl.map((p) => p[1])), pl.map((p) => p[1]));
    }
    const known_all = [...given_known_as, ...given_known_bs];
    for (const unit of [...unitsA.values(), ...unitsB.values()]) {
      const unit_bonding_atoms: Atom[] = [];
      for (const a of unit) unit_bonding_atoms.push(...a.bonds);
      if (unit_bonding_atoms.some((a) => known_all.includes(a))) {
        is_isolated = false;
        break;
      }
    }
    if (!is_isolated) break;

    const total_ecec: Pair[] = given_known_as.map((ka, i) => [ka, given_known_bs[i]] as Pair);
    while (appended_ecec.length) {
      const ecec_rmsds: number[] = [];
      for (const ecec of appended_ecec) {
        const tested_ecec = [...total_ecec, ...ecec];
        ecec_rmsds.push(
          kabsch(
            tested_ecec.map((tpr) => tpr[0].xyz),
            tested_ecec.map((tpr) => tpr[1].xyz),
          ),
        );
      }
      let minIdx = 0;
      for (let i = 1; i < ecec_rmsds.length; i++) if (ecec_rmsds[i] < ecec_rmsds[minIdx]) minIdx = i;
      if (ecec_rmsds.some((r, i) => i !== minIdx && near(r, ecec_rmsds[minIdx]))) tie();
      const added_app_ecec = appended_ecec.splice(minIdx, 1)[0].slice();
      // 1192-1215: a water placed by its O alone - its two H by RMSD
      while (added_app_ecec.length === 1) {
        if (added_app_ecec[0][0].symbol !== "O") break;
        if (added_app_ecec[0][1].symbol !== "O") break;
        const hs_in_a = added_app_ecec[0][0].bonds;
        if (!eqList(hs_in_a.map((a) => a.symbol), ["H", "H"])) break;
        const hs_in_b = added_app_ecec[0][1].bonds;
        if (!eqList(hs_in_b.map((a) => a.symbol), ["H", "H"])) break;
        const potential_h2os: Chain[] = [
          [
            [hs_in_a[0], hs_in_b[0]],
            [hs_in_a[1], hs_in_b[1]],
          ],
          [
            [hs_in_a[0], hs_in_b[1]],
            [hs_in_a[1], hs_in_b[0]],
          ],
        ];
        const h2o_rmsds: number[] = [];
        for (const hs_h2o of potential_h2os) {
          const tested_ecec = [...total_ecec, ...added_app_ecec, ...hs_h2o];
          h2o_rmsds.push(
            kabsch(
              tested_ecec.map((tpr) => tpr[0].xyz),
              tested_ecec.map((tpr) => tpr[1].xyz),
            ),
          );
        }
        if (near(h2o_rmsds[0], h2o_rmsds[1])) tie();
        added_app_ecec.push(...potential_h2os[h2o_rmsds[1] < h2o_rmsds[0] ? 1 : 0]);
        break;
      }
      total_ecec.push(...added_app_ecec);
      const added_appended_ecec_atoms_a = added_app_ecec.map((p) => p[0]);
      const added_appended_ecec_atoms_b = added_app_ecec.map((p) => p[1]);
      const new_appended_ecec: Chain[] = [];
      for (const ecec of appended_ecec) {
        if (ecec.some((p) => added_appended_ecec_atoms_a.includes(p[0]))) continue;
        if (ecec.some((p) => added_appended_ecec_atoms_b.includes(p[1]))) continue;
        new_appended_ecec.push(ecec);
      }
      appended_ecec = new_appended_ecec;
    }
    extracted_canonical_extended_chains = [total_ecec];
    break;
  }

  // 1230-1242: what is left unplaced, by recursion with the chain as known pairs
  const recursive_extended_chains: Chain[] = [];
  for (const chain of extracted_canonical_extended_chains) {
    if (chain.length < Math.min(atoms_a.length, atoms_b.length)) {
      const new_maps = _get_maps(atoms_a, atoms_b, chain, false, _recursion_counter + 1, trace, dep, ctx);
      if (new_maps.length === 0) recursive_extended_chains.push(chain);
      else for (const new_map of new_maps) recursive_extended_chains.push([...chain, ...new_map]);
    } else {
      recursive_extended_chains.push(chain);
    }
  }

  // 1244-1254
  const canonical_recursive_extended_chains = new Map<string, Chain>();
  for (let chain of recursive_extended_chains) {
    if (known_pairs.length !== 0 && _recursion_counter !== 0) chain = chain.slice(known_pairs.length);
    canonical_recursive_extended_chains.set(chainKey(chain), chain);
  }
  const ret = [...canonical_recursive_extended_chains.values()];
  trace?.getMaps?.({
    _recursion_counter,
    known_pairs: known_pairs as Chain,
    initial_pairs,
    initial_chains,
    canonical_initial_chains: [...canonical_initial_chains.values()],
    h_matched_canonical_initial_chains,
    extended_chains,
    canonical_extended_chains: [...canonical_extended_chains.values()],
    extracted_canonical_extended_chains,
    recursive_extended_chains,
    return: ret,
  });
  return ret;
}

// ---------------------------------------------------------------------------
// _correct_maps (modeler.py 1257-1377)
// ---------------------------------------------------------------------------

/**
 * _correct_maps: more maps, made from each by swapping two atoms around a
 * ring of bonds the map leaves unmatched (made, broken), up to `max_loop`
 * rounds a map.
 *
 * Two of its sets hold atoms, which Python iterates in the order of their
 * memory addresses (so the original's order there changes from run to run):
 * the bonds a map leaves unmatched, and the swaps found. Here the unmatched
 * bonds are taken in the order they are met, each atom's own first, and the
 * swaps sorted by their atoms' numbers - the first, as the original sorts
 * them, then the rest.
 */
export function _correct_maps(atoms_a: Atoms, atoms_b: Atoms, atom_maps: Chain[], max_loop = 4, max_loop_rest_que = 8192, max_diff_bonds = 8): Chain[] {
  void atoms_a;
  void atoms_b;
  const total_atom_maps_dict = new Map<string, Chain>();
  for (const atom_map of atom_maps) total_atom_maps_dict.set(chainKey(atom_map), atom_map);
  for (const initial_atom_map of atom_maps) {
    const que_atom_maps: Chain[] = [initial_atom_map];
    let loop_counter = 0;
    while (que_atom_maps.length) {
      const atom_map = que_atom_maps.shift()!;
      let potential_swaps: Atom[][] = [];
      // 1276-1282: the bonds of a that the map does not carry onto b, or carries from b that a has not
      const a_diff_bonds_raw: [Atom, Atom][] = [];
      // (bs_in_map, the same for each pair - made once - and its .index() as a map)
      const bs_in_map = firstPlaces(atom_map.map((p) => p[1]));
      for (const ab_map of atom_map) {
        const a_diff_bd_from_b = ab_map[1].bonds.filter((b) => bs_in_map.has(b)).map((b) => atom_map[bs_in_map.get(b)!][0]);
        const own = ab_map[0].bonds;
        // set(own) ^ set(a_diff_bd_from_b) - a set of atoms; taken here own first, then the other, each in order
        const symdiff: Atom[] = [];
        for (const a of own) if (!a_diff_bd_from_b.includes(a) && !symdiff.includes(a)) symdiff.push(a);
        for (const a of a_diff_bd_from_b) if (!own.includes(a) && !symdiff.includes(a)) symdiff.push(a);
        for (const a_diff_bd of symdiff) a_diff_bonds_raw.push([ab_map[0], a_diff_bd]);
      }
      // list(set(tuple(sorted(adb, key=number)))) - a set of atom pairs; first-met order here
      const a_diff_bonds: [Atom, Atom][] = [];
      {
        const seen = new Set<string>();
        for (const adb of a_diff_bonds_raw) {
          const t = pySorted(adb, (a) => a.number) as [Atom, Atom];
          const k = `${t[0].number},${t[1].number}`;
          if (seen.has(k)) continue;
          seen.add(k);
          a_diff_bonds.push(t);
        }
      }
      if (a_diff_bonds.length > max_diff_bonds) {
        // len(a_diff_bonds) exceeded max_diff_bonds: exiting loop - `continue` in the original
        continue;
      }
      // 1286-1295: an imaginary bond between the two ends of an open path
      if (a_diff_bonds.length >= 2) {
        const all_adb = [...a_diff_bonds.map((adb) => adb[0]), ...a_diff_bonds.map((adb) => adb[1])];
        const imaginary_bonds_candidate = all_adb.filter((a) => all_adb.filter((x) => x === a).length === 1);
        while (imaginary_bonds_candidate.length === 2) {
          const initialAs = initial_atom_map.map((m) => m[0]);
          if (imaginary_bonds_candidate.filter((a) => initialAs.includes(a)).length === 2) break;
          const imaginary_bonds = pySorted(imaginary_bonds_candidate, (a) => a.number) as [Atom, Atom];
          a_diff_bonds.push(imaginary_bonds);
          break;
        }
      }
      // 1296-1327: every closed path through the unmatched bonds, breadth first
      type Q = { loop_atoms: Atom[]; rest_bonds: [Atom, Atom][]; end_atom: Atom };
      const loop_rest_que: Q[] = a_diff_bonds.map((adb) => ({
        loop_atoms: [adb[0]],
        rest_bonds: a_diff_bonds.filter((b) => b !== adb),
        end_atom: adb[1],
      }));
      const stored_loop_atoms: Atom[][] = [];
      while (loop_rest_que.length) {
        if (loop_rest_que.length > max_loop_rest_que) break;
        const q = loop_rest_que.shift()!;
        const loop_atoms = q.loop_atoms;
        const rest_bonds = q.rest_bonds;
        if (last(loop_atoms) === q.end_atom) stored_loop_atoms.push(loop_atoms);
        for (const checking_bond of rest_bonds) {
          let new_terminal: Atom;
          if (last(loop_atoms) === checking_bond[0]) new_terminal = checking_bond[1];
          else if (last(loop_atoms) === checking_bond[1]) new_terminal = checking_bond[0];
          else continue;
          loop_rest_que.push({
            loop_atoms: [...loop_atoms, new_terminal],
            rest_bonds: rest_bonds.filter((b) => b !== checking_bond),
            end_atom: q.end_atom,
          });
        }
      }
      // 1328-1336: alternate atoms of a loop, all of one element, may swap
      for (const loop_atoms of stored_loop_atoms) {
        const even = loop_atoms.filter((_, i) => i % 2 === 0);
        const odd = loop_atoms.filter((_, i) => i % 2 === 1);
        if (new Set(even.map((a) => a.symbol)).size === 1) potential_swaps.push(even);
        if (new Set(odd.map((a) => a.symbol)).size === 1) potential_swaps.push(odd);
      }
      {
        // sorted(list(set(tuple(sorted(adb, key=number)))), key=ap[0].number): the set's order (atoms'
        // addresses) settles ties in the original; here they go by the numbers after the first
        const seen = new Set<string>();
        const uniq: Atom[][] = [];
        for (const adb of potential_swaps) {
          const t = pySorted(adb, (a) => a.number);
          const k = t.map((a) => a.number).join(",");
          if (seen.has(k)) continue;
          seen.add(k);
          uniq.push(t);
        }
        potential_swaps = pySorted(uniq, (ap) => ap.map((a) => a.number));
      }
      // 1337-1365
      const atom_map_a = atom_map.map((m) => m[0]);
      const temporary_atom_maps_dict = new Map<string, Chain>();
      let non_hydrogen_swap_counter = 0;
      for (const pq_swap of potential_swaps) {
        if (pq_swap.length !== 2) continue;
        const pi = atom_map_a.indexOf(pq_swap[0]);
        const qi = atom_map_a.indexOf(pq_swap[1]);
        const p_id: number | null = pi < 0 ? null : pi;
        const q_id: number | null = qi < 0 ? null : qi;
        const new_map: Chain = atom_map.slice();
        if (p_id !== null && q_id !== null) {
          const np_: Pair = [pq_swap[0], new_map[q_id][1]];
          const nq_: Pair = [pq_swap[1], new_map[p_id][1]];
          new_map[p_id] = np_;
          new_map[q_id] = nq_;
        } else if (p_id !== null) {
          new_map[p_id] = [pq_swap[1], new_map[p_id][1]];
        } else if (q_id !== null) {
          new_map[q_id] = [pq_swap[0], new_map[q_id][1]];
        } else {
          continue;
        }
        const new_map_key = chainKey(new_map);
        if (!total_atom_maps_dict.has(new_map_key)) {
          if (pq_swap[0].symbol !== "H") non_hydrogen_swap_counter += 1;
          temporary_atom_maps_dict.set(new_map_key, new_map);
        }
      }
      // 1366-1376
      if (loop_counter === 0 || non_hydrogen_swap_counter <= 1) {
        for (const [new_map_key, new_map] of temporary_atom_maps_dict) {
          total_atom_maps_dict.set(new_map_key, new_map);
          que_atom_maps.push(new_map);
        }
      }
      loop_counter += 1;
      if (loop_counter >= max_loop) break;
    }
  }
  return [...total_atom_maps_dict.values()];
}

// ---------------------------------------------------------------------------
// _order_maps (modeler.py 1380-1865)
// ---------------------------------------------------------------------------

/** The scores each map is ordered by, in the order they count (1454-1469). */
export const EVALUATION_KEYS = [
  "metathesis_point",
  "reactive_sp3_carbon_penalty",
  "non_hydrogen_breaking_bonds",
  "heteroatoms_on_breaking_atoms",
  "num_of_long_rearranged_atoms",
  "inconsistent_h_count",
  "pericyclic_face",
  "antarafacial_penalty",
  "invalid_sn2_atoms",
  "boat_transition_penalty",
  "syn_or_anti_addition",
  "bonding_local_rmsd",
  "local_rmsd",
  "total_rmsd",
] as const;
export type EvaluationKey = (typeof EVALUATION_KEYS)[number];
export type Evaluated = { map: Chain } & Record<EvaluationKey, number>;

/** A Python dict keyed by tuples of ints, in insertion order: [key, value] entries. */
type FaceDict = { key: number[]; value: boolean | null }[];
const tupleKey = (t: readonly number[]) => t.join(",");
function faceGet(d: FaceDict, key: readonly number[]): { key: number[]; value: boolean | null } | undefined {
  const k = tupleKey(key);
  return d.find((e) => tupleKey(e.key) === k);
}
function faceSet(d: FaceDict, key: readonly number[], value: boolean | null): void {
  const e = faceGet(d, key);
  if (e) e.value = value;
  else d.push({ key: [...key], value });
}
/** `{f: v} | other`: the left's entries, then the right's, a key met again keeping its place and taking the new value. */
function faceUnion(a: FaceDict, b: FaceDict): FaceDict {
  const out: FaceDict = a.map((e) => ({ key: e.key, value: e.value }));
  for (const e of b) faceSet(out, e.key, e.value);
  return out;
}
/** dict == dict: the same keys with equal values, in any order. */
function faceEq(a: FaceDict, b: FaceDict): boolean {
  if (a.length !== b.length) return false;
  return a.every((e) => {
    const o = faceGet(b, e.key);
    return o !== undefined && o.value === e.value;
  });
}

/** What Python raises where the original would (bool ^ None, None.xyz). */
class PythonError extends Error {}

/**
 * _order_maps: the maps sorted by what makes a reaction likely - fewest
 * metatheses, sp3 carbons reacting, heavy-atom bonds broken; heteroatoms
 * next to those broken; faces and suprafaciality as pericyclic reactions
 * go; local and total RMSD last - each a stable sort, the last key first.
 */
export function _order_maps(
  atoms_a: Atoms,
  atoms_b: Atoms,
  atom_maps: Chain[],
  options: Partial<Record<string, number>> = {},
  trace?: MapperTrace,
  dep: Departures = ACCEL_EXACT,
): Chain[] {
  // 1386-1395
  const get_normal_vector = (a: Atom, b: Atom, c: Atom): V3 => {
    let ord_atoms: Atom[];
    const three = [a, b, c];
    if (three.every((t) => t.cache.map_idx !== null && t.cache.map_idx !== undefined)) {
      ord_atoms = pySorted(three, (x) => x.cache.map_idx as number);
    } else {
      // sorting None against an int raises TypeError (three items always compare): the fallback
      ord_atoms = [
        ...pySorted(
          three.filter((t) => t.cache.map_idx !== null && t.cache.map_idx !== undefined),
          (x) => x.cache.map_idx as number,
        ),
        ...three.filter((t) => t.cache.map_idx === null || t.cache.map_idx === undefined),
      ];
    }
    const vop = sub(ord_atoms[1].xyz, ord_atoms[0].xyz);
    const voq = sub(ord_atoms[2].xyz, ord_atoms[0].xyz);
    return cross(vop, voq);
  };

  // 1397-1408
  const get_reactive_face_flag = (center_atom: Atom, reactive_atom: Atom): boolean | null => {
    const center_to_reactive_vec = sub(reactive_atom.xyz, center_atom.xyz);
    const non_rea_atoms = center_atom.single.filter((a) => a !== reactive_atom);
    if (non_rea_atoms.length !== 3) return null;
    const nvec = get_normal_vector(non_rea_atoms[0], non_rea_atoms[1], non_rea_atoms[2]);
    const st = norm(center_to_reactive_vec) * norm(nvec);
    // [Meno departure: clampFaceCosine] a cosine rounded past -1 or 1 is taken as -1 or 1
    const theta = acosOf(dot(center_to_reactive_vec, nvec) / st, dep.clampFaceCosine);
    if (rad2deg(theta) >= 90) return false;
    return true;
  };

  // 1410-1429
  const get_relationship_flag = (atom_x: Atom, atom_y: Atom): boolean | null => {
    const x_neis = atom_x.bonds;
    const y_neis = atom_y.bonds;
    let xvec: V3;
    let yvec: V3;
    if (x_neis.length === 3 && y_neis.length === 3) {
      xvec = get_normal_vector(x_neis[0], x_neis[1], x_neis[2]);
      yvec = get_normal_vector(y_neis[0], y_neis[1], y_neis[2]);
    } else if (x_neis.length === 3 && y_neis.length === 2) {
      xvec = get_normal_vector(x_neis[0], x_neis[1], x_neis[2]);
      yvec = get_normal_vector(y_neis[0], y_neis[1], atom_y);
    } else if (x_neis.length === 2 && y_neis.length === 3) {
      xvec = get_normal_vector(x_neis[0], x_neis[1], atom_x);
      yvec = get_normal_vector(y_neis[0], y_neis[1], y_neis[2]);
    } else {
      return null;
    }
    const st = norm(xvec) * norm(yvec);
    // [Meno departure: clampFaceCosine]
    const theta = acosOf(dot(xvec, yvec) / st, dep.clampFaceCosine);
    if (rad2deg(theta) >= 90) return false;
    return true;
  };

  // 1431-1445
  const get_arc_relationship_flag = (atom_x: Atom | null, atom_y_list: (Atom | null)[]): boolean | null => {
    if (atom_x === null) throw new PythonError("'NoneType' object has no attribute 'bonds'");
    const x_neis = atom_x.bonds;
    let xvec: V3;
    let yvec: V3;
    if (x_neis.length === 3 && atom_y_list.length === 3) {
      xvec = get_normal_vector(x_neis[0], x_neis[1], x_neis[2]);
      if (atom_y_list.includes(null)) throw new PythonError("'NoneType' object has no attribute 'xyz'");
      const ys = atom_y_list as Atom[];
      const vop = sub(ys[1].xyz, ys[0].xyz);
      const voq = sub(ys[2].xyz, ys[0].xyz);
      yvec = cross(vop, voq);
    } else {
      return null;
    }
    const st = norm(xvec) * norm(yvec);
    // [Meno departure: clampFaceCosine]
    const theta = acosOf(dot(xvec, yvec) / st, dep.clampFaceCosine);
    if (rad2deg(theta) >= 90) return false;
    return true;
  };

  const det_chirality = _det_chirality;

  // 1454-1470
  const evaluated_dicts: Evaluated[] = atom_maps.map((mp) => {
    const e = { map: mp } as Evaluated;
    for (const k of EVALUATION_KEYS) e[k] = 0;
    return e;
  });

  // 1472-1483
  for (const a of atoms_a) a.cache.original_number = a.number;
  for (const b of atoms_b) b.cache.original_number = b.number;
  const mol_num_a = new Map<number, number>();
  const mol_num_b = new Map<number, number>();
  getSplitted(atoms_a).forEach((atms, idx) => {
    for (const n of atms) mol_num_a.set(n, idx);
  });
  getSplitted(atoms_b).forEach((atms, idx) => {
    for (const n of atms) mol_num_b.set(n, idx);
  });

  // [Meno departure: fewestBondChanges] each map's bonds formed or broken
  const bondChanges = new Map<Evaluated, number>();

  for (const evaluated_dic of evaluated_dicts) {
    // 1488-1505
    for (const a of atoms_a) a.cache.map_idx = null;
    for (const a of atoms_b) a.cache.map_idx = null;
    const atom_map = evaluated_dic.map;
    atom_map.forEach((pr, idx) => {
      pr[0].cache.map_idx = idx;
      pr[1].cache.map_idx = idx;
    });
    const bonding_pairs: Pair[] = [];
    const normal_pairs: Pair[] = [];
    const ic_map: Atom[] = [...atom_map.map((p) => p[0]), ...atom_map.map((p) => p[1])];
    // (ic_map.index(atom) as a map: each atom's first place)
    const ic_pos = firstPlaces(ic_map);
    const ic = (atom: Atom | null): Atom | null => {
      const idx = atom === null ? -1 : (ic_pos.get(atom) ?? -1);
      if (idx < 0) return null;
      return ic_map[(idx + atom_map.length) % ic_map.length];
    };
    const numSort = (xs: number[]) => xs.sort((p, q) => p - q);

    if (dep.fewestBondChanges) {
      let changes = 0;
      for (const atoms of [atoms_a, atoms_b]) {
        for (const x of atoms) {
          for (const y of x.bonds) {
            if (x.number > y.number) continue;
            const ix = ic(x);
            const iy = ic(y);
            if (ix === null || iy === null || !ix.bonds.includes(iy)) changes += 1;
          }
        }
      }
      bondChanges.set(evaluated_dic, changes);
    }

    // 1507-1524: pairs whose bonds the map carries over both ways are normal; the rest are bonding
    for (const pair of atom_map) {
      let a_bonding_nums = numSort(pair[0].bonds.map((a) => a.number));
      let b_bonding_nums = numSort(pair[1].bonds.filter((b) => ic(b) !== null).map((b) => ic(b)!.number));
      const a_to_b = eqList(a_bonding_nums, b_bonding_nums);
      b_bonding_nums = numSort(pair[1].bonds.map((b) => b.number));
      a_bonding_nums = numSort(pair[0].bonds.filter((a) => ic(a) !== null).map((a) => ic(a)!.number));
      const b_to_a = eqList(a_bonding_nums, b_bonding_nums);
      if (a_to_b && b_to_a) normal_pairs.push(pair);
      else bonding_pairs.push(pair);
    }

    // 1526-1560: RMSD of each pair's neighbourhood
    const localRmsd = (pr: Pair): number => {
      const local_pairs: Pair[] = [pr];
      const _b_bonds = pr[1].bonds;
      for (const a_bonding of pr[0].bonds) {
        const _aconv = ic(a_bonding);
        if (!(_aconv !== null && _b_bonds.includes(_aconv))) continue;
        local_pairs.push([a_bonding, _aconv]);
        for (const a_gem of a_bonding.bonds) {
          const _b_gem_bonds = _aconv.bonds;
          const _a_gem_conv = ic(a_gem);
          if (_a_gem_conv !== null && _b_gem_bonds.includes(_a_gem_conv)) local_pairs.push([a_gem, _a_gem_conv]);
        }
      }
      return kabsch(
        local_pairs.map((tpr) => tpr[0].xyz),
        local_pairs.map((tpr) => tpr[1].xyz),
      );
    };
    for (const pr of bonding_pairs) evaluated_dic.bonding_local_rmsd += localRmsd(pr);
    evaluated_dic.bonding_local_rmsd = pyRound1(evaluated_dic.bonding_local_rmsd);
    for (const pr of normal_pairs) evaluated_dic.local_rmsd += localRmsd(pr);
    evaluated_dic.local_rmsd = pyRound1(evaluated_dic.local_rmsd);

    // 1562-1564
    evaluated_dic.total_rmsd = kabsch(
      atom_map.map((m) => m[0].xyz),
      atom_map.map((m) => m[1].xyz),
    );

    // 1566-1578
    // (the bonding pairs' atoms on each side, for `in`)
    const bondingSides = [new Set(bonding_pairs.map((p) => p[0])), new Set(bonding_pairs.map((p) => p[1]))];
    for (const pr of bonding_pairs) {
      for (const [i0, i1] of [
        [0, 1],
        [1, 0],
      ]) {
        for (const a_bonding of pr[i0].bonds) {
          if (bondingSides[i0].has(a_bonding)) {
            if (ic(a_bonding) === null) continue;
            if (pr[i1].bonds.includes(ic(a_bonding)!)) continue;
            for (const b_bonding of ic(a_bonding)!.bonds) {
              const conv = ic(b_bonding);
              if (conv !== null && a_bonding.bonds.includes(conv)) continue;
              if (bondingSides[i1].has(b_bonding)) evaluated_dic.num_of_long_rearranged_atoms += 1;
            }
          }
        }
      }
    }

    // 1580-1643: the faces the reacting atoms are approached from
    const map_index_dict = new Map<Atom, number>();
    atom_map.forEach((m, idx) => map_index_dict.set(m[0], idx));
    atom_map.forEach((m, idx) => map_index_dict.set(m[1], idx));
    const bonding_atoms = [...bonding_pairs.map((p) => p[0]), ...bonding_pairs.map((p) => p[1])];
    const faces_dict: FaceDict = [];
    const all_reactive_idx_dict = new Map<number, number>();
    for (const pr of [...bonding_pairs, ...bonding_pairs.map((_pr) => [_pr[1], _pr[0]] as Pair)]) {
      if (pr[0].symbol === "H" && pr[1].symbol === "H") {
        const pr0_single = pr[0].single;
        if (pr0_single.length !== 1) continue;
        if (map_index_dict.get(pr0_single[0]) === undefined) continue;
        all_reactive_idx_dict.set(map_index_dict.get(pr[0])!, map_index_dict.get(pr0_single[0])!);
        faceSet(faces_dict, [map_index_dict.get(pr[0])!], true);
        continue;
      }
      if (ic(pr[0])!.double.length !== 1) continue;
      const reactive_atoms = pr[0].single.filter((a) => {
        const c = ic(a);
        return !(c !== null && pr[1].bonds.includes(c));
      });
      if (reactive_atoms.length !== 1) continue;
      if (map_index_dict.get(reactive_atoms[0]) === undefined) continue;
      all_reactive_idx_dict.set(map_index_dict.get(pr[0])!, map_index_dict.get(reactive_atoms[0])!);
      let face_flag: boolean | null = get_reactive_face_flag(pr[0], reactive_atoms[0]);
      const stack: (Atom | null)[] = [pr[1]];
      let involving_atom_number = 1;
      for (;;) {
        if (involving_atom_number > 16) break;
        const twin_atom = last(stack);
        if (twin_atom === null) break;
        const twin_neighbors = twin_atom.double;
        if (twin_neighbors.length !== 1) break;
        if (stack.length >= 2 && twin_neighbors[0] === stack[stack.length - 2]) break;
        const rel_flag = get_relationship_flag(twin_atom, twin_neighbors[0]);
        if (rel_flag === null || face_flag === null) face_flag = null;
        else if (!rel_flag) face_flag = !face_flag;
        const my_neighbor = ic(twin_neighbors[0]);
        if (stack.length >= 2 && my_neighbor === stack[stack.length - 2]) break;
        if (my_neighbor !== null && bonding_atoms.includes(my_neighbor)) {
          const my_neighbor_reactive_atoms = my_neighbor.single.filter((a) => {
            const c = ic(a);
            return !(c !== null && twin_neighbors[0].bonds.includes(c));
          });
          if (my_neighbor_reactive_atoms.length !== 1) break;
          stack.push(my_neighbor);
          const stack_as_index = stack.map((a) => map_index_dict.get(a as Atom)!);
          if (face_flag === null) {
            faceSet(faces_dict, stack_as_index, null);
            break;
          }
          const next_face_flag = get_reactive_face_flag(my_neighbor, my_neighbor_reactive_atoms[0]);
          if (next_face_flag === null) {
            faceSet(faces_dict, stack_as_index, null);
            break;
          }
          faceSet(faces_dict, stack_as_index, next_face_flag === face_flag);
          break;
        } else {
          stack.push(my_neighbor);
          involving_atom_number += 1;
        }
      }
    }

    // 1645-1653
    const canonical_faces_dict: FaceDict = [];
    for (const { key: f, value: syn_anti } of faces_dict) {
      let face = f;
      if (f[0] > last(f)) face = [...f].reverse();
      const got = faceGet(canonical_faces_dict, face);
      if ((got ? got.value : syn_anti) === syn_anti) faceSet(canonical_faces_dict, face, syn_anti);
      // else: conflicting faces detected (logged in the original)
    }

    // 1655-1691
    const pairwise_faces: FaceDict[] = [];
    for (const { key: f } of canonical_faces_dict) {
      const r0 = all_reactive_idx_dict.get(f[0]);
      const r1 = all_reactive_idx_dict.get(last(f));
      if (r0 === undefined || r1 === undefined) continue;
      const ridx: [number, number] = [r0, r1];
      for (const { key: pair_f, value: pair_v } of canonical_faces_dict) {
        let pair_f_dict: FaceDict;
        if (ridx[0] === pair_f[0] && ridx[1] === last(pair_f)) pair_f_dict = [{ key: pair_f, value: pair_v }];
        else if (ridx[0] === last(pair_f) && ridx[1] === pair_f[0]) pair_f_dict = [{ key: [...pair_f].reverse(), value: pair_v }];
        else continue;
        const new_pair_f_dict = faceUnion([{ key: f, value: faceGet(canonical_faces_dict, f)!.value }], pair_f_dict);
        if (!pairwise_faces.some((p) => faceEq(p, new_pair_f_dict))) pairwise_faces.push(new_pair_f_dict);
      }

      const fv = faceGet(canonical_faces_dict, f)!.value;
      if ((f.length === 2 || f.length === 3) && fv !== null) {
        const a_same = mol_num_a.get(atom_map[ridx[0]][0].number) === mol_num_a.get(atom_map[ridx[1]][0].number);
        const b_same = mol_num_b.get(atom_map[ridx[0]][1].number) === mol_num_b.get(atom_map[ridx[1]][1].number);
        let rearrangement_flag = false;
        if (!a_same && f.length === 3) {
          const mol_num = mol_num_a.get(atom_map[f[0]][0].number);
          if (mol_num === mol_num_a.get(atom_map[last(f)][0].number)) {
            if (mol_num_a.get(atom_map[ridx[0]][0].number) === mol_num) rearrangement_flag = !rearrangement_flag;
            if (mol_num_a.get(atom_map[ridx[1]][0].number) === mol_num) rearrangement_flag = !rearrangement_flag;
          }
        }
        if (!b_same && f.length === 3) {
          const mol_num = mol_num_b.get(atom_map[f[0]][1].number);
          if (mol_num === mol_num_b.get(atom_map[last(f)][1].number)) {
            if (mol_num_b.get(atom_map[ridx[0]][1].number) === mol_num) rearrangement_flag = !rearrangement_flag;
            if (mol_num_b.get(atom_map[ridx[1]][1].number) === mol_num) rearrangement_flag = !rearrangement_flag;
          }
        }
        const add_flags = [rearrangement_flag !== fv, a_same, b_same];
        if (eqList(add_flags, [true, true, true]) || eqList(add_flags, [false, true, false]) || eqList(add_flags, [false, false, true]))
          evaluated_dic.syn_or_anti_addition -= 1;
      }
    }

    // 1693
    evaluated_dic.antarafacial_penalty = pairwise_faces.filter((sa) => sa.some((e) => e.value === false)).length;

    // 1695-1710
    for (const p of pairwise_faces) {
      if (p.some((e) => e.value === null)) continue;
      const fs = pySorted(
        p.map((e) => e.key),
        (f) => f.length,
      );
      if (fs.length !== 2 || last(fs).length <= 3) continue;
      let fs_len: number;
      if (fs[0].length === 1 && last(fs).length % 2 !== 0) fs_len = last(fs).length + 1;
      else if (eqList(fs[0], [...last(fs)].reverse()) && last(fs).length % 2 === 0) fs_len = last(fs).length;
      else continue;
      if ((fs_len % 4 === 0) !== faceGet(p, last(fs))!.value) evaluated_dic.pericyclic_face -= 1;
      else evaluated_dic.pericyclic_face += 1;
    }

    // 1712-1723
    for (const p of pairwise_faces) {
      const fs = p.map((e) => e.key);
      if (fs.length !== 2) continue;
      if (!eqList(fs[0], [...fs[1]].reverse())) continue;
      if (fs[0].length % 2 !== 0) continue;
      const v = faceGet(p, fs[0])!.value;
      if (v === null) {
        // [Meno departure: skipUnflaggedFacePair] left out, where Python raises
        if (dep.skipUnflaggedFacePair) continue;
        throw new PythonError("unsupported operand type(s) for ^: 'bool' and 'NoneType'");
      }
      if ((fs[0].length % 4 === 0) !== v) evaluated_dic.pericyclic_face -= 1;
      else evaluated_dic.pericyclic_face += 1;
    }

    // 1725-1751: a boat or chair, for two three-atom faces
    for (const p of pairwise_faces) {
      if (!eqList(
        p.map((e) => e.key.length),
        [3, 3],
      ))
        continue;
      const face_tuple = p.map((e) => e.key);
      for (const ab_idx of [0, 1]) {
        for (const [face_a, face_b] of [face_tuple, [...face_tuple].reverse()]) {
          const face_a_atoms = face_a.map((idx) => atom_map[idx][ab_idx]);
          const face_a_twins = face_a_atoms.map((a) => ic(a));
          const face_b_atoms = face_b.map((idx) => atom_map[idx][ab_idx]);
          const face_b_twins = face_b_atoms.map((a) => ic(a));
          if (!face_a_atoms[0].single.includes(face_b_atoms[0]) || !face_b_atoms[0].single.includes(face_a_atoms[0])) continue;
          const face_a_flag = get_reactive_face_flag(face_a_atoms[0], face_b_atoms[0]);
          const face_b_flag = get_reactive_face_flag(face_b_atoms[0], face_a_atoms[0]);
          if (face_a_flag === null || face_b_flag === null) continue;
          let arc_a_flag = get_arc_relationship_flag(face_a_twins[0], face_a_twins);
          let arc_b_flag = get_arc_relationship_flag(face_b_twins[0], face_b_twins);
          if (arc_a_flag === null || arc_b_flag === null) continue;
          if (!face_a_flag) arc_a_flag = !arc_a_flag;
          if (!face_b_flag) arc_b_flag = !arc_b_flag;
          if (arc_a_flag !== arc_b_flag) evaluated_dic.boat_transition_penalty += 1;
        }
      }
    }

    // 1753-1773: an SN2 carbon should invert
    for (const pr of bonding_pairs) {
      if (pr[0].symbol !== pr[1].symbol) continue;
      const a_singles = pr[0].single;
      const b_singles = pr[1].single;
      if (a_singles.length !== 4 || b_singles.length !== 4) continue;
      const aconv_from_a = a_singles.map((a) => ic(a));
      const aconv_from_b = b_singles.map((b) => ic(b));
      const diff_a_atoms = a_singles.filter((a) => !aconv_from_b.includes(a));
      const diff_b_atoms = b_singles.filter((b) => !aconv_from_a.includes(b));
      if (diff_a_atoms.length !== 1 || diff_b_atoms.length !== 1) continue;
      if (diff_a_atoms[0].symbol === "H" || diff_b_atoms[0].symbol === "H") continue;
      if (diff_a_atoms[0].symbol === "C" && diff_b_atoms[0].symbol === "C") continue;
      const a_ord_atoms = a_singles.filter((a) => !diff_a_atoms.includes(a));
      const b_ord_atoms = a_ord_atoms.map((a) => ic(a));
      if (b_ord_atoms.includes(null)) throw new PythonError("'NoneType' object has no attribute 'xyz'");
      const qa = [...a_ord_atoms, ...diff_a_atoms];
      const qb = [...(b_ord_atoms as Atom[]), ...diff_b_atoms];
      if (det_chirality(qa[0], qa[1], qa[2], qa[3]) === det_chirality(qb[0], qb[1], qb[2], qb[3])) evaluated_dic.invalid_sn2_atoms += 1;
    }

    // 1775-1795: bonds broken (or made) between same-element pairs
    let breaking_bonds_raw: [Atom, Atom][] = [];
    for (const pr of bonding_pairs) {
      if (pr[0].symbol !== pr[1].symbol) continue;
      const a_bonds = pr[0].bonds;
      const b_bonds = pr[1].bonds;
      const aconv_from_a = a_bonds.map((a) => ic(a));
      const aconv_from_b = b_bonds.map((b) => ic(b));
      for (const diff_atm of a_bonds.filter((a) => !aconv_from_b.includes(a))) breaking_bonds_raw.push([pr[0], diff_atm]);
      for (const diff_atm of b_bonds.filter((b) => !aconv_from_a.includes(b))) breaking_bonds_raw.push([pr[1], diff_atm]);
    }
    const breaking_bonds: [Atom, Atom][] = [];
    {
      // {tuple(sorted(b, key=number)): None}.keys() - first-met order; a bond of the reactant and one of the
      // product are different keys even with the same numbers, as tuples of different atoms are
      const seen: [Atom, Atom][] = [];
      for (const b of breaking_bonds_raw) {
        const t = pySorted(b, (a) => a.number) as [Atom, Atom];
        if (seen.some((s) => s[0] === t[0] && s[1] === t[1])) continue;
        seen.push(t);
        breaking_bonds.push(t);
      }
    }
    breaking_bonds_raw = [];
    const non_hydrogen_breaking_bonds = breaking_bonds.filter((b) => "H" !== b[0].symbol && "H" !== b[1].symbol);
    evaluated_dic.non_hydrogen_breaking_bonds += non_hydrogen_breaking_bonds.length;

    // 1797-1806 (the triple bonds counted twice, as in the original)
    for (const bb of non_hydrogen_breaking_bonds) {
      const bbb_atoms: Atom[] = [];
      bbb_atoms.push(...bb[0].bonds.filter((a) => a !== bb[1]), ...bb[1].bonds.filter((a) => a !== bb[0]));
      bbb_atoms.push(...bb[0].double.filter((a) => a !== bb[1]), ...bb[1].double.filter((a) => a !== bb[0]));
      bbb_atoms.push(...bb[0].aromatic.filter((a) => a !== bb[1]), ...bb[1].aromatic.filter((a) => a !== bb[0]));
      bbb_atoms.push(...bb[0].triple.filter((a) => a !== bb[1]), ...bb[1].triple.filter((a) => a !== bb[0]));
      bbb_atoms.push(...bb[0].triple.filter((a) => a !== bb[1]), ...bb[1].triple.filter((a) => a !== bb[0]));
      evaluated_dic.heteroatoms_on_breaking_atoms -= bbb_atoms.filter((a) => a.symbol !== "C" && a.symbol !== "H").length;
    }

    // 1808-1836: carbons that trade partners around a ring of broken bonds - a metathesis
    const non_hydrogen_breaking_atoms = [...non_hydrogen_breaking_bonds.map((bb) => bb[0]), ...non_hydrogen_breaking_bonds.map((bb) => bb[1])];
    const countIn = (xs: Atom[], a: Atom) => xs.filter((x) => x === a).length;
    const bb_dict = new Map<Atom, Atom>();
    for (const bb of non_hydrogen_breaking_bonds) if (countIn(non_hydrogen_breaking_atoms, bb[0]) === 1) bb_dict.set(bb[0], bb[1]);
    for (const bb of non_hydrogen_breaking_bonds) if (countIn(non_hydrogen_breaking_atoms, bb[1]) === 1) bb_dict.set(bb[1], bb[0]);
    let metathesis_point = 0;
    for (const start_atom of bb_dict.keys()) {
      let next_atom: Atom | null = start_atom;
      let broke = false;
      for (let _ = 0; _ < 4; _++) {
        if (next_atom!.symbol !== "C") {
          broke = true;
          break;
        }
        if (next_atom!.bonds.length >= 4) {
          broke = true;
          break;
        }
        next_atom = bb_dict.get(next_atom!) ?? null;
        if (next_atom === null) {
          broke = true;
          break;
        }
        next_atom = ic(next_atom);
        if (next_atom === null) {
          broke = true;
          break;
        }
      }
      if (!broke && next_atom === start_atom) metathesis_point += 1;
    }
    if (metathesis_point !== 0 && metathesis_point % 8 === 0) evaluated_dic.metathesis_point -= metathesis_point / 8;

    // 1838-1847
    for (const pr of bonding_pairs) {
      if (pr[0].symbol === "C" && pr[1].symbol === "C") {
        if (pr[0].bonds.length === 4 && pr[1].bonds.length === 4) evaluated_dic.reactive_sp3_carbon_penalty += 1;
      }
    }
    for (const pr of bonding_pairs) {
      if (pr[0].symbol !== "C" || pr[1].symbol !== "C") continue;
      if (pr[0].bonds.filter((a) => a.symbol === "H").length !== pr[1].bonds.filter((a) => a.symbol === "H").length)
        evaluated_dic.inconsistent_h_count += 1;
    }
  }

  // 1849-1855
  for (const opt of Object.keys(options)) {
    if ((EVALUATION_KEYS as readonly string[]).includes(opt)) {
      for (const evaluated_dic of evaluated_dicts) evaluated_dic[opt as EvaluationKey] *= options[opt]!;
    }
  }

  // 1857-1865: a stable sort by each key, the last first
  let sorted = evaluated_dicts;
  for (const k of [...EVALUATION_KEYS].reverse()) {
    sorted = pySorted(sorted, (e) => e[k]);
    // [Meno departure: fewestBondChanges] next after metathesis_point
    if (dep.fewestBondChanges && k === "reactive_sp3_carbon_penalty") sorted = pySorted(sorted, (e) => bondChanges.get(e)!);
  }
  trace?.orderMaps?.(sorted);
  return sorted.map((e) => e.map);
}

// ---------------------------------------------------------------------------
// Modeler.get_maps (414-438) and get_mapped (440-476), `self` the product
// and `target` the reactant, as ConfoTS calls them.
// ---------------------------------------------------------------------------

export type MapOptions = {
  knownPairs?: readonly (readonly [number, number])[];
  terminalFirst?: boolean | null;
  options?: Partial<Record<string, number>>;
  trace?: MapperTrace;
  /** Meno's departures from ACCeL; none unless given. */
  departures?: Departures;
};

/** The ordered maps of target onto self, as (target atom, self atom) pairs. */
export function orderedMaps(self: Atoms, target: Atoms, o: MapOptions = {}): Chain[] {
  let atoms_map = _get_maps(target, self, o.knownPairs ?? [], o.terminalFirst ?? null, 0, o.trace, o.departures);
  atoms_map = _correct_maps(target, self, atoms_map);
  atoms_map = _order_maps(target, self, atoms_map, o.options ?? {}, o.trace, o.departures);
  // [Meno departures: transferAlignedH, localLeastTurn]
  // (two maps the same once placed: the first kept, in ACCeL's order)
  const dep = o.departures;
  if (dep?.transferAlignedH || dep?.localLeastTurn) {
    const seen = new Set<string>();
    if (dep.transferAlignedH) atoms_map = atoms_map.map(alignedTransfers);
    if (dep.localLeastTurn) atoms_map = atoms_map.map(localLeastTurn);
    atoms_map = atoms_map.filter((m) => {
      const k = m.map((p) => `${p[0].number}:${p[1].number}`).sort().join(",");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  return atoms_map;
}

/** How far `x`, a hydrogen on `centre`, is from in line with `partner`: its turn about the centre's one other neighbour's bond, or else the angle centre-H...partner short of 180 degrees (radians). */
function offLine(centre: Atom, partner: Atom, others: readonly Atom[]): (x: Atom) => number {
  if (others.length === 1) {
    const axis = sub(centre.xyz, others[0].xyz);
    const across = (p: readonly number[]) => {
      const v = sub(p, centre.xyz);
      const k = dot(v, axis) / dot(axis, axis);
      return [v[0] - k * axis[0], v[1] - k * axis[1], v[2] - k * axis[2]];
    };
    const toPartner = across(partner.xyz);
    return (x) => {
      const u = across(x.xyz);
      return Math.atan2(norm(cross(u, toPartner)), dot(u, toPartner));
    };
  }
  return (x) => {
    const u = sub(centre.xyz, x.xyz);
    const v = sub(partner.xyz, x.xyz);
    return Math.PI - Math.atan2(norm(cross(u, v)), dot(u, v));
  };
}

/**
 * How much nearer the line D-H...A, by `offLine`, another of the like
 * hydrogens (or hydrogen places) must be before `alignedTransfers` takes it
 * over ACCeL's: 60 degrees. A methyl's hydrogens stand 120 degrees apart
 * about its axis, so one nearer by more than half that is not the same
 * hydrogen reached by turning the other way: the geometry says which goes.
 * Nearer by less, the two are too alike to tell, and ACCeL's choice stands.
 */
export const TRANSFER_MARGIN = Math.PI / 3;

/**
 * [Meno departure: transferAlignedH] A map with each hydrogen it moves from
 * one atom (the donor, D) to another (the acceptor, A) placed as the
 * transfer passes it - along the line D-H...A:
 *
 * - **which of D's like hydrogens goes**: the one D brings in line with A
 *   by turning least, in the reactant;
 * - **which of A's like hydrogen places it takes**, where A already holds
 *   hydrogens: the one in line with D by the same measure, in the product -
 *   A's own hydrogens keep the others.
 *
 * "In line by turning least": where the atom has one other neighbour X (a
 * methyl's carbon on the rest of the molecule), its hydrogens turn about
 * X-atom, and each one's turn is the angle about that axis between it and
 * the partner; where it has none or several (a methylene in a chain cannot
 * turn freely), the angle at the hydrogen, atom-H...partner, nearest 180.
 *
 * Only which of an atom's like hydrogens is which changes - two hydrogens on
 * one atom swapped, a symmetry of either side - so the map's bond changes
 * stay the same.
 */
export function alignedTransfers(map: Chain): Chain {
  const out: Chain = map.map((p) => [p[0], p[1]] as Pair);
  const toB = new Map<Atom, Atom>();
  const toA = new Map<Atom, Atom>();
  const at = new Map<Atom, number>();
  const index = () => {
    toB.clear();
    toA.clear();
    at.clear();
    out.forEach((p, i) => {
      toB.set(p[0], p[1]);
      toA.set(p[1], p[0]);
      at.set(p[0], i);
    });
  };
  const swapB = (i: number, j: number) => {
    const b = out[i][1];
    out[i] = [out[i][0], out[j][1]];
    out[j] = [out[j][0], b];
    index();
  };
  index();
  const terminalH = (x: Atom) => x.symbol === "H" && x.bonds.length === 1;
  for (let k = 0; k < out.length; k++) {
    const h = out[k][0];
    const hB = out[k][1];
    if (!terminalH(h) || !terminalH(hB)) continue;
    const d = h.bonds[0];
    const aB = hB.bonds[0];
    const a = toA.get(aB);
    const dB = toB.get(d);
    if (!a || !dB || a === d) continue;
    // the donor's side, in the reactant: its hydrogens that stay on it, and this one
    const fromD = d.bonds.filter((x) => x === h || (terminalH(x) && toB.get(x)?.bonds.includes(dB)));
    if (fromD.length >= 2) {
      const off = offLine(d, a, d.bonds.filter((x) => x.symbol !== "H" && x !== a));
      const best = fromD.reduce((p, q) => (off(q) < off(p) ? q : p));
      if (best !== h && off(best) + TRANSFER_MARGIN < off(h)) swapB(k, at.get(best)!);
    }
    // the acceptor's side, in the product: its hydrogen places held by its own hydrogens, and the newcomer's
    const moverH = toA.get(hB)!;
    const kk = at.get(moverH)!;
    const placeB = out[kk][1];
    const toAB = aB.bonds.filter((x) => x === placeB || (terminalH(x) && toA.get(x)?.bonds.includes(a)));
    if (toAB.length >= 2) {
      const off = offLine(aB, dB, aB.bonds.filter((x) => x.symbol !== "H" && x !== dB));
      const best = toAB.reduce((p, q) => (off(q) < off(p) ? q : p));
      if (best !== placeB && off(best) + TRANSFER_MARGIN < off(placeB)) swapB(kk, at.get(toA.get(best)!)!);
    }
  }
  return out;
}

/**
 * [Meno departure: localLeastTurn] A map with each atom's like hydrogens
 * that stay on it given to one another again for the least motion: the
 * atom and its heavy neighbours (each paired) laid over one another, the
 * product's onto the reactant's (`kabschFit`), and each of the product's
 * hydrogens there given the reactant's hydrogen that leaves the sum of
 * squared distances least - the map as it was unless another is less.
 *
 * Only for an atom with two or more heavy neighbours, which hold it in
 * place: a methyl, or an atom alone, has no frame to lay over, and is left
 * as it was. A group where a hydrogen comes or goes is left too, as
 * `transferAlignedH` placed it; and an atom that goes from one shape to
 * another - with more neighbours on one side than the other (a cation's or
 * a carbene's CH2 bonded to), or whose bond to a neighbour it keeps
 * changes order (a double bond added to, or made) - its hydrogens
 * following the faces the reaction meets: ACCeL's face and syn-or-anti
 * scores placed them. Only which of
 * an atom's like hydrogens is which changes, so the map's bond changes
 * stay the same.
 */
export function localLeastTurn(map: Chain): Chain {
  const out: Chain = map.map((p) => [p[0], p[1]] as Pair);
  const toA = new Map<Atom, Atom>();
  const at = new Map<Atom, number>();
  out.forEach((p, i) => {
    toA.set(p[1], p[0]);
    at.set(p[1], i);
  });
  const terminalH = (x: Atom) => x.symbol === "H" && x.bonds.length === 1;
  const products = out.map((p) => p[1]).sort((x, y) => x.number - y.number);
  for (const cB of products) {
    const hsB = cB.bonds.filter(terminalH);
    if (hsB.length < 2) continue;
    const c = toA.get(cB);
    const hs = hsB.map((x) => toA.get(x));
    if (!c || hs.some((x) => !x || x.symbol !== "H" || !x.bonds.includes(c))) continue;
    // (an atom that goes from one shape to another - with more neighbours on one side than the other (a cation's or a carbene's
    //  CH2 bonded to), or a bond to a neighbour it keeps of another order (a double bond added to, or made) - has its hydrogens
    //  turned with the faces the reaction meets: left as ACCeL's own scores placed them)
    const kind = (x: Atom, y: Atom) => (x.single.includes(y) ? 1 : x.double.includes(y) ? 2 : x.triple.includes(y) ? 3 : x.aromatic.includes(y) ? 4 : 0);
    if (c.bonds.length !== cB.bonds.length) continue;
    if (cB.bonds.some((xB) => xB.symbol !== "H" && toA.has(xB) && toA.get(xB)!.bonds.includes(c) && kind(c, toA.get(xB)!) !== kind(cB, xB))) continue;
    const frameB = [cB, ...cB.bonds.filter((x) => x.symbol !== "H" && toA.has(x))];
    if (frameB.length < 3) continue;
    const fit = kabschFit(
      frameB.map((x) => toA.get(x)!.xyz),
      frameB.map((x) => x.xyz),
    );
    if (!fit?.r) continue;
    const { r, refMean, tarMean } = fit;
    const laid = hsB.map((x) => {
      const t = sub(x.xyz, tarMean);
      return [0, 1, 2].map((j) => t[0] * r[0][j] + t[1] * r[1][j] + t[2] * r[2][j] + refMean[j]);
    });
    const cost = (perm: readonly Atom[]) => perm.reduce((acc, h, k) => acc + dot(sub(h.xyz, laid[k]), sub(h.xyz, laid[k])), 0);
    let best = hs as Atom[];
    let least = cost(best);
    for (const perm of permutations(hs as Atom[])) {
      const d = cost(perm);
      if (d < least - 1e-12) [best, least] = [perm, d];
    }
    hsB.forEach((x, k) => (out[at.get(x)!] = [best[k], x]));
  }
  return out;
}

/** Every order of `xs`, the given order first. */
function* permutations<T>(xs: readonly T[]): Generator<T[]> {
  if (xs.length <= 1) {
    yield [...xs];
    return;
  }
  for (let i = 0; i < xs.length; i++) {
    const rest = [...xs.slice(0, i), ...xs.slice(i + 1)];
    for (const p of permutations(rest)) yield [xs[i], ...p];
  }
}

/** Modeler.get_maps: for each map, each of self's atoms' target number (from 1), 0 for one left out. */
export function getMaps(self: Atoms, target: Atoms, o: MapOptions = {}): number[][] {
  const atoms_map = orderedMaps(self, target, o);
  return atomsMapNumbers(self, atoms_map);
}

/** get_maps' numbers from ordered maps. */
export function atomsMapNumbers(self: Atoms, atoms_map: Chain[]): number[][] {
  const return_chains: number[][] = [];
  for (const chain of atoms_map) {
    const chain_target = chain.map((pr) => pr[0]);
    const chain_self = chain.map((pr) => pr[1]);
    const return_nums: number[] = [];
    for (const atom_self of self) {
      const i = chain_self.indexOf(atom_self);
      return_nums.push(i < 0 ? 0 : chain_target[i].number);
    }
    return_chains.push(return_nums);
  }
  return return_chains;
}

/** Modeler.get_mapped: self's atoms (with their bonds) in target's order, one Atoms a map - none at all if any map leaves an atom out. */
export function getMapped(self: Atoms, target: Atoms, o: MapOptions = {}): Atoms[] {
  return atomsMapped(self, target, orderedMaps(self, target, o));
}

/** get_mapped's structures from ordered maps. */
export function atomsMapped(self: Atoms, target: Atoms, atoms_map: Chain[]): Atoms[] {
  const return_list: Atoms[] = [];
  for (const chain of atoms_map) {
    const chain_target = chain.map((pr) => pr[0]);
    const chain_self = chain.map((pr) => pr[1]);
    const return_atoms = new Atoms();
    const mapped_numbers: number[] = [];
    for (const atom_target of target) {
      const i = chain_target.indexOf(atom_target);
      if (i < 0) return []; // could not map atoms properly
      const atom_self = chain_self[i];
      return_atoms.append(atom_self);
      mapped_numbers.push(atom_self.number);
    }
    if (self.hasBonds()) {
      return_atoms.initBonds();
      for (const [fa, fb, val] of self.bondsDict()) {
        const _from = mapped_numbers.indexOf(fa) + 1;
        const _to = mapped_numbers.indexOf(fb) + 1;
        if (_from === 0 || _to === 0) continue;
        return_atoms.setBond(_from, _to, val);
      }
    }
    return_list.push(return_atoms);
  }
  return return_list;
}
