/**
 * A molecule's atoms numbered as IUPAC numbers the parent of its name, as far as rules without a name reach (foundation part 16, level 1:
 * the skeleton's own numbering). The 2013 recommendations, cited by rule number: P-14.3.5 (the lowest locants), P-14.4 (the order in which
 * features take them), P-22.2 (one ring with heteroatoms), P-29.2 (a substituent's free valence), P-31.1.4 (multiple bonds), P-44.1 to
 * P-44.4 (the parent), P-45.2 (still tied).
 *
 * What it gives, for one connected molecule's heavy atoms:
 * - `order`: the atoms in the order 1 to N - the parent's atoms with plain-number locants at their numbers, its lettered and primed atoms
 *   after them, then each substituent whole, in the order of the parent's atoms they hang from (Meno's own convention: docs/ATOM-MAPPING.md,
 *   *IUPAC numbering*);
 * - `locant`: each parent atom's locant within its unit, as a base and an optional superscript - never one string;
 * - `shown`: what the drawing shows: a parent atom its locant, any other atom its place in `order`;
 * - `own`: the atoms a rule did not place, each with why.
 *
 * The core takes no symmetry search of its own (lib/chem/identity is outside it): the molecule's orbits come in with it, as do the CIP
 * descriptors where it has them. Without orbits every tie a rule cannot break is said (`own`), never guessed as a symmetry.
 */
import type { ChemAtom, ChemBond } from "./graph";
import { factsOf } from "./facts";
import { valencesAt } from "./hydrogens";
import { kekuleOrders, AROMATIC_BOND } from "./kekule";
import { LOCANT_PARENTS, type EntryLocant } from "./locantParents";
import { vonBaeyer } from "./vonBaeyer";
import { CLASS, groupsOf, type Group } from "./locantGroups";

/** A locant as written: its base ("1", "4a", "2'") and a superscript where it has one (pyrene's 3a with a superscript 1). */
export type Locant = { base: string; sup?: string };

/** Why an atom's number is Meno's own and no rule's. */
export type OwnWhy = "needs the name" | "not built" | "over the budget";

export type LocantAtom = ChemAtom & { isotope?: number };

export type LocantsInput = {
  atoms: readonly LocantAtom[];
  bonds: readonly ChemBond[];
  /**
   * Each atom's orbit under the molecule's symmetry - of its aromatic form, its configuration kept (lib/chem/identity `symmetryOrbits`):
   * two atoms in one orbit have the same number. Left out, no tie is taken for a symmetry.
   */
  orbits?: readonly number[];
  /** Each atom's CIP descriptor where it has one (R, S, r, s), and each double bond's by its index (E, Z): P-14.4 (j). */
  descriptors?: { atoms?: ReadonlyMap<number, string>; bonds?: ReadonlyMap<number, string> };
  /** The work tied parents may take (`TIED_PARENTS_BUDGET`, the default): a test sets it lower to reach the guard without the wait. */
  tiedParentsBudget?: number;
};

export type Locants = {
  order: number[];
  locant: (Locant | null)[];
  shown: Locant[];
  own: { atom: number; why: OwnWhy }[];
};

/** The order of the heteroatoms for numbering (P-14.4, P-22.2.3.2, P-31.1.4.2.4): earlier is more senior. */
const NUMBERING_SENIORITY = ["F", "Cl", "Br", "I", "O", "S", "Se", "Te", "N", "P", "As", "Sb", "Bi", "Si", "Ge", "Sn", "Pb", "B", "Al", "Ga", "In", "Tl"];
/** The order of the heteroatoms for a ring system's seniority (P-44.2.1 (c)): N first, then as for numbering. */
const RING_SENIORITY = ["N", "F", "Cl", "Br", "I", "O", "S", "Se", "Te", "P", "As", "Sb", "Bi", "Si", "Ge", "Sn", "Pb", "B", "Al", "Ga", "In", "Tl"];
/** The order of P-44.2.1 (g): N after Te. */
const RING_COUNT_SENIORITY = NUMBERING_SENIORITY;
/** P-44.1.2: the element a parent is chosen by, earliest first (carbon last). */
const PARENT_ELEMENTS = ["N", "P", "As", "Sb", "Bi", "Si", "Ge", "Sn", "Pb", "B", "Al", "Ga", "In", "Tl", "O", "S", "Se", "Te", "C"];
/** Of those, the ones an acyclic atom counts for (P-44.1.2; N only in an N-N chain: class 21). */
const ACYCLIC_PARENT = new Set(["P", "As", "Sb", "Bi", "Si", "Ge", "Sn", "Pb", "B", "Al", "Ga", "In", "Tl"]);
/** Elements that never hold a ring double bond (K2): their ring bonds use all they have. */
const NEVER_DOUBLE = new Set(["O", "S", "Se", "Te"]);

const rank = (list: readonly string[], el: string) => {
  const k = list.indexOf(el);
  return k < 0 ? list.length : k;
};

/** A locant's place in the order of P-14.3.5: its number, then its letter (4 before 4a before 5), then its primes, then its superscript. */
type Key = readonly number[];

const compareKeys = (p: Key, q: Key): number => {
  for (let k = 0; k < Math.max(p.length, q.length); k++) {
    const d = (p[k] ?? -1) - (q[k] ?? -1);
    if (d) return d;
  }
  return 0;
};

/** Two sets of locants compared term by term, each sorted; the first point of difference decides (P-14.3.5). Negative where `p` is lower. */
function compareSets(p: readonly Key[], q: readonly Key[]): number {
  const a = [...p].sort(compareKeys);
  const b = [...q].sort(compareKeys);
  for (let k = 0; k < Math.min(a.length, b.length); k++) {
    const d = compareKeys(a[k], b[k]);
    if (d) return d;
  }
  return a.length - b.length;
}

/** A plain locant. */
const plain = (n: number): { key: Key; locant: Locant } => ({ key: [n], locant: { base: String(n) } });

/** One way of numbering a unit: its atoms in order, each with its locant and the key it is compared by. */
type Candidate = { atoms: number[]; keys: Key[]; locants: Locant[] };

/** A unit of the molecule (A2): a ring system, a carbon chain, or one acyclic atom that is not carbon. */
type Unit = { kind: "ring" | "chain" | "atom" | "assembly"; atoms: number[]; ringSystem?: number; systems?: number[]; parts?: number[][] };

type Ctx = {
  input: LocantsInput;
  heavy: boolean[];
  around: number[][];
  bondIndex: (a: number, b: number) => number;
  orders: number[];
  inRing: boolean[];
  systemOf: number[];
  systems: readonly { atoms: number[]; rings: number[] }[];
  rings: readonly (readonly number[])[];
  /** Level 2: the principal characteristic groups (locantGroups), each held by a parent where it sits (`heldIn`). */
  principal?: readonly Group[];
  /** Level 2: every characteristic group found, principal or not. */
  groups?: readonly Group[];
  /** Each heavy atom's hydrogens of a given mass number (2H, 3H), the heaviest: 0 where it has none. */
  labelledH: number[];
};

function contextOf(input: LocantsInput): Ctx {
  const f = factsOf(input);
  const heavy = input.atoms.map((a) => a.el !== "H");
  const around = f.around.map((ns, i) => (heavy[i] ? ns.filter((j) => heavy[j]) : []));
  // (aromatic bonds given as one Kekule form: saturation is read on single and double bonds)
  const orders = input.bonds.some((b) => b.order === AROMATIC_BOND)
    ? kekuleOrders(
        input.atoms,
        input.bonds.map((b) => ({ a1: b.a, a2: b.b, order: b.order })),
      )
    : input.bonds.map((b) => b.order);
  const systemOf = input.atoms.map(() => -1);
  f.ringSystems.forEach((s, k) => s.atoms.forEach((i) => (systemOf[i] = k)));
  const inRing = input.atoms.map((_, i) => systemOf[i] >= 0);
  const labelledH = input.atoms.map((_, i) => (heavy[i] ? Math.max(0, ...f.around[i].filter((j) => !heavy[j]).map((j) => input.atoms[j].isotope ?? 0)) : 0));
  return { input, heavy, around, bondIndex: (a, b) => f.bondBetween(a, b), orders, inRing, systemOf, systems: f.ringSystems, rings: f.rings, labelledH };
}

/** A charge drawn inside a neutral group - a nitro's, an azide's, a diazo's, an isocyanide's - which is no charged group (B7). */
function neutralInside(c: Ctx, i: number): boolean {
  const q = c.input.atoms[i].charge ?? 0;
  // (an opposite charge on a neighbour: the pair is one neutral group)
  return c.around[i].some((j) => (c.input.atoms[j].charge ?? 0) === -q);
}

/** An atom's hydrogens: as given, else its element's valence less its bonds (Kekule orders). */
function hydrogensAt(c: Ctx, i: number): number {
  const a = c.input.atoms[i];
  if (a.hs != null) return a.hs;
  const used = c.input.bonds.reduce((t, b, k) => (b.a === i || b.b === i ? t + c.orders[k] : t), 0);
  const v = valencesAt(a.el, a.charge ?? 0)[0] ?? 0;
  return Math.max(0, v - used);
}

const orderOf = (c: Ctx, a: number, b: number) => {
  const k = c.bondIndex(a, b);
  return k < 0 ? 0 : c.orders[k];
};

// ---------------------------------------------------------------- the units' own numberings (A4)

/** A ring's atoms in order round it, from a start, either way: the ring's candidates (A4.1). */
function ringCandidates(ring: readonly number[]): Candidate[] {
  const out: Candidate[] = [];
  const n = ring.length;
  for (let s = 0; s < n; s++) {
    for (const dir of [1, -1]) {
      const atoms = Array.from({ length: n }, (_, k) => ring[(s + dir * k + n * 2) % n]);
      out.push({ atoms, keys: atoms.map((_, k) => plain(k + 1).key), locants: atoms.map((_, k) => plain(k + 1).locant) });
    }
  }
  return out;
}

/** A chain's two candidates, one from each end (A4.8). */
function chainCandidates(chain: readonly number[]): Candidate[] {
  const one = (atoms: number[]): Candidate => ({ atoms, keys: atoms.map((_, k) => plain(k + 1).key), locants: atoms.map((_, k) => plain(k + 1).locant) });
  return chain.length === 1 ? [one([...chain])] : [one([...chain]), one([...chain].reverse())];
}

