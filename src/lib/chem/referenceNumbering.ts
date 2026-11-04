/**
 * A molecule's equivalent atoms numbered as a reference's are - the light
 * way, for geometries of one structure in one numbering (docs/ATOM-MAPPING.md,
 * *Conformers of a mapped structure*): a conformer may put two equivalent
 * atoms (a CH2's hydrogens, two like branches of one atom) each in the
 * other's place. Its shape is the same; its numbers say otherwise, and what
 * holds atoms by number (an atom map, a torsion restraint) then names the
 * wrong one. Here those atoms' numbers are swapped, the geometry left as it
 * is, so that each is where the reference has it - as ConfoTS's
 * `map_numbers` does, without a full atom map (lib/chem/reactionMap
 * `mapOnto`), which is many times slower on a large molecule.
 *
 * - **Centres**, read on the reference, as `map_numbers` reads them:
 *   - an atom of four neighbours with two or three alike (not four): the
 *     sign of the volume its neighbours span, taken in the order of their
 *     numbers;
 *   - an atom of three, with one double bond and its two other neighbours
 *     alike: which of those is across the double bond from its partner's
 *     lowest-numbered other neighbour (the torsion beyond 90°);
 *   - such an atom at the end of an allene: the sign of the volume of the
 *     four atoms on the allene's ends, taken in the order of their numbers.
 * - **Alike**: two neighbours of a centre are alike where an automorphism of
 *   the structure takes each onto the other and fixes every atom outside
 *   their branches (the atoms reached from them but not through the
 *   centre) - the constitution only, each atom's element, charge, mass
 *   number and unpaired electrons and each bond's order, an aromatic ring as
 *   one form (lib/chem/identity `symmetryOrbits`); no configuration. Two
 *   branches with other atoms layer by layer out from the centre are not
 *   searched, as `map_numbers` compares them first.
 * - **Swapped**: two branches apart are swapped whole, atom for atom, as
 *   their automorphism pairs them; two in one ring, by the automorphism
 *   (the ring turned over about the centre).
 * - **Every centre** is set as the reference's, in turn, until a pass sets
 *   none; then each is read again. A centre that is not as the reference's
 *   then - no swap of its alike neighbours sets it - is not resolved, and
 *   the geometry is given no numbering at all.
 */
import { aromaticForm, symmetryOrbits } from "./identity";
import { AROMATIC_BOND } from "./kekulize";
import type { EntryAtom, EntryBond } from "../entry";
import type { Molecule } from "./molecule";

/** A structure as its numbering is matched: its atoms and bonds, in the reference's numbering. */
export type NumberedStructure = { atoms: readonly EntryAtom[]; bonds: readonly EntryBond[] };

/** A centre of the reference: its atom, how it is read, the atoms read (from 0) and what they read there, and the swaps that turn it, each a permutation of the atoms. */
export type NumberingCentre = { atom: number; kind: "tetrahedral" | "double bond" | "allene"; atoms: number[]; reference: boolean; swaps: number[][] };

/** A coordination bond's order, as the symmetry search tells it from others. */
const COORDINATION = 8;