/** Those of `cands` whose `score` is least (compared by `cmp`), all of them where every one ties. */
function keepLeast<T>(cands: Candidate[], score: (c: Candidate) => T, cmp: (p: T, q: T) => number): Candidate[] {
  if (cands.length < 2) return cands;
  const scored = cands.map((c) => ({ c, s: score(c) }));
  let best = scored[0].s;
  for (const x of scored) if (cmp(x.s, best) < 0) best = x.s;
  return scored.filter((x) => cmp(x.s, best) === 0).map((x) => x.c);
}

const keyIn = (c: Candidate) => {
  const m = new Map<number, Key>();
  c.atoms.forEach((a, k) => m.set(a, c.keys[k]));
  return m;
};

/** One ring with heteroatoms (P-22.2.2.1.3, P-22.2.3.2): 1 to the senior heteroatom, then all as a set, then by seniority (A4.2). */
function heteroRingRules(c: Ctx, cands: Candidate[]): Candidate[] {
  const el = (a: number) => c.input.atoms[a].el;
  const hetero = cands[0].atoms.filter((a) => el(a) !== "C");
  if (!hetero.length) return cands;
  const senior = Math.min(...hetero.map((a) => rank(NUMBERING_SENIORITY, el(a))));
  let left = cands.filter((cd) => rank(NUMBERING_SENIORITY, el(cd.atoms[0])) === senior && el(cd.atoms[0]) !== "C");
  if (!left.length) left = cands;
  left = keepLeast(left, (cd) => { const k = keyIn(cd); return hetero.map((a) => k.get(a)!); }, compareSets);
  return bySeniorityOrder(c, left, hetero);
}

/** The lower locants to the more senior heteroatoms, element by element (P-22.2.3.2, P-25.3.3.1.2 (b), P-23.3.2.2). */
function bySeniorityOrder(c: Ctx, cands: Candidate[], hetero: readonly number[]): Candidate[] {
  const els = [...new Set(hetero.map((a) => c.input.atoms[a].el))].sort((p, q) => rank(NUMBERING_SENIORITY, p) - rank(NUMBERING_SENIORITY, q));
  let left = cands;
  for (const e of els) {
    const of = hetero.filter((a) => c.input.atoms[a].el === e);
    left = keepLeast(left, (cd) => { const k = keyIn(cd); return of.map((a) => k.get(a)!); }, compareSets);
  }
  return left;
}

// ---------------------------------------------------------------- fused systems (A4.4, A4.5)

/** A lettered or interior locant's key (P-14.3.5): its number, its letter (a 1, b 2, ...), no primes, its superscript. */
function keyOfText(base: string, sup?: string): Key {
  const m = /^(\d+)([a-z]?)$/.exec(base)!;
  return [Number(m[1]), m[2] ? m[2].charCodeAt(0) - 96 : 0, 0, sup ? Number(sup) : 0];
}

/**
 * Two rings sharing one bond, each of five or more atoms (A4.4; P-25.3.3.1.1 with P-25.3.2.3): the four candidates - from a non-fusion atom
 * next to a fusion atom, round the edge away from it; a fusion carbon takes the number before it with a letter (4a), a fusion heteroatom
 * is numbered in its turn (indolizine's N4).
 */
function twoRingFused(c: Ctx, sys: { atoms: number[]; rings: number[] }): Candidate[] {
  if (sys.rings.length !== 2) return [];
  const [r, s] = sys.rings.map((k) => c.rings[k]);
  if (r.length < 5 || s.length < 5) return [];
  const shared = r.filter((a) => s.includes(a));
  if (shared.length !== 2 || c.bondIndex(shared[0], shared[1]) < 0) return [];
  // (the periphery: every atom of the system once, round its edge)
  const next = new Map<number, number[]>();
  for (const ring of [r, s]) {
    ring.forEach((a, k) => {
      const b = ring[(k + 1) % ring.length];
      if (shared.includes(a) && shared.includes(b)) return;
      next.set(a, [...(next.get(a) ?? []), b]);
      next.set(b, [...(next.get(b) ?? []), a]);
    });
  }
  const out: Candidate[] = [];
  for (const f of shared) {
    for (const start of next.get(f)!) {
      const atoms = [start];
      let prev = f;
      while (atoms.length < sys.atoms.length) {
        const here = atoms[atoms.length - 1];
        const on = next.get(here)!.find((x) => x !== prev)!;
        prev = here;
        atoms.push(on);
      }
      let n = 0;
      let letter = 0;
      const locs = atoms.map((a) => {
        if (shared.includes(a) && c.input.atoms[a].el === "C") {
          letter++;
          return { base: `${n}${String.fromCharCode(96 + letter)}` };
        }
        n++;
        letter = 0;
        return { base: String(n) };
      });
      out.push({ atoms, locants: locs, keys: locs.map((l) => keyOfText(l.base)) });
    }
  }
  return out;
}

/**
 * Whether a ring system is named as von Baeyer names one (A4.3): every bridged system - two of its smallest rings sharing three atoms or
 * more - and a system of rings sharing bonds of which fewer than two have five members or more (P-52.2.4.1: bicyclo[4.2.0]octane). A
 * bridged system holding two rings of five or more that share exactly one bond is a bridged FUSED system in the text (P-25.4.1.1,
 * P-44.2.2.2): numbered von Baeyer's way here and said (`bridged fused`). Null for a fused or spiro system.
 */
function vonBaeyerKind(c: Ctx, sys: { atoms: number[]; rings: number[] }): "von Baeyer" | "bridged fused" | null {
  const rings = sys.rings.map((k) => c.rings[k]);
  const sharedAtoms = (r: readonly number[], s: readonly number[]) => r.filter((a) => s.includes(a)).length;
  let bridged = false;
  let fusedLarge = false;
  let sharesBond = false;
  for (let i = 0; i < rings.length; i++) {
    for (let j = i + 1; j < rings.length; j++) {
      const n = sharedAtoms(rings[i], rings[j]);
      if (n >= 3) bridged = true;
      if (n === 2) {
        sharesBond = true;
        if (rings[i].length >= 5 && rings[j].length >= 5) fusedLarge = true;
      }
    }
  }
  const large = rings.filter((r) => r.length >= 5).length;
  if (bridged) return fusedLarge ? "bridged fused" : "von Baeyer";
  if (sharesBond && large < 2) return "von Baeyer";
  return null;
}

/**
 * A spiro system whose every component is a single ring, its rings in a row (A4.6; P-24.2.1 to P-24.2.3): from a terminal ring - the
 * smaller - at an atom next to its spiro atom, round it, through the spiro atom, by the shorter way round each ring to the next spiro atom,
 * round the far terminal ring, and back the other way through the rest. Kept: the spiro atoms' locants as low as they can be
 * (P-24.2.2.1, P-24.2.3.1), then the descriptor's numbers in the order cited (P-24.2.2.2, P-24.2.3.2). Null where the system is no spiro
 * system of single rings in a row; empty where it is one of another shape (branched: not built).
 */