type V = [number, number, number];
const at = (xyz: readonly number[], i: number): V => [xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Whether the volume four atoms span, taken in the order of their numbers, is positive. */
function volumeSign(place: (i: number) => V, atoms: readonly number[]): boolean {
  const [o, ...rest] = [...atoms].sort((p, q) => p - q).map(place);
  const [u, v, w] = rest.map((x) => sub(x, o));
  return dot(u, cross(v, w)) > 0;
}

/** Whether the torsion a-b-c-d is beyond 90° either way. */
function across(place: (i: number) => V, [a, b, c, d]: readonly number[]): boolean {
  const b1 = sub(place(b), place(a));
  const b2 = sub(place(c), place(b));
  const b3 = sub(place(d), place(c));
  return dot(cross(b1, b2), cross(b2, b3)) < 0;
}

function read(centre: Pick<NumberingCentre, "kind" | "atoms">, place: (i: number) => V): boolean {
  return centre.kind === "double bond" ? across(place, centre.atoms) : volumeSign(place, centre.atoms);
}

/** Whether `g` takes every bond onto a bond of the same order. */
function keepsBonds(g: readonly number[], bonds: readonly EntryBond[], orderOf: Map<string, number>): boolean {
  return bonds.every((b) => orderOf.get(pairKey(g[b.a1], g[b.a2])) === orderOf.get(pairKey(b.a1, b.a2)));
}

const pairKey = (x: number, y: number) => (x < y ? `${x},${y}` : `${y},${x}`);

/**
 * The reference's centres (see above), each with the swaps of its alike
 * neighbours, pair by pair in the order of their numbers - read once for
 * every geometry matched against it.
 */
export function numberingCentres(s: NumberedStructure, referenceXyz: readonly number[]): NumberingCentre[] {
  const n = s.atoms.length;
  const nbrs: number[][] = s.atoms.map(() => []);
  for (const b of s.bonds) {
    nbrs[b.a1].push(b.a2);
    nbrs[b.a2].push(b.a1);
  }
  for (const x of nbrs) x.sort((p, q) => p - q);
  // (each atom as the search tells it: element, mass number and unpaired electrons in one key, its charge as itself)
  const key = (a: EntryAtom) => [a.el, a.isotope ?? "", a.radical ?? ""].join("/");
  const bonds = s.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.coordination ? COORDINATION : b.order }));
  // (each bond's order as the search reads it: an aromatic ring's bonds as one order, whichever Kekulé structure it holds)
  const orderOf = new Map(aromaticForm({ atoms: s.atoms.map((a) => ({ el: a.el })), bonds }).bonds.map((b) => [pairKey(b.a, b.b), b.order]));
  const branch = (c: number, root: number): Set<number> => {
    const seen = new Set([root]);
    const queue = [root];
    while (queue.length)
      for (const y of nbrs[queue.shift()!])
        if (y !== c && !seen.has(y)) {
          seen.add(y);
          queue.push(y);
        }
    return seen;
  };
  /** A branch's atoms layer by layer out from the centre `c`, from `root`: each layer's elements and bond counts, as one text. */
  const layers = (c: number, root: number): string => {
    const seen = new Set([c, root]);
    let layer = [root];
    const out: string[] = [];
    while (layer.length) {
      out.push(layer.map((x) => `${key(s.atoms[x])}:${nbrs[x].length}`).sort().join(","));
      const next: number[] = [];
      for (const x of layer)
        for (const y of nbrs[x])
          if (!seen.has(y)) {
            seen.add(y);
            next.push(y);
          }
      layer = next;
    }
    return out.join("|");
  };
  /** The swap of u and v about c, where they are alike; none where not. */
  const swapOf = (c: number, u: number, v: number): number[] | null => {
    const bu = branch(c, u);
    const bv = branch(c, v);
    const identity = () => Array.from({ length: n }, (_, i) => i);
    // (two lone atoms of one kind - a CH2's hydrogens, a CF3's fluorines - swap as they are)
    if (bu.size === 1 && bv.size === 1) {
      const g = identity();
      [g[u], g[v]] = [v, u];
      return g;
    }
    // (branches whose atoms differ, layer by layer from the centre - their elements and how many bonds each has - are not alike: no search)
    if (bu.size !== bv.size || layers(c, u) !== layers(c, v)) return null;
    // (the search on the centre and the two branches alone, the centre held: nothing beyond them can move, as they meet the rest only at the centre)
    const sub = [c, ...new Set([...bu, ...bv])];
    const at = new Map(sub.map((x, k) => [x, k]));
    const { automorphisms: found0 } = symmetryOrbits({
      atoms: sub.map((x, k) => ({ el: k === 0 ? `${key(s.atoms[x])}#centre` : key(s.atoms[x]), ...(s.atoms[x].charge ? { charge: s.atoms[x].charge } : {}) })),
      bonds: bonds.filter((b) => at.has(b.a) && at.has(b.b)).map((b) => ({ a: at.get(b.a)!, b: at.get(b.b)!, order: b.order })),
    });
    // (each as a permutation of all the atoms: those not in the search where they are)
    const automorphisms = found0.map((g) => {
      const whole = identity();
      sub.forEach((x, k) => (whole[x] = sub[g[k]]));
      return whole;
    });
    // (an automorphism taking u to v and v to u: the orbit of the pair under those found, walked)
    const start = `${u},${v}`;
    const how = new Map<string, number[]>([[start, identity()]]);
    const queue = [start];
    let found: number[] | null = null;
    while (queue.length && !found) {
      const k = queue.shift()!;
      const h = how.get(k)!;
      for (const g of automorphisms) {
        const next = h.map((x) => g[x]);
        const nk = `${next[u]},${next[v]}`;
        if (how.has(nk)) continue;
        how.set(nk, next);
        if (next[u] === v && next[v] === u) {
          found = next;
          break;
        }
        queue.push(nk);
      }
    }
    if (!found) return null;
    const ring = [...bu].some((x) => bv.has(x));
    if (ring) return found;
    // (branches apart: each swapped whole for the other, atom for atom, everything else where it is)
    const g = Array.from({ length: n }, (_, i) => i);
    for (const x of bu) {
      g[x] = found[x];
      g[found[x]] = x;
    }
    return keepsBonds(g, s.bonds, orderOf) ? g : found;
  };
  const place = (i: number) => at(referenceXyz, i);
  const doubles = (i: number) => nbrs[i].filter((j) => orderOf.get(pairKey(i, j)) === 2);
  const singles = (i: number) => nbrs[i].filter((j) => orderOf.get(pairKey(i, j)) === 1 || orderOf.get(pairKey(i, j)) === AROMATIC_BOND);
  const centres: NumberingCentre[] = [];
  for (let c = 0; c < n; c++) {
    const ns = nbrs[c];
    // (which of its neighbours could be alike, by what they are and how they are bonded - read first, so that only a centre's are searched)
    const like = (u: number, v: number) => key(s.atoms[u]) === key(s.atoms[v]) && orderOf.get(pairKey(c, u)) === orderOf.get(pairKey(c, v));
    const alike = (candidates: readonly [number, number][]) =>
      candidates.flatMap(([u, v]) => {
        const g = like(u, v) ? swapOf(c, u, v) : null;
        return g ? [{ u, v, g }] : [];
      });
    if (ns.length === 4) {
      const pairs = alike(ns.flatMap((u, i) => ns.slice(i + 1).map((v) => [u, v] as [number, number])));
      // (four alike: any two swapped turn it, as any two others do - read as ConfoTS reads it, not at all)
      if (!pairs.length || pairs.length > 3) continue;
      centres.push({ atom: c, kind: "tetrahedral", atoms: [...ns], reference: volumeSign(place, ns), swaps: pairs.map((p) => p.g) });
      continue;
    }
    if (ns.length !== 3) continue;
    // (three neighbours: one by a double bond, the other two alike)
    const d = doubles(c);
    if (d.length !== 1) continue;
    const partner = d[0];
    const [u, v] = ns.filter((x) => x !== partner);
    const pairs = alike([[u, v]]);
    if (!pairs.length) continue;
    const swaps = pairs.map((p) => p.g);
    if (doubles(partner).length === 2 && nbrs[partner].length === 2) {
      // (an allene's end: the four atoms on its two ends)
      const end = doubles(partner).find((x) => x !== c)!;
      const four = [...singles(c), ...singles(end)];
      if (four.length !== 4) continue;
      centres.push({ atom: c, kind: "allene", atoms: four, reference: volumeSign(place, four), swaps });
      continue;
    }
    const beyond = nbrs[partner].filter((x) => x !== c);
    if (!beyond.length) continue;
    const atoms = [Math.min(u, v), c, partner, beyond[0]];
    centres.push({ atom: c, kind: "double bond", atoms, reference: across(place, atoms), swaps });
  }
  return centres;
}