function spiroCandidates(c: Ctx, sys: { atoms: number[]; rings: number[] }): Candidate[] | null {
  const rings = sys.rings.map((k) => c.rings[k]);
  if (rings.length < 2) return null;
  const meets = (r: readonly number[], q: readonly number[]) => r.filter((a) => q.includes(a));
  for (let i = 0; i < rings.length; i++) for (let j = i + 1; j < rings.length; j++) if (meets(rings[i], rings[j]).length > 1) return null;
  // (the rings as a row: each meets at most two others, through one atom each)
  const links = rings.map((r, i) => rings.map((q, j) => (i !== j && meets(r, q).length === 1 ? j : -1)).filter((j) => j >= 0));
  if (links.some((l) => l.length > 2)) return [];
  const ends = links.map((l, i) => (l.length === 1 ? i : -1)).filter((i) => i >= 0);
  if (ends.length !== 2) return [];
  const row: number[] = [ends[0]];
  while (row.length < rings.length) row.push(links[row[row.length - 1]].find((j) => !row.includes(j))!);
  const out: Candidate[] = [];
  const sizes = [rings[row[0]].length, rings[row[row.length - 1]].length];
  for (const order of [row, [...row].reverse()]) {
    // (from the smaller terminal ring; from either where they are alike)
    if (rings[order[0]].length > rings[order[order.length - 1]].length && sizes[0] !== sizes[1]) continue;
    const spiroAt = order.slice(0, -1).map((r, k) => meets(rings[r], rings[order[k + 1]])[0]);
    // (each middle ring's way: the shorter arc there, the longer back; both tried where alike - and the first ring's start, either side)
    const choices = order.length;
    for (let mask = 0; mask < 1 << choices; mask++) {
      const atoms: number[] = [];
      const arc = (ring: readonly number[], from: number, to: number, dir: 1 | -1) => {
        const n = ring.length;
        const out2: number[] = [];
        // (from the atom after `from`, up to `to` and not it: all the way round where the two are one)
        let k = (ring.indexOf(from) + dir + n) % n;
        while (ring[k] !== to) {
          out2.push(ring[k]);
          k = (k + dir + n) % n;
        }
        return out2;
      };
      const firstRing = rings[order[0]];
      const s0 = spiroAt[0];
      const dir0: 1 | -1 = mask & 1 ? 1 : -1;
      // (round the first ring from the spiro atom's neighbour, all the way, to the spiro atom)
      atoms.push(...arc(firstRing, s0, s0, dir0), s0);
      const back: number[][] = [];
      for (let k = 1; k < order.length; k++) {
        const ring = rings[order[k]];
        const from = spiroAt[k - 1];
        if (k === order.length - 1) {
          const dir: 1 | -1 = mask & (1 << k) ? 1 : -1;
          atoms.push(...arc(ring, from, from, dir));
          break;
        }
        const to = spiroAt[k];
        const a1 = arc(ring, from, to, 1);
        const a2 = arc(ring, from, to, -1);
        const [short, long] = a1.length < a2.length ? [a1, a2] : a2.length < a1.length ? [a2, a1] : mask & (1 << k) ? [a1, a2] : [a2, a1];
        atoms.push(...short, to);
        back.push([...long].reverse());
      }
      for (let k = back.length - 1; k >= 0; k--) atoms.push(...back[k]);
      if (new Set(atoms).size !== sys.atoms.length || atoms.length !== sys.atoms.length) continue;
      out.push({ atoms, keys: atoms.map((_, k) => plain(k + 1).key), locants: atoms.map((_, k) => plain(k + 1).locant) });
    }
  }
  if (!out.length) return [];
  const spiroAtoms = sys.atoms.filter((a) => rings.filter((r) => r.includes(a)).length > 1);
  let left = keepLeast(out, (cd) => { const k = keyIn(cd); return spiroAtoms.map((a) => k.get(a)!); }, compareSets);
  // (the descriptor's numbers in the order cited: the runs of atoms between the spiro atoms, in the numbering's order)
  const runs = (cd: Candidate) => {
    const isSpiro = new Set(spiroAtoms);
    const r: number[] = [];
    let n = 0;
    for (const a of cd.atoms) {
      if (isSpiro.has(a)) {
        r.push(n);
        n = 0;
      } else n++;
    }
    r.push(n);
    return r;
  };
  left = keepLeast(left, runs, compareKeys);
  // (each candidate once)
  const seen = new Set<string>();
  return left.filter((cd) => {
    const k = cd.atoms.join(",");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** P-25.3.3.1.2 (a) to (d), on a fused system's candidates: heteroatoms as a set; by seniority; fusion carbons low; a fusion heteroatom low. */
function fusedRules(c: Ctx, cands: Candidate[], atoms: readonly number[]): Candidate[] {
  const hetero = atoms.filter((a) => c.input.atoms[a].el !== "C");
  let left = keepLeast(cands, (cd) => { const k = keyIn(cd); return hetero.map((a) => k.get(a)!); }, compareSets);
  left = bySeniorityOrder(c, left, hetero);
  const fusion = (cd: Candidate) => cd.atoms.filter((_a, k) => /[a-z]/.test(cd.locants[k].base));
  left = keepLeast(left, (cd) => { const k = keyIn(cd); return fusion(cd).map((a) => k.get(a)!); }, compareSets);
  return left;
}

/**
 * A fused system matched to an entry of the table (A4.5): its skeleton - atoms, elements, the system's bonds; saturation not looked at - the
 * entry's; each way the entry lies on it (each symmetry of the skeleton) a candidate.
 */
function tableCandidates(c: Ctx, atoms: readonly number[]): Candidate[] {
  const set = new Set(atoms);
  const nb = (a: number) => c.around[a].filter((b) => set.has(b));
  for (const e of LOCANT_PARENTS) {
    if (e.atoms.length !== atoms.length) continue;
    const label = (l: EntryLocant) => (l.sup ? `${l.base}^${l.sup}` : l.base);
    const index = new Map(e.atoms.map((l, k) => [label(l), k]));
    const peri = e.atoms.filter((l) => !l.sup).length;
    const adj: number[][] = e.atoms.map(() => []);
    const link = (p: number, q: number) => {
      adj[p].push(q);
      adj[q].push(p);
    };
    for (let k = 0; k < peri; k++) link(k, (k + 1) % peri);
    for (const [p, q] of e.across) link(index.get(p)!, index.get(q)!);
    const el = (k: number) => e.atoms[k].el ?? "C";
    // (the system's atoms by element and degree: a quick refusal before the search)
    const sig = (xs: string[]) => xs.sort().join(",");
    if (sig(e.atoms.map((_, k) => `${el(k)}${adj[k].length}`)) !== sig(atoms.map((a) => `${c.input.atoms[a].el}${nb(a).length}`))) continue;
    const found: number[][] = [];
    const map: number[] = e.atoms.map(() => -1);
    const used = new Set<number>();
    // (entry atoms in an order that walks the skeleton: each after one of its neighbours)
    const orderE: number[] = [0];
    for (let i = 0; i < orderE.length; i++) for (const q of adj[orderE[i]]) if (!orderE.includes(q)) orderE.push(q);
    const search = (i: number) => {
      if (found.length > 24) return;
      if (i === orderE.length) {
        found.push([...map]);
        return;
      }
      const k = orderE[i];
      const placedNb = adj[k].filter((q) => map[q] >= 0);
      const pool = placedNb.length ? nb(map[placedNb[0]]) : atoms;
      for (const a of pool) {
        if (used.has(a) || c.input.atoms[a].el !== el(k) || nb(a).length !== adj[k].length) continue;
        if (!placedNb.every((q) => c.bondIndex(a, map[q]) >= 0)) continue;
        map[k] = a;
        used.add(a);
        search(i + 1);
        used.delete(a);
        map[k] = -1;
      }
    };
    search(0);
    if (!found.length) continue;
    return found.map((m) => {
      const order = e.atoms.map((_, k) => k).sort((p, q) => compareKeys(keyOfText(e.atoms[p].base, e.atoms[p].sup), keyOfText(e.atoms[q].base, e.atoms[q].sup)));
      return {
        atoms: order.map((k) => m[k]),
        locants: order.map((k) => ({ base: e.atoms[k].base, ...(e.atoms[k].sup ? { sup: e.atoms[k].sup } : {}) })),
        keys: order.map((k) => keyOfText(e.atoms[k].base, e.atoms[k].sup)),
      };
    });
  }
  return [];
}

// ---------------------------------------------------------------- A5: the rest of P-14.4, on the candidates left

/** Whether a ring atom of a system could hold a ring double bond (K2): its standard valence less its ring bonds in the system is 1 or more. */
function couldHoldDouble(c: Ctx, a: number, sys: ReadonlySet<number>): boolean {
  const el = c.input.atoms[a].el;
  if (NEVER_DOUBLE.has(el)) return false;
  const v = valencesAt(el, c.input.atoms[a].charge ?? 0)[0];
  if (v == null) return false;
  const ringBonds = c.around[a].filter((b) => sys.has(b)).length;
  return v - ringBonds >= 1;
}

/** Whether a ring system is named as its fully unsaturated form with hydro prefixes (mancude-named), not with "ene" (A5). */
function mancudeNamed(c: Ctx, atoms: readonly number[], rings: number): boolean {
  if (rings > 1) return false; // (fused systems are mancude-named; their numbering is not built in this slice)
  const n = atoms.length;
  const els = atoms.map((a) => c.input.atoms[a].el);
  const hetero = els.some((e) => e !== "C");
  if (!hetero) return isBenzene(c, atoms);
  if (n < 3 || n > 10) return false;
  // (Hantzsch-Widman: mancude-named unless fully saturated)
  return atoms.some((a) => c.around[a].some((b) => atoms.includes(b) && orderOf(c, a, b) >= 2));
}

function isBenzene(c: Ctx, atoms: readonly number[]): boolean {
  if (atoms.length !== 6 || atoms.some((a) => c.input.atoms[a].el !== "C")) return false;
  const doubles = atoms.filter((a) => c.around[a].some((b) => atoms.includes(b) && orderOf(c, a, b) === 2)).length;
  return doubles === 6;
}

/** A system's saturated positions (K2): atoms that could hold a ring double bond and have none to an atom of the system. */
function saturatedPositions(c: Ctx, atoms: readonly number[]): number[] {
  const sys = new Set(atoms);
  return atoms.filter((a) => couldHoldDouble(c, a, sys) && !c.around[a].some((b) => sys.has(b) && orderOf(c, a, b) === 2));
}

/** Whether the atoms of `atoms` that could hold a ring double bond, `out` left out, can all be paired along the system's bonds. */
function pairable(c: Ctx, atoms: readonly number[], out: ReadonlySet<number>): boolean {
  const sys = new Set(atoms);
  const free = atoms.filter((a) => !out.has(a) && couldHoldDouble(c, a, sys));
  const freeSet = new Set(free);
  const mate = new Map<number, number>();
  const tryAugment = (u: number, seen: Set<number>): boolean => {
    for (const v of c.around[u]) {
      if (!freeSet.has(v) || seen.has(v)) continue;
      seen.add(v);
      const w = mate.get(v);
      if (w == null || tryAugment(w, seen)) {
        mate.set(v, u);
        mate.set(u, v);
        return true;
      }
    }
    return false;
  };
  for (const u of free) if (!mate.has(u) && !tryAugment(u, new Set([u]))) return false;
  return true;
}

/** The count k of indicated hydrogens a mancude-named system needs (K2): its atoms that could hold a double bond and cannot be paired. */
function indicatedCount(c: Ctx, atoms: readonly number[]): number {
  const sys = new Set(atoms);
  const can = atoms.filter((a) => couldHoldDouble(c, a, sys));
  for (let k = 0; k <= can.length; k++) {
    for (const out of subsets(can, k)) if (pairable(c, atoms, new Set(out))) return k;
  }
  return can.length;
}

function* subsets<T>(xs: readonly T[], k: number, from = 0): Generator<T[]> {
  if (k === 0) {
    yield [];
    return;
  }
  for (let i = from; i <= xs.length - k; i++) for (const rest of subsets(xs, k - 1, i + 1)) yield [xs[i], ...rest];
}

/** The lowest set of k saturated positions that, left out, lets every other atom be paired (A5 step 1), as keys; null where none does. */
function indicatedSet(c: Ctx, atoms: readonly number[], cand: Candidate, k: number): Key[] | null {
  if (!k) return [];
  const key = keyIn(cand);
  const sat = saturatedPositions(c, atoms).sort((p, q) => compareKeys(key.get(p)!, key.get(q)!));
  for (const out of subsets(sat, k)) if (pairable(c, atoms, new Set(out))) return out.map((a) => key.get(a)!);
  return null;
}

/** A multiple bond's locant in an ane-named unit: its lower-numbered atom's, compound where its atoms are not numbered one after the other. */
function multipleBonds(c: Ctx, cand: Candidate, unit: ReadonlySet<number>, ord: (a: number, b: number) => number = (a, b) => orderOf(c, a, b)): { key: Key; compound: boolean; triple: boolean }[] {
  const key = keyIn(cand);
  const place = new Map(cand.atoms.map((a, k) => [a, k]));
  const out: { key: Key; compound: boolean; triple: boolean }[] = [];
  for (const a of cand.atoms) {
    for (const b of c.around[a]) {
      if (!unit.has(b) || place.get(b)! < place.get(a)!) continue;
      const o = ord(a, b);
      if (o < 2) continue;
      out.push({ key: key.get(a)!, compound: place.get(b)! - place.get(a)! !== 1, triple: o === 3 });
    }
  }
  return out;
}

/**
 * A benzene ring inside an ane-named unit is compared over its Kekule forms, never the drawn one (K1; P-31.1.4.2.4's
 * bicyclo[4.1.0]hepta-1,3,5-triene): each form of each such ring tried, the best kept. The drawn bonds are not changed.
 */
function bestOverForms(c: Ctx, cand: Candidate, unit: ReadonlySet<number>): ReturnType<typeof multipleBonds> {
  const benzenes = c.rings.filter((r) => r.length === 6 && r.every((a) => unit.has(a) && c.input.atoms[a].el === "C") && isBenzene(c, r));
  let best: ReturnType<typeof multipleBonds> | null = null;
  const flips = Math.min(benzenes.length, 4);
  for (let mask = 0; mask < 1 << flips; mask++) {
    const turned = new Map<number, number>();
    for (let k = 0; k < flips; k++) {
      if (!(mask & (1 << k))) continue;
      const r = benzenes[k];
      r.forEach((a, i) => {
        const b = r[(i + 1) % 6];
        const bi = c.bondIndex(a, b);
        turned.set(bi, (turned.get(bi) ?? c.orders[bi]) === 2 ? 1 : 2);
      });
    }
    const ord = (a: number, b: number) => {
      const bi = c.bondIndex(a, b);
      return bi < 0 ? 0 : (turned.get(bi) ?? c.orders[bi]);
    };
    // (a form in which an atom has two double bonds, or none where it had one, is no Kekule form)
    if (turned.size && [...unit].some((a) => c.around[a].filter((b) => unit.has(b) && ord(a, b) === 2).length > 1)) continue;
    const m = multipleBonds(c, cand, unit, ord);
    if (!best || compareMultiple(m, best) < 0) best = m;
  }
  return best ?? multipleBonds(c, cand, unit);
}

/** P-31.1.4.2, P-31.1.4.3 (K1): fewest compound locants; the set without the parentheses; with them; then the double bonds alone. */
function compareMultiple(p: ReturnType<typeof multipleBonds>, q: ReturnType<typeof multipleBonds>): number {
  const compound = (x: typeof p) => x.filter((m) => m.compound).length;
  const d1 = compound(p) - compound(q);
  if (d1) return d1;
  const d2 = compareSets(p.map((m) => m.key), q.map((m) => m.key));
  if (d2) return d2;
  // (with the second atom's number in parentheses: the compound ones last, which keeps the comparison where it was)
  const withSecond = (x: typeof p) => x.map((m) => [...m.key, m.compound ? 1 : 0]);
  const d3 = compareSets(withSecond(p), withSecond(q));
  if (d3) return d3;
  if (p.some((m) => m.triple) || q.some((m) => m.triple)) return compareSets(p.filter((m) => !m.triple).map((m) => m.key), q.filter((m) => !m.triple).map((m) => m.key));
  return 0;
}

/**
 * A short text of what hangs from `from` away from `parent` (its atoms, their elements, bonds and charges, walked outward and sorted): two
 * groups with the same text are taken as the same group (A5 step 5). A refinement of each atom's neighbourhood, as the canonical ranking's
 * first rounds are; enough to tell apart the groups a molecule carries side by side.
 */
function groupText(c: Ctx, from: number, parent: ReadonlySet<number>): string {
  const atoms: number[] = [];
  const seen = new Set<number>([from]);
  const queue = [from];
  while (queue.length) {
    const u = queue.shift()!;
    atoms.push(u);
    for (const v of c.around[u]) {
      if (seen.has(v) || parent.has(v)) continue;
      seen.add(v);
      queue.push(v);
    }
  }
  const inG = new Set(atoms);
  const atomText = (a: number) => {
    const x = c.input.atoms[a];
    return `${x.el}${x.charge ?? 0}${x.isotope ?? ""}${a === from ? "*" : ""}`;
  };
  const rounds = atoms.length;
  let label = new Map(atoms.map((a) => [a, atomText(a)]));
  let round = 0;
  for (; round < rounds; round++) {
    const next = new Map(atoms.map((a) => [a, `${label.get(a)}(${c.around[a].filter((b) => inG.has(b)).map((b) => `${orderOf(c, a, b)}${label.get(b)}`).sort().join(",")})`]));
    // (compressed to the rank of each text, so that the texts stay short)
    const ranks = new Map([...new Set(next.values())].sort().map((t, i) => [t, i]));
    const classes = new Set(label.values()).size;
    label = new Map(atoms.map((a) => [a, `${atomText(a)}#${ranks.get(next.get(a)!)}`]));
    // (no class parted this round: none will again. Each text from here on starts with its atom's label and "(", so the texts sort as the
    //  labels do - each round after this only renumbers the classes by their labels' order, worked out on one label of each class)
    if (ranks.size === classes) {
      round++;
      break;
    }
  }
  if (round < rounds) {
    // (one label of each class, with its atom's text)
    const textOf = new Map<string, string>();
    for (const a of atoms) textOf.set(label.get(a)!, atomText(a));
    const first = [...textOf.keys()];
    const texts = first.map((t) => textOf.get(t)!);
    const step = (labels: readonly string[]): string[] => {
      const ranks = new Map([...labels].sort().map((t, i) => [t, i]));
      return labels.map((t, i) => `${texts[i]}#${ranks.get(t)}`);
    };
    let now = first;
    const seen = new Map<string, number>();
    for (; round < rounds; round++) {
      const key = now.join(";");
      const was = seen.get(key);
      if (was != null) {
        // (the labels came round again: whole turns of the cycle skipped)
        for (let k = (rounds - round) % (round - was); k > 0; k--) now = step(now);
        break;
      }
      seen.set(key, round);
      now = step(now);
    }
    const final = new Map(first.map((t, i) => [t, now[i]]));
    label = new Map(atoms.map((a) => [a, final.get(label.get(a)!)!]));
  }
  return [...label.values()].sort().join(";");
}

/** The atoms hanging from the parent (A5 step 4): each atom bonded to it and not in it, by the parent atom it hangs from. */
function hangers(c: Ctx, parent: ReadonlySet<number>): { on: number; first: number }[] {
  const out: { on: number; first: number }[] = [];
  for (const a of parent) for (const b of c.around[a]) if (!parent.has(b)) out.push({ on: a, first: b });
  return out;
}

/**
 * A5: on the candidates left after a unit's own rules, P-14.4 (b) to (j) - indicated hydrogen, saturation, substituents, (the first-cited
 * prefix: not built), isotopes, configuration. Returns those left and, where they still differ by more than a symmetry, the atoms whose
 * number would differ (`own`).
 */
/**
 * The atom of a unit (`unit`) that holds the group `g` (level 2): an acid's, an amide's, a nitrile's or an aldehyde's carbon where the
 * unit is a chain ending on it, else the atom it hangs on; an amine's carbon bonded to its N; or none where the unit does not hold it.
 */
function heldIn(c: Ctx, g: Group, unit: ReadonlySet<number>): number | null {
  if (g.carbon != null && unit.has(g.carbon)) return g.carbon;
  if (g.rank === CLASS.amine) return c.around[g.at].find((a) => unit.has(a)) ?? null;
  return unit.has(g.at) ? g.at : null;
}

function a5(
  c: Ctx,
  cands: Candidate[],
  unit: { atoms: readonly number[]; mancude: boolean; indicated: number; parts?: readonly number[][] },
  parent: ReadonlySet<number>,
  from = 1,
): { left: Candidate[]; own: { atoms: number[]; why: OwnWhy } | null } {
  let left = cands;
  const set = new Set(unit.atoms);
  // (an assembly's rings each its own system: their double bonds and saturated positions are each ring's)
  const parts = unit.parts ?? [unit.atoms];
  if (from <= 1 && unit.mancude) {
    const counts = unit.parts ? parts.map((p) => indicatedCount(c, p)) : [unit.indicated];
    if (counts.some((k) => k)) {
      const sets = (cd: Candidate) => {
        const all: Key[] = [];
        for (let i = 0; i < parts.length; i++) {
          const one = indicatedSet(c, parts[i], cd, counts[i]);
          if (!one) return null;
          all.push(...one);
        }
        return all;
      };
      left = keepLeast(left, sets, (p, q) => (p && q ? compareSets(p, q) : p ? -1 : q ? 1 : 0));
    }
  }
  // (level 2, P-14.4 (c): the principal groups' locants as a set, lowest - after indicated hydrogen, before saturation)
  if (from <= 1 && c.principal?.length) {
    const held = c.principal.flatMap((g) => heldIn(c, g, set) ?? []);
    if (held.length) left = keepLeast(left, (cd) => { const k = keyIn(cd); return held.map((a) => k.get(a)!); }, compareSets);
  }
  if (from <= 3) {
    left = unit.mancude
      ? keepLeast(left, (cd) => { const k = keyIn(cd); return parts.flatMap((p) => saturatedPositions(c, p)).map((a) => k.get(a)!); }, compareSets)
      : keepLeast(left, (cd) => bestOverForms(c, cd, set), compareMultiple);
  }
  // (what hangs from this unit's atoms: a multiplied parent's twin and what hangs from it are not its own)
  // (and at level 2 what an amine's N carries besides the parent, as on that N's carbon: N1-(2-aminoethyl)ethane-1,2-diamine)
  const onN = (c.principal ?? []).filter((g) => g.rank === CLASS.amine).flatMap((g) => {
    const on = heldIn(c, g, set);
    return on == null ? [] : c.around[g.at].filter((a) => a !== on && !parent.has(a)).map((first) => ({ on, first }));
  });
  const hang = [...hangers(c, parent).filter((h) => set.has(h.on)), ...onN];
  left = keepLeast(left, (cd) => { const k = keyIn(cd); return hang.map((h) => k.get(h.on)!); }, compareSets);
  if (left.length > 1) {
    // (g) the first-cited prefix: different groups at the tied locants need the alphabet - not built
    const texts = (cd: Candidate) => {
      const k = keyIn(cd);
      return hang.map((h) => `${k.get(h.on)!.join(".")}:${groupText(c, h.first, parent)}`).sort().join("|");
    };
    const t0 = texts(left[0]);
    if (left.some((cd) => texts(cd) !== t0)) return { left, own: { atoms: differing(c, left), why: "needs the name" } };
  }
  // (i) isotopes: the atoms with a mass number, or with a hydrogen of one (2H, 3H), as a set; then the heavier nuclide
  const labelled = unit.atoms.filter((a) => c.input.atoms[a].isotope || c.labelledH[a]);
  if (labelled.length) {
    left = keepLeast(left, (cd) => { const k = keyIn(cd); return labelled.map((a) => k.get(a)!); }, compareSets);
    left = keepLeast(left, (cd) => [...cd.atoms].filter((a) => c.input.atoms[a].isotope).map((a) => -(c.input.atoms[a].isotope ?? 0)), (p, q) => compareKeys(p, q));
  }
  // (j) configuration: R before S, Z before E, r before s, at the first point of difference - a double bond's at its lower-numbered end
  const desc = c.input.descriptors;
  if (desc && (desc.atoms?.size || desc.bonds?.size) && left.length > 1) {
    const order = (d: string | undefined) => (d === "R" || d === "r" || d === "Z" ? 0 : d ? 1 : 2);
    left = keepLeast(
      left,
      (cd) => {
        const at = new Map(cd.atoms.map((a, k) => [a, k]));
        const key: number[] = cd.atoms.map((a) => order(desc.atoms?.get(a)));
        desc.bonds?.forEach((d, i) => {
          const b = c.input.bonds[i];
          const k = b && at.has(b.a) && at.has(b.b) ? Math.min(at.get(b.a)!, at.get(b.b)!) : -1;
          if (k >= 0) key[k] = Math.min(key[k], order(d));
        });
        return key;
      },
      (p, q) => compareKeys(p, q),
    );
  }
  if (left.length > 1 && !sameUnderSymmetry(c, left)) return { left, own: { atoms: differing(c, left), why: "needs the name" } };
  return { left, own: null };
}

/** Whether every candidate left numbers atoms of one orbit alike at each place: the same numbering, the molecule turned. */
function sameUnderSymmetry(c: Ctx, cands: readonly Candidate[]): boolean {
  const orbits = c.input.orbits;
  if (!orbits) return false;
  return cands.every((cd) => cd.atoms.every((a, k) => orbits[a] === orbits[cands[0].atoms[k]]));
}

/** The atoms whose place differs between the candidates left. */
function differing(_c: Ctx, cands: readonly Candidate[]): number[] {
  const out = new Set<number>();
  for (const cd of cands.slice(1)) {
    cd.atoms.forEach((a, k) => {
      if (a === cands[0].atoms[k]) return;
      out.add(a);
      out.add(cands[0].atoms[k]);
    });
  }
  return [...out];
}

// ---------------------------------------------------------------- the parent (A3)

/** The acyclic carbon atoms of the molecule, taken apart into chains: the longest path through each tree of them (A3 step 4). */
function longestChains(c: Ctx, atoms: readonly number[], allowed: (a: number) => boolean): number[][] {
  const ok = new Set(atoms.filter(allowed));
  const paths: number[][] = [];
  let best = 0;
  // (every simple path by a walk from each atom: the trees are small, and the longest wins)
  for (const s of ok) {
    const walk = (path: number[]) => {
      const u = path[path.length - 1];
      let grew = false;
      for (const v of c.around[u]) {
        if (!ok.has(v) || path.includes(v)) continue;
        grew = true;
        walk([...path, v]);
      }
      if (!grew) {
        if (path.length > best) {
          best = path.length;
          paths.length = 0;
        }
        if (path.length === best) paths.push(path);
      }
    };
    walk([s]);
  }
  // (each path once, not once from each end)
  const seen = new Set<string>();
  return paths.filter((p) => {
    const k = [p.join(","), [...p].reverse().join(",")].sort()[0];
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

type ParentPick = { unit: Unit; own: OwnWhy | null; multiplied?: Unit[] };

/** A ring system's skeleton as text - its atoms, their elements and its ring bonds, saturation not looked at: two systems alike have one text. */
function skeletonText(c: Ctx, atoms: readonly number[]): string {
  const set = new Set(atoms);
  let label = new Map(atoms.map((a) => [a, c.input.atoms[a].el]));
  for (let round = 0; round < atoms.length; round++) {
    const next = new Map(atoms.map((a) => [a, `${label.get(a)}(${c.around[a].filter((b) => set.has(b)).map((b) => label.get(b)).sort().join(",")})`]));
    const ranks = [...new Set(next.values())].sort();
    label = new Map(atoms.map((a) => [a, `${c.input.atoms[a].el}#${ranks.indexOf(next.get(a)!)}`]));
  }
  return [...label.values()].sort().join(";");
}

/**
 * The ring assemblies among `systems` (A3 step 3; P-28.2.1, P-28.3.1, P-31.2.3.3.5, P-54.3): two to six ring systems of one skeleton joined in
 * an unbranched row by single bonds, hydrogenated or not - but a benzene ring joined to a fully saturated six-ring (cyclohexylbenzene). Each
 * as its systems in row order; a system in none is left out.
 */
function assembliesOf(c: Ctx, systems: readonly number[]): number[][] {
  const text = new Map(systems.map((k) => [k, skeletonText(c, c.systems[k].atoms)]));
  const saturated = (k: number) => c.systems[k].atoms.every((a) => c.around[a].every((b) => c.systemOf[b] !== k || orderOf(c, a, b) === 1));
  const benzene = (k: number) => c.systems[k].rings.length === 1 && isBenzene(c, c.systems[k].atoms);
  const linked = new Map<number, number[]>(systems.map((k) => [k, []]));
  for (const k of systems) {
    for (const a of c.systems[k].atoms) {
      for (const b of c.around[a]) {
        const j = c.systemOf[b];
        if (j < 0 || j === k || !linked.has(j) || orderOf(c, a, b) !== 1 || text.get(j) !== text.get(k)) continue;
        if ((benzene(k) && saturated(j)) || (benzene(j) && saturated(k))) continue;
        if (!linked.get(k)!.includes(j)) linked.get(k)!.push(j);
      }
    }
  }
  const out: number[][] = [];
  const seen = new Set<number>();
  for (const k of systems) {
    if (seen.has(k) || !linked.get(k)!.length) continue;
    // (the connected set; kept only as a row: no system with three partners, no ring of systems, two to six in all)
    const group = [k];
    for (let i = 0; i < group.length; i++) for (const j of linked.get(group[i])!) if (!group.includes(j)) group.push(j);
    group.forEach((x) => seen.add(x));
    const ends = group.filter((x) => linked.get(x)!.length === 1);
    if (group.some((x) => linked.get(x)!.length > 2) || ends.length !== 2 || group.length > 6) continue;
    const row = [ends[0]];
    while (row.length < group.length) row.push(linked.get(row[row.length - 1])!.find((j) => !row.includes(j))!);
    out.push(row);
  }
  return out;
}

/** A ring system's facts for P-44.2.1 (a) to (g). */
function ringFacts(c: Ctx, s: { atoms: number[]; rings: number[] }): number[] {
  const els = s.atoms.map((a) => c.input.atoms[a].el);
  const hetero = els.filter((e) => e !== "C");
  const seniorRank = hetero.length ? Math.min(...hetero.map((e) => rank(RING_SENIORITY, e))) : RING_SENIORITY.length;
  const counts = RING_COUNT_SENIORITY.map((e) => -hetero.filter((x) => x === e).length);
  // (each lower first: a heterocycle; with N; the senior heteroatom; more rings; more atoms; more heteroatoms; more of the senior kinds)
  return [hetero.length ? 0 : 1, hetero.includes("N") ? 0 : 1, seniorRank, -s.rings.length, -s.atoms.length, -hetero.length, ...counts];
}

/** A ring unit's kind as P-44.2.2.2 ranks them (lower first): spiro, fused (one ring with them), bridged fused, von Baeyer, assembly. */
function kindOf(c: Ctx, u: Unit): number[] {
  if (u.kind === "assembly") return [4];
  const sys = c.systems[u.ringSystem!];
  if (sys.rings.length === 1) return [1];
  const bridged = vonBaeyerKind(c, sys);
  if (bridged === "bridged fused") return [2];
  if (bridged) return [3];
  const rings = sys.rings.map((k) => c.rings[k]);
  const spiro = rings.every((r, i) => rings.every((q, j) => i === j || r.filter((a) => q.includes(a)).length <= 1));
  return [spiro ? 0 : 1];
}

/** P-44.4.1 (a), (b): more multiple bonds, then more double bonds, in the unit's atoms (lower first). */
function unsaturation(c: Ctx, atoms: readonly number[]): number[] {
  const set = new Set(atoms);
  let multiple = 0;
  let double = 0;
  for (const a of atoms) for (const b of c.around[a]) if (b > a && set.has(b)) {
    const o = orderOf(c, a, b);
    if (o >= 2) multiple++;
    if (o === 2) double++;
  }
  return [-multiple, -double];
}

/** The parent (A3, level 1). */
function parentOf(c: Ctx, atoms: readonly number[]): ParentPick {
  const el = (a: number) => c.input.atoms[a].el;
  const ringSystems = [...new Set(atoms.filter((a) => c.inRing[a]).map((a) => c.systemOf[a]))];
  // step 0: the senior element in a place that counts
  const counts = (a: number) => c.inRing[a] || ACYCLIC_PARENT.has(el(a)) || (el(a) === "N" && c.around[a].some((b) => el(b) === "N" && !c.inRing[b]));
  const present = atoms.filter(counts).map(el);
  const senior = PARENT_ELEMENTS.find((e) => present.includes(e)) ?? "C";
  const inARing = atoms.some((a) => c.inRing[a] && el(a) === senior);
  if (senior !== "C" && !inARing && !ringSystems.length) {
    // (the senior element only outside rings, and no ring at all: its acyclic unit)
    return acyclicElementParent(c, atoms, senior);
  }
  if (senior !== "C" && !inARing && ringSystems.length) return acyclicElementParent(c, atoms, senior);
  if (ringSystems.length) {
    // steps 1 to 3: a ring system or assembly before any chain; among them, P-44.2.1 then P-44.4.1 (a), (b); an assembly one parent
    const assemblies = assembliesOf(c, ringSystems);
    const inAssembly = new Set(assemblies.flat());
    const units: Unit[] = [
      ...assemblies.map((row): Unit => ({ kind: "assembly", atoms: row.flatMap((k) => c.systems[k].atoms), systems: row, parts: row.map((k) => c.systems[k].atoms) })),
      ...ringSystems.filter((k) => !inAssembly.has(k)).map((k): Unit => ({ kind: "ring", atoms: c.systems[k].atoms, ringSystem: k })),
    ];
    const ringsOf = (u: Unit) => (u.systems ?? [u.ringSystem!]).flatMap((k) => c.systems[k].rings);
    let best = units.map((_, i) => i);
    best = leastBy(best, (i) => ringFacts(c, { atoms: units[i].atoms, rings: ringsOf(units[i]) }));
    // (the kind, P-44.2.2.2: spiro, fused, bridged fused, von Baeyer, assembly; within fused, the larger ring at the first difference)
    best = leastBy(best, (i) => kindOf(c, units[i]));
    best = leastBy(best, (i) => (kindOf(c, units[i])[0] === 1 ? ringsOf(units[i]).map((k) => -c.rings[k].length).sort((p, q) => p - q) : []));
    best = leastBy(best, (i) => unsaturation(c, units[i].atoms));
    if (best.length === 1) return { unit: units[best[0]], own: null };
    return tiedParents(c, best.map((i) => units[i]));
  }
  // step 4: the principal chain - the longest chain of acyclic carbons; then P-44.4.1 (a), (b)
  let chains = longestChains(c, atoms, (a) => el(a) === "C" && !c.inRing[a]);
  if (!chains.length) {
    // (no carbon chain: the first heavy atom alone)
    return { unit: { kind: "atom", atoms: [atoms[0]] }, own: atoms.length > 1 ? "not built" : null };
  }
  chains = leastByList(chains, (p) => unsaturation(c, p));
  if (chains.length === 1) return { unit: { kind: "chain", atoms: chains[0] }, own: null };
  return tiedParents(c, chains.map((p) => ({ kind: "chain", atoms: p }) as Unit));
}

/**
 * The parent at level 2 (B3): of the ring systems, assemblies and carbon chains, those holding the most principal groups (P-44.1.1),
 * before every other criterion; among them, A3 as at level 1 - a ring before a chain, then the ring's own seniority, or the longest
 * chain. A chain may end on an acid's, an amide's, a nitrile's or an aldehyde's carbon (B2.2), but never runs through a carboxy or cyano
 * carbon that is not a principal group (B2.4). Two rings joined through the principal group itself are not multiplied (B3.4): one is
 * the parent, either, as the molecule's symmetry has it. Where no unit holds any - an amine on silicon - level 1's parent.
 */
function parentOf2(c: Ctx, atoms: readonly number[]): ParentPick {
  const el = (a: number) => c.input.atoms[a].el;
  const principal = c.principal ?? [];
  // (a chain ending on a group's carbon holds it there; one whose carbon it does not hold, only where all of them hang on the chain -
  //  the two ways never mixed, B2.3)
  const heldBy = (unit: readonly number[], hanging = false) => {
    const set = new Set(unit);
    // (on a carbon chain only: an acid on a step-0 element's chain - on Si - hangs there, as on a ring)
    return principal.filter((g) => (g.carbon != null && !hanging && !c.inRing[g.at] && c.input.atoms[g.at].el === "C" && !set.has(g.carbon) ? false : heldIn(c, g, set) != null));
  };
  const holds = (unit: readonly number[]) => heldBy(unit).length;
  // (the carboxy and cyano carbons that are not principal: never in a chain)
  const notChain = new Set((c.groups ?? []).filter((g) => g.carbon != null && !principal.includes(g) && (g.rank === CLASS.carboxylicAcid || g.rank === CLASS.nitrile)).map((g) => g.carbon!));
  const ringSystems = [...new Set(atoms.filter((a) => c.inRing[a]).map((a) => c.systemOf[a]))];
  const assemblies = assembliesOf(c, ringSystems);
  const inAssembly = new Set(assemblies.flat());
  const ringUnits = [...assemblies.map((row) => row.flatMap((k) => c.systems[k].atoms)), ...ringSystems.filter((k) => !inAssembly.has(k)).map((k) => c.systems[k].atoms)];
  const ends = chainPaths(c, atoms, (a) => el(a) === "C" && !c.inRing[a] && !notChain.has(a));
  // (B2.3: three or more principal groups linked to one unbranched chain all hang on it, none of their carbons in it - citric acid is
  //  a propane, P-65.1.2.2.1; counted so only where there are three or more, else as the chain ending on them)
  const carbons = new Set(principal.flatMap((g) => (g.carbon != null ? [g.carbon] : [])));
  const hung = carbons.size ? chainPaths(c, atoms, (a) => el(a) === "C" && !c.inRing[a] && !notChain.has(a) && !carbons.has(a)) : [];
  const chains = [...ends, ...hung];
  // (A3 step 0 among those holding the most: an acyclic chain of the senior element - 2-(2-carboxyethyl)disilane-1-carboxylic acid)
  const elements = [...new Set(atoms.filter((a) => !c.inRing[a] && ACYCLIC_PARENT.has(el(a))).map(el))];
  const senior = PARENT_ELEMENTS.find((e) => elements.includes(e));
  const elementChains = senior ? chainPaths(c, atoms, (a) => el(a) === senior && !c.inRing[a]) : [];
  const elementCounts = elementChains.map(holds);
  const ringCounts = ringUnits.map(holds);
  const chainCounts = [...ends.map(holds), ...hung.map((p) => { const n = heldBy(p, true).length; return n >= 3 ? n : 0; })];
  const most = Math.max(0, ...elementCounts, ...ringCounts, ...chainCounts);
  if (!most) return parentOf(c, atoms);
  const elementBest = elementChains.filter((_, i) => elementCounts[i] === most);
  if (elementBest.length) {
    const longestE = Math.max(...elementBest.map((p) => p.length));
    const e = elementBest.find((p) => p.length === longestE)!;
    c.principal = heldBy(e);
    return { unit: { kind: e.length > 1 ? "chain" : "atom", atoms: e }, own: null };
  }
  // (the groups the parent chosen holds are its principal groups, numbered as such; any other of their class is a substituent)
  const chosen = (unit: readonly number[]) => {
    const hanging = hung.includes(unit as number[]);
    c.principal = heldBy(unit, hanging);
  };
  const rings = ringUnits.filter((_, i) => ringCounts[i] === most);
  if (rings.length) {
    const pick = parentOf(c, rings.flat());
    // (joined through the principal group itself - an amine's N, a ketone's carbon - one ring is the parent, never both)
    if (pick.multiplied && principal.some((g) => !pick.multiplied!.some((u) => u.atoms.includes(g.at)))) return { unit: pick.multiplied[0], own: null };
    return pick;
  }
  let best = chains.filter((_, i) => chainCounts[i] === most);
  const longest = Math.max(...best.map((p) => p.length));
  best = best.filter((p) => p.length === longest);
  best = leastByList(best, (p) => unsaturation(c, p));
  if (best.length === 1) {
    chosen(best[0]);
    return { unit: { kind: "chain", atoms: best[0] }, own: null };
  }
  // (identical chains, one orbit apart, each holding its principal groups - ethane-1,2-diyl diacetate, 2,2'-sulfanediyldiacetic acid:
  //  multiplied, as rings are; B3.2, B3.4. Never through the principal group itself: two chains on one amine's N are not multiplied)
  const orbits = c.input.orbits;
  const distinct = best.filter((p, i) => best.findIndex((q) => q.length === p.length && new Set(q).size === new Set([...q, ...p]).size) === i);
  const disjoint = distinct.every((p, i) => distinct.every((q, j) => j <= i || !p.some((a) => q.includes(a))));
  if (orbits && disjoint && distinct.length > 1 && distinct.every((p) => p.length === distinct[0].length) && sameOrbitSets(orbits, distinct) && !principal.some((g) => distinct.some((p) => !p.includes(g.at)) && distinct.every((p) => c.around[g.at].some((a) => p.includes(a)) && !p.includes(g.at)))) {
    const units = [...distinct].sort((p, q) => Math.min(...p) - Math.min(...q)).map((p) => ({ kind: "chain", atoms: p }) as Unit);
    c.principal = units.flatMap((u) => heldBy(u.atoms));
    return { unit: units[0], own: null, multiplied: units };
  }
  const tied = tiedParents(c, best.map((p) => ({ kind: "chain", atoms: p }) as Unit));
  chosen(best.find((p) => p.every((a, k) => tied.unit.atoms[k] === a)) ?? tied.unit.atoms);
  return tied;
}

/** Every chain of `allowed` atoms among `atoms` - each simple path between two of them, in order - once each way round. */
function chainPaths(c: Ctx, atoms: readonly number[], allowed: (a: number) => boolean): number[][] {
  const ok = atoms.filter(allowed);
  const set = new Set(ok);
  const out: number[][] = [];
  for (const start of ok) {
    // (the acyclic atoms form trees: from each, the one path to every other, by a walk)
    const back = new Map<number, number>([[start, -1]]);
    const todo = [start];
    while (todo.length) {
      const u = todo.shift()!;
      for (const v of c.around[u]) {
        if (!set.has(v) || back.has(v)) continue;
        back.set(v, u);
        todo.push(v);
      }
    }
    for (const end of back.keys()) {
      if (end < start) continue;
      const path: number[] = [];
      for (let x = end; x !== -1; x = back.get(x)!) path.push(x);
      out.push(path.reverse());
    }
  }
  return out;
}

/** Step 0's parent where its element sits only outside rings (A3 step 0): one atom, or an unbranched chain of that element. */
function acyclicElementParent(c: Ctx, atoms: readonly number[], senior: string): ParentPick {
  const el = (a: number) => c.input.atoms[a].el;
  // (a unit holding a d- or f-block metal is not built; nor chains of alternating elements: a disiloxane)
  let chains = longestChains(c, atoms, (a) => el(a) === senior && !c.inRing[a]);
  chains = leastByList(chains, (p) => unsaturation(c, p));
  const alternating = atoms.some((a) => el(a) === senior && c.around[a].some((b) => el(b) !== senior && el(b) !== "C" && el(b) !== "H" && c.around[b].some((x) => x !== a && el(x) === senior)));
  if (alternating) return { unit: { kind: chains[0].length > 1 ? "chain" : "atom", atoms: chains[0] }, own: "not built" };
  if (chains.length === 1) return { unit: { kind: chains[0].length > 1 ? "chain" : "atom", atoms: chains[0] }, own: null };
  // (step 0's acyclic heteroatom parents are multiplied as ring parents are - 1,1'-methylenebis(disilane), P-15.3; a carbon chain never)
  return tiedParents(c, chains.map((p) => ({ kind: p.length > 1 ? "chain" : "atom", atoms: p }) as Unit), true);
}

/** Of `xs`, those with the least `score` (compared as keys). */
function leastBy(xs: number[], score: (x: number) => number[]): number[] {
  const s = xs.map((x) => ({ x, k: score(x) }));
  let best = s[0].k;
  for (const y of s) if (compareKeys(y.k, best) < 0) best = y.k;
  return s.filter((y) => compareKeys(y.k, best) === 0).map((y) => y.x);
}
function leastByList(xs: number[][], score: (x: number[]) => number[]): number[][] {
  const s = xs.map((x) => ({ x, k: score(x) }));
  let best = s[0].k;
  for (const y of s) if (compareKeys(y.k, best) < 0) best = y.k;
  return s.filter((y) => compareKeys(y.k, best) === 0).map((y) => y.x);
}

/**
 * Parents still tied (A3 step 5): P-45.2.1, the one with more substituents; P-45.2.2, the lower locants for them; still tied and the
 * parents one orbit apart, either (the same numbering, the molecule turned); otherwise Meno's own.
 */
/**
 * How much numbering tied parents may take: each tied parent is numbered with its groups read, at a cost that grows about with the
 * molecule's heavy atoms squared, so the parents times that square. Over it, the first parent is taken and the molecule's numbering is
 * Meno's own (`over the budget`): a long polymer of tied repeat units (poly(ethylene glycol) of fifteen units and more) is left alone at
 * once rather than worked out for seconds while the page waits.
 */
export const TIED_PARENTS_BUDGET = 30_000;

function tiedParents(c: Ctx, units: Unit[], heteroatoms = false): ParentPick {
  // (identical ring parents in one orbit of the molecule - or step 0's acyclic heteroatom parents, `heteroatoms` - multiplied: P-45.1.1,
  //  P-51.3.1, P-15.3; each numbered alike. Never a carbon chain: P-15.3.1.1 (b))
  const orbits = c.input.orbits;
  const rings = heteroatoms || units.every((u) => u.kind === "ring" || u.kind === "assembly");
  if (rings && orbits && units.every((u) => u.atoms.length === units[0].atoms.length) && sameOrbitSets(orbits, units.map((u) => u.atoms))) {
    const first = [...units].sort((p, q) => Math.min(...p.atoms) - Math.min(...q.atoms));
    return { unit: first[0], own: null, multiplied: first };
  }
  const heavyCount = c.heavy.filter(Boolean).length;
  if (units.length * heavyCount * heavyCount > (c.input.tiedParentsBudget ?? TIED_PARENTS_BUDGET)) {
    const first = [...units].sort((p, q) => Math.min(...p.atoms) - Math.min(...q.atoms));
    return { unit: first[0], own: "over the budget" };
  }
  // (some of them alike but not all: the text would multiply a set of them (P-15.3.3.2.1) - Meno's own)
  const someAlike = rings && !!orbits && units.some((u, i) => units.some((v, j) => j > i && u.atoms.length === v.atoms.length && sameOrbitSets(orbits, [u.atoms, v.atoms])));
  const scored = units.map((u) => {
    const set = new Set(u.atoms);
    const numbered = numberUnit(c, u, set);
    const hang = hangers(c, set);
    const key = keyIn(numbered.cand);
    return { u, n: hang.length, locs: hang.map((h) => key.get(h.on)!) };
  });
  const most = Math.max(...scored.map((s) => s.n));
  let left = scored.filter((s) => s.n === most);
  let best = left[0].locs;
  for (const s of left) if (compareSets(s.locs, best) < 0) best = s.locs;
  left = left.filter((s) => compareSets(s.locs, best) === 0);
  if (left.length === 1) return { unit: left[0].u, own: someAlike ? "needs the name" : null };
  const oneOrbit = !!orbits && left.every((s) => s.u.atoms.length === left[0].u.atoms.length) && sameOrbitSets(orbits, left.map((s) => s.u.atoms));
  // (in one orbit: either, nothing said; else the first in the molecule's order, said)
  const first = [...left].sort((p, q) => Math.min(...p.u.atoms) - Math.min(...q.u.atoms))[0];
  return { unit: first.u, own: oneOrbit ? null : "needs the name" };
}

function sameOrbitSets(orbits: readonly number[], sets: readonly (readonly number[])[]): boolean {
  const sig = (s: readonly number[]) => s.map((a) => orbits[a]).sort((p, q) => p - q).join(",");
  return sets.every((s) => sig(s) === sig(sets[0]));
}

// ---------------------------------------------------------------- numbering a unit

type SystemNumbering = { cands: Candidate[]; mancude: boolean; indicated: number; ownAll: OwnWhy | null };

/** A ring system's candidates by its kind's own rules (A4.1 to A4.6), whether it is mancude-named, and its count of indicated hydrogen. */
function systemNumbering(c: Ctx, k: number): SystemNumbering {
  const sys = c.systems[k];
  const inOrder = (): Candidate[] => {
    const atoms = [...sys.atoms].sort((p, q) => p - q);
    return [{ atoms, keys: atoms.map((_, i) => plain(i + 1).key), locants: atoms.map((_, i) => plain(i + 1).locant) }];
  };
  const heteroFirst = (cands: Candidate[]) => {
    const hetero = sys.atoms.filter((a) => c.input.atoms[a].el !== "C");
    return bySeniorityOrder(c, keepLeast(cands, (cd) => { const key = keyIn(cd); return hetero.map((a) => key.get(a)!); }, compareSets), hetero);
  };
  if (sys.rings.length === 1) {
    const ring = c.rings[sys.rings[0]];
    const mancude = mancudeNamed(c, ring, 1);
    return { cands: heteroRingRules(c, ringCandidates(ring)), mancude, indicated: mancude ? indicatedCount(c, ring) : 0, ownAll: null };
  }
  const table = tableCandidates(c, sys.atoms);
  if (table.length) return { cands: table, mancude: true, indicated: indicatedCount(c, sys.atoms), ownAll: null };
  const two = twoRingFused(c, sys);
  if (two.length) return { cands: fusedRules(c, two, sys.atoms), mancude: true, indicated: indicatedCount(c, sys.atoms), ownAll: null };
  const bridged = vonBaeyerKind(c, sys);
  if (bridged) {
    const found = vonBaeyer(sys.atoms, (a) => c.around[a]);
    if (!found || !found.length) return { cands: inOrder(), mancude: false, indicated: 0, ownAll: found ? "not built" : "over the budget" };
    // (heteroatoms after the hydrocarbon's numbering: the set, then by seniority - P-23.3.2.1, .2)
    const cands = heteroFirst(found.map((f) => ({ atoms: f.order, keys: f.order.map((_, i) => plain(i + 1).key), locants: f.order.map((_, i) => plain(i + 1).locant) })));
    return { cands, mancude: false, indicated: 0, ownAll: bridged === "bridged fused" ? "not built" : null };
  }
  const spiro = spiroCandidates(c, sys);
  if (spiro && spiro.length) return { cands: heteroFirst(spiro), mancude: false, indicated: 0, ownAll: null };
  // (a system of another kind - fused rings past the table, a spiro system with a fused or bridged part: not built)
  return { cands: inOrder(), mancude: false, indicated: 0, ownAll: "not built" };
}

/** A locant primed `primes` times (P-28.2.1, P-15.3: an assembly's second ring, a multiplied parent's second). */
function primed(cands: Candidate[], primes: number): Candidate[] {
  if (!primes) return cands;
  return cands.map((cd) => ({
    atoms: cd.atoms,
    locants: cd.locants.map((l) => ({ ...l, base: l.base + "'".repeat(primes) })),
    keys: cd.keys.map((k) => [k[0], k[1] ?? 0, primes, k[3] ?? 0]),
  }));
}

/**
 * A ring assembly numbered (A4.7; P-28.2.1, P-28.3.1): each ring its usual way with its junctions as low as its numbering allows; two rings,
 * the first unprimed and the second primed (which is which left to A5); three to six, composite locants - the ring's number along the row,
 * the atom's own locant as a superscript - both directions along the row tried.
 */
function assemblyCandidates(c: Ctx, parts: readonly number[][], systems: readonly number[]): { cands: Candidate[]; numberings: SystemNumbering[] } {
  const numberings = systems.map((k) => systemNumbering(c, k));
  const own = parts.map((part, i) => {
    const set = new Set(part);
    const junctions = part.filter((a) => c.around[a].some((b) => !set.has(b) && parts.some((q, j) => j !== i && q.includes(b))));
    return keepLeast(numberings[i].cands, (cd) => { const key = keyIn(cd); return junctions.map((a) => key.get(a)!); }, compareSets).slice(0, 8);
  });
  const out: Candidate[] = [];
  if (parts.length === 2) {
    for (const [first, second] of [[0, 1], [1, 0]]) {
      for (const a of own[first]) for (const b of primed(own[second], 1)) out.push({ atoms: [...a.atoms, ...b.atoms], keys: [...a.keys, ...b.keys], locants: [...a.locants, ...b.locants] });
    }
    return { cands: out, numberings };
  }
  for (const row of [parts.map((_, i) => i), parts.map((_, i) => parts.length - 1 - i)]) {
    let combos: Candidate[] = [{ atoms: [], keys: [], locants: [] }];
    row.forEach((i, ringNo) => {
      const next: Candidate[] = [];
      for (const base of combos) {
        for (const cd of own[i]) {
          next.push({
            atoms: [...base.atoms, ...cd.atoms],
            keys: [...base.keys, ...cd.keys.map((k) => [ringNo + 1, k[0], k[1] ?? 0, k[3] ?? 0])],
            locants: [...base.locants, ...cd.locants.map((l) => ({ base: String(ringNo + 1), sup: l.base }))],
          });
        }
      }
      combos = next.slice(0, 4096);
    });
    out.push(...combos);
  }
  return { cands: out, numberings };
}

/**
 * A unit numbered by its own rules (A4) and then A5, within the molecule: `parent` is the set whose hanging atoms count as its substituents.
 * `attach`, for a substituent's unit: its atom of attachment, given the lowest locant its numbering allows (P-29.2) before A5's step 3.
 * `link`, for a multiplied parent: the atom the linking group hangs from, as low as its numbering allows (P-15.3.1.3) before A5; `primes`,
 * its primes.
 */
function numberUnit(c: Ctx, unit: Unit, parent: ReadonlySet<number>, attach?: number, link?: number, primes = 0): { cand: Candidate; own: { atoms: number[]; why: OwnWhy } | null } {
  let cands: Candidate[];
  let mancude = false;
  let indicated = 0;
  let ownAll: OwnWhy | null = null;
  let parts: number[][] | undefined;
  if (unit.kind === "ring") {
    const n = systemNumbering(c, unit.ringSystem!);
    ({ cands, mancude, indicated, ownAll } = n);
  } else if (unit.kind === "assembly") {
    parts = unit.parts!;
    const a = assemblyCandidates(c, parts, unit.systems!);
    cands = a.cands;
    // (named as its components are: a biphenyl that keeps a benzene ring is mancude-named)
    mancude = a.numberings.some((n) => n.mancude);
    ownAll = a.numberings.find((n) => n.ownAll)?.ownAll ?? null;
    if (parts.length > 6) ownAll = "not built";
  } else {
    cands = chainCandidates(unit.atoms);
  }
  cands = primed(cands, primes);
  if (attach != null && cands.length > 1) cands = keepLeast(cands, (cd) => [keyIn(cd).get(attach)!], compareSets);
  // (the link low, unless the unit holds a principal group: that comes first - 4,4'-azanediyldibenzonitrile, P-14.4 (c) - and the link
  //  then as a substituent)
  const holdsPrincipal = !!c.principal?.some((g) => heldIn(c, g, new Set(unit.atoms)) != null);
  if (link != null && cands.length > 1 && !holdsPrincipal) cands = keepLeast(cands, (cd) => [keyIn(cd).get(link)!], compareSets);
  if (ownAll) return { cand: cands[0], own: { atoms: [...cands[0].atoms], why: ownAll } };
  // (a substituent's unit has no indicated-hydrogen step of its own before its free valence: P-29.2 puts the free valence first)
  const r = a5(c, cands, { atoms: unit.atoms, mancude, indicated, parts }, parent, attach != null ? 3 : 1);
  return { cand: r.left[0], own: r.own };
}

// ---------------------------------------------------------------- A6: the order 1 to N

/**
 * The atoms of a substituent, from its atom of attachment `x`, in order (A6.3): its own unit - the ring system holding x, the longest chain of
 * acyclic carbons holding x, or x alone - numbered with x as low as it allows, then its own substituents in turn.
 */
function substituentOrder(c: Ctx, x: number, taken: Set<number>, own: { atom: number; why: OwnWhy }[]): number[] {
  const el = (a: number) => c.input.atoms[a].el;
  let unit: Unit;
  if (c.inRing[x]) unit = { kind: "ring", atoms: c.systems[c.systemOf[x]].atoms, ringSystem: c.systemOf[x] };
  else if (el(x) === "C") {
    // (the longest chain of acyclic carbons that holds x, more multiple bonds on a tie)
    let chains = longestChains(c, [...allFrom(c, x, taken)], (a) => el(a) === "C" && !c.inRing[a] && !taken.has(a)).filter((p) => p.includes(x));
    if (!chains.length) chains = [[x]];
    chains = leastByList(chains, (p) => unsaturation(c, p));
    unit = { kind: "chain", atoms: chains[0] };
  } else unit = { kind: "atom", atoms: [x] };
  const set = new Set(unit.atoms);
  for (const a of unit.atoms) taken.add(a);
  const r = numberUnit(c, unit, set, x);
  if (r.own) for (const a of r.own.atoms) own.push({ atom: a, why: r.own.why });
  return [...r.cand.atoms, ...hangingOrder(c, r.cand, set, taken, own)];
}

/** The atoms reachable from `x` through atoms not yet taken. */
function allFrom(c: Ctx, x: number, taken: ReadonlySet<number>): Set<number> {
  const seen = new Set([x]);
  const queue = [x];
  while (queue.length) {
    const u = queue.shift()!;
    for (const v of c.around[u]) {
      if (seen.has(v) || taken.has(v)) continue;
      seen.add(v);
      queue.push(v);
    }
  }
  return seen;
}

/** A unit's substituents in order (A6.2): by the locant they hang from; two on one atom, a ring before a chain, the larger first. */
function hangingOrder(c: Ctx, cand: Candidate, unit: ReadonlySet<number>, taken: Set<number>, own: { atom: number; why: OwnWhy }[]): number[] {
  const out: number[] = [];
  for (const a of cand.atoms) {
    const firsts = c.around[a].filter((b) => !unit.has(b) && !taken.has(b));
    const away = new Set([...taken, ...unit]);
    // (a group's text only where two on this atom tie on the rest: worked out once each, and never for an atom with one group - a long
    //  chain's walk stays linear)
    const texts = new Map<number, string>();
    const text = (b: number) => texts.get(b) ?? texts.set(b, groupText(c, b, away)).get(b)!;
    const sized = firsts.length < 2 ? firsts.map((b) => ({ b, ring: 0, size: 0 })) : firsts.map((b) => ({ b, ring: c.inRing[b] ? 0 : 1, size: allFrom(c, b, away).size }));
    sized.sort((p, q) => p.ring - q.ring || q.size - p.size || (text(p.b) < text(q.b) ? -1 : text(p.b) > text(q.b) ? 1 : p.b - q.b));
    for (const { b } of sized) {
      if (taken.has(b)) continue;
      out.push(...substituentOrder(c, b, taken, own));
    }
  }
  return out;
}

// ---------------------------------------------------------------- the whole

/**
 * The locants of one connected molecule (`input`; its hydrogens are left out of `order` and show nothing here: the map numbers them after
 * the heavy atoms, by the atom each is on). `level` 1: the skeleton's own numbering; level 2 is not built in this part.
 */
export function locants(input: LocantsInput, level: 1 | 2 = 1): Locants {
  const c = contextOf(input);
  const heavyAtoms = input.atoms.map((_, i) => i).filter((i) => c.heavy[i]);
  const own: { atom: number; why: OwnWhy }[] = [];
  const locant: (Locant | null)[] = input.atoms.map(() => null);
  if (!heavyAtoms.length) return { order: [], locant, shown: [], own };
  // (level 2: the principal characteristic group leads (B). Its class not built - or a not-built group below it whose carbon ends a
  //  chain of carbons: level 1's numbering, every atom said as Meno's own)
  let notBuilt = false;
  if (level === 2) {
    const groups = groupsOf(c.input.atoms.map((a, i) => ({ el: a.el, charge: a.charge, hs: hydrogensAt(c, i) })), c.input.bonds.map((b, k) => ({ a: b.a, b: b.b, order: c.orders[k] })), c.inRing);
    if (groups.length) {
      const first = Math.min(...groups.map((g) => g.rank));
      const top = groups.filter((g) => g.rank === first);
      const endsChain = (g: Group) => c.input.atoms[g.at].el === "C" && !c.inRing[g.at] && c.around[g.at].filter((b) => c.input.atoms[b].el === "C").length === 1;
      // (B7: a cation or an anion that is not of the principal class - the aminium beside an ester - stands above it: not built)
      const charged = c.input.atoms.some((a, i) => (a.charge ?? 0) !== 0 && !groups.some((g) => g.rank === first && (g.atoms.includes(i) || g.at === i)) && !neutralInside(c, i));
      if (charged || top.some((g) => !g.built) || groups.some((g) => !g.built && g.rank > first && endsChain(g))) notBuilt = true;
      else {
        c.groups = groups;
        c.principal = top;
      }
    }
  }
  const wanted = c.principal?.length ?? 0;
  const pick = c.principal ? parentOf2(c, heavyAtoms) : parentOf(c, heavyAtoms);
  // (esters of one alcohol whose acids are not one parent - esters of different acids, or of identical ones in two orbits: the text has
  //  no single parent for them, B3.2)
  if (c.principal && c.principal.length < wanted && c.principal.every((g) => g.rank === CLASS.carboxylicEster)) notBuilt = true;
  const units = pick.multiplied ?? [pick.unit];
  const parentSet = new Set(units.flatMap((u) => u.atoms));
  // (multiplied parents: each numbered alike, the link's point of attachment as low as it allows, the second primed, the third twice)
  const each = units.map((u, i) => {
    const mine = new Set(u.atoms);
    // (the atom the linking group hangs from: the one whose group outside reaches the other parents)
    const others = new Set(units.filter((v) => v !== u).flatMap((v) => v.atoms));
    const link = units.length > 1 ? u.atoms.find((a) => c.around[a].some((b) => !mine.has(b) && [...allFrom(c, b, mine)].some((x) => others.has(x)))) : undefined;
    return numberUnit(c, u, parentSet, undefined, link, units.length > 1 ? i : 0);
  });
  const numbered = {
    cand: { atoms: each.flatMap((e) => e.cand.atoms), keys: each.flatMap((e) => e.cand.keys), locants: each.flatMap((e) => e.cand.locants) },
    own: each.find((e) => e.own)?.own ?? null,
  };
  if (pick.own) for (const a of heavyAtoms) own.push({ atom: a, why: pick.own });
  if (notBuilt) for (const a of heavyAtoms) own.push({ atom: a, why: "not built" });
  if (numbered.own) for (const a of numbered.own.atoms) own.push({ atom: a, why: numbered.own.why });
  numbered.cand.atoms.forEach((a, k) => (locant[a] = numbered.cand.locants[k]));
  // (A6.1: plain-number locants at their numbers, the rest after them in the order of their keys)
  const parentAtoms = numbered.cand.atoms.map((a, k) => ({ a, key: numbered.cand.keys[k], plain: /^\d+$/.test(numbered.cand.locants[k].base) && !numbered.cand.locants[k].sup }));
  const plainOnes = parentAtoms.filter((p) => p.plain).sort((p, q) => compareKeys(p.key, q.key));
  const others = parentAtoms.filter((p) => !p.plain).sort((p, q) => compareKeys(p.key, q.key));
  const taken = new Set(parentSet);
  const order = [...plainOnes.map((p) => p.a), ...others.map((p) => p.a), ...hangingOrder(c, numbered.cand, parentSet, taken, own)];
  // (anything left - a part the walk did not reach - after, in the molecule's order)
  for (const a of heavyAtoms) if (!order.includes(a)) order.push(a);
  const place = new Map(order.map((a, k) => [a, k + 1]));
  const shown = input.atoms.map((_, i) => locant[i] ?? { base: String(place.get(i) ?? 0) });
  // (each atom once, its first reason)
  const seenOwn = new Set<number>();
  const ownOnce = own.filter((o) => {
    if (seenOwn.has(o.atom)) return false;
    seenOwn.add(o.atom);
    return true;
  });
  return { order, locant, shown, own: ownOnce };
}