/**
 * The numbering that sets every centre of `centres` in `xyz` (the same
 * structure, in the reference's numbering) as it is in the reference:
 * `order[i]` the atom of `xyz` that is atom `i` now - every atom where it
 * was, where none needed to move. Or the centres not resolved (from 0).
 */
export function matchedNumbering(centres: readonly NumberingCentre[], xyz: readonly number[]): { order: number[] } | { unresolved: number[] } {
  const n = xyz.length / 3;
  let p = Array.from({ length: n }, (_, i) => i);
  const as = (q: readonly number[]) => (i: number) => at(xyz, q[i]);
  for (let pass = 0; pass <= centres.length; pass++) {
    let changed = false;
    for (const c of centres) {
      if (read(c, as(p)) === c.reference) continue;
      for (const g of c.swaps) {
        const q = g.map((x) => p[x]);
        if (read(c, as(q)) !== c.reference) continue;
        p = q;
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  const unresolved = centres.filter((c) => read(c, as(p)) !== c.reference).map((c) => c.atom);
  return unresolved.length ? { unresolved } : { order: p };
}

/**
 * Each of `conformers` - geometries of `reference`'s own structure, its
 * atoms and bonds in its numbering - with its equivalent atoms numbered as
 * `reference` has them: `order[i]` the conformer's atom that is atom `i`
 * now. Or why not: other atoms or bonds than the reference's, or a centre
 * not resolved.
 */
export function numberedLike(reference: Molecule, conformers: readonly Molecule[]): ({ order: number[] } | { why: string })[] {
  const atom = (a: Molecule["atoms"][number]) => `${a.el}|${a.isotope ?? ""}|${a.charge ?? 0}|${a.radical ?? ""}`;
  const bondKeys = (m: Molecule) => new Set(m.bonds.map((b) => `${Math.min(b.a1, b.a2)}-${Math.max(b.a1, b.a2)}:${b.order}`));
  const s: NumberedStructure = {
    atoms: reference.atoms.map((a) => ({ el: a.el, ...(a.isotope ? { isotope: a.isotope } : {}), ...(a.charge ? { charge: a.charge } : {}), ...(a.radical ? { radical: a.radical } : {}) })),
    bonds: reference.bonds.map((b) => ({ a1: b.a1, a2: b.a2, order: b.order as EntryBond["order"] })),
  };
  const theirs = bondKeys(reference);
  let centres: NumberingCentre[] | null = null;
  return conformers.map((c) => {
    if (c.atoms.length !== reference.atoms.length) return { why: `It has ${c.atoms.length} atoms and the reference ${reference.atoms.length}: both must hold the same atoms in one numbering.` };
    const bad = c.atoms.findIndex((a, i) => atom(a) !== atom(reference.atoms[i]));
    if (bad >= 0) return { why: `Atom ${bad + 1} is ${c.atoms[bad].el} here and ${reference.atoms[bad].el} in the reference: both must hold the same atoms in one numbering.` };
    const mine = bondKeys(c);
    if (mine.size !== theirs.size || [...mine].some((k) => !theirs.has(k))) return { why: "Its bonds are not the reference's: both must be bonded alike, in one numbering." };
    centres ??= numberingCentres(s, reference.atoms.flatMap((a) => [a.x, a.y, a.z]));
    const r = matchedNumbering(centres, c.atoms.flatMap((a) => [a.x, a.y, a.z]));
    if ("order" in r) return r;
    const at = r.unresolved.map((i) => `${reference.atoms[i].el}${i + 1}`).join(", ");
    return { why: `Not resolved at ${at}: no swap of ${r.unresolved.length === 1 ? "its" : "their"} alike neighbours sets ${r.unresolved.length === 1 ? "it" : "them"} as in the reference.` };
  });
}

/**
 * A conformer's numbering through its representative: `map[i]` the
 * representative's atom that is atom `i` of the reference it was mapped
 * onto (`mapOnto`'s order), `conformer[k]` the conformer's atom that is the
 * representative's atom `k` (`numberedLike`'s) - the conformer's atom that
 * is atom `i` of the reference.
 */
export function throughRepresentative(map: readonly number[], conformer: readonly number[]): number[] {
  return map.map((k) => conformer[k]);
}
