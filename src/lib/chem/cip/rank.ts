/**
 * The sequence rules 1a, 1b, 2, 3, 4a, 4b, 4c and 5, and the proposed 6,
 * applied to a hierarchical digraph as the texts give it (docs/CIP.md).
 *
 * - Exhaustively, rule by rule (Prelog and Helmchen 1982 pp. 573-574; BB 2013
 *   P-92.1.3 as Hanson et al. 2018 quote it, p. 1757): two branches are
 *   compared by rule 1a through their whole depth, and only where that
 *   leaves them alike by 1b, and so on. Each sub-rule is a rule of its own.
 * - Within a rule, sphere by sphere: in each sphere, the nodes hanging from
 *   the higher-ranked node of the sphere before are compared first, each
 *   set from its highest node down (1982 p. 574, Fig. 14; Hanson p. 1757).
 * - Rule 1a: higher atomic number precedes lower. A duplicate has the atomic
 *   number of the atom it duplicates, a blend's duplicate the mean (1966
 *   pp. 393-394); a phantom 0.
 * - Rule 1b, as Hanson et al. 2018 propose (p. 1758): lower root distance
 *   precedes higher (lib/chem/cip/digraph). It ranks every duplicate above
 *   any real atom of the same atomic number in its sphere, as the original
 *   rule 1b did and Hanson would keep (p. 1758), without saying so: a real
 *   atom in sphere n is at root distance n, a duplicate there at n - 1 or
 *   less - a ring-closure duplicate copies an atom on its own path, and a
 *   multiple-bond duplicate takes the sphere of the atom it hangs from.
 * - Rule 2, as Hanson et al. 2018 propose (p. 1759): higher mass precedes
 *   lower - an atom's isotope's exact mass where it has one, else its
 *   element's atomic weight, and 0 for a duplicate (lib/chem/isotopes).
 * - Rule 3 (BB 2013 as Hanson quote it, p. 1759): a double bond's seqcis (Z)
 *   precedes seqtrans (E), which precedes a double bond that is no
 *   stereogenic unit. Each double bond met in a ligand gets its auxiliary
 *   descriptor on this digraph, from the outside in (Hanson p. 1757): at its
 *   far end, its two substituents ranked by all the rules; at its near end,
 *   the one toward the root against the other by rule 1a alone, on a digraph
 *   rooted at that end - Hanson's reason it needs nothing more being that
 *   the path back to the root is unique in its atoms (p. 1757). Prelog and
 *   Helmchen 1982 (p. 576) would take the near end's higher group as the
 *   root-ward one, relative to the core; that differs only where the other
 *   group outranks it, and BB 2013's rule 3 reads seqcis as Z.
 * - Rules 4a to 5 read each node's auxiliary descriptor (`Aux`): a centre's,
 *   worked out on this digraph like a double bond's, its ligands ranked by
 *   all the rules and the one toward the root by rule 1a (Hanson p. 1757);
 *   a double bond's, carried by its near end only, the node closest to the
 *   root (Hanson p. 1760). Each is chiral (R, S, seqCis, seqTrans) where it
 *   turns in the mirror image, else pseudoasymmetric (r, s, seqcis,
 *   seqtrans) - Hanson's test by reflection (p. 1761), asked only where
 *   rule 5 decided it, the one rule a reflection turns.
 * - Rule 4a: chiral precedes pseudoasymmetric, which precedes none (BB 2013
 *   via Hanson p. 1760; PH 1982 p. 578).
 * - Rule 4b: like precedes unlike, as Hanson reads it for machines (p. 1760,
 *   Fig. 8; PH 1982 p. 577): each ligand's chiral descriptors, R, M and
 *   seqCis taken as R, read in the order of their places - sphere by
 *   sphere, then by their rank on the way out, alike places as one group,
 *   those like the reference first - once against R and once against S, as
 *   bits (like 1); the ligand whose higher reading is the higher precedes.
 * - Rule 4c: r precedes s (BB 2013 via Hanson p. 1761).
 * - Rule 5: R precedes S, seqCis seqTrans (BB 2013 via Hanson p. 1761; CIP
 *   1966 p. 391).
 * - Rule 6, Hanson's proposal (pp. 1761-1762): a ranker given an atom to
 *   promote (`withPromoted`) ranks it, and every duplicate of it, above a
 *   node of another atom alike with it; index.ts tries each.
 *
 * What cannot be told gives `Unknown`, never a guess: a double bond the
 * drawing leaves open, an unsure atom (lib/chem/cip/prepare) that would have
 * to be looked past, a tie only an axis's M or P could break (not worked out
 * yet).
 */
import { HYDROGEN, PHANTOM, rootwardOf, TooLarge, type Budget, type CipNode } from "./digraph";
import type { Prepared } from "./prepare";

/** The rules in their order: 1a, 1b, 2, 3, 4a, 4b, 4c, 5, and the proposed 6. */
export const RULES = ["1a", "1b", "2", "3", "4a", "4b", "4c", "5", "6"] as const;
export const LAST_RULE = RULES.length - 1;
export const RULE_4A = 4;
export const RULE_4B = 5;
export const RULE_4C = 6;
export const RULE_5 = 7;
export const RULE_6 = 8;

/** Why a comparison cannot be made: a double bond left open in the drawing (`bond`), an unsure atom to be looked past, or a tie an axis could break. */
export class Unknown {
  constructor(
    readonly why: "open" | "unsure" | "later",
    readonly bond?: number,
    /** An unsure atom it would have had to look past, where it is one. */
    readonly at?: number,
  ) {}
}
export type Compared = number | Unknown;
/** A comparison and the rule that decided it (-1 where none did). */
export type Decided = { c: number; rule: number } | Unknown;

/**
 * A node's auxiliary descriptor: a centre's R (`up`) or S, a double bond's
 * seqcis (`up`) or seqtrans, carried by its near end; `chiral` where it
 * turns in the mirror image (R, S, seqCis, seqTrans), else
 * pseudoasymmetric (r, s, seqcis, seqtrans). None where the node is no
 * stereogenic unit.
 */
export type Aux = { kind: "centre" | "double"; up: boolean; chiral: boolean } | null;

/** A unit's descriptor before it is told chiral or not: its sense, and the last rule its ligands needed. */
type Letter = { kind: "centre" | "double"; up: boolean; rule: number } | null;

/** The smallest ring a double bond in which has no cis or trans to be told: one of seven atoms or fewer is held cis. */
const OPEN_RING = 8;

const pair = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);

/** A node's ligands in order, and those whose place among alike siblings could not be told, each with why. */
type Sorted = { kids: CipNode[]; ambiguous: Map<CipNode, Unknown> } | Unknown;

/** A padding phantom, for a set compared with a longer one. */
const padding = (parent: CipNode): CipNode => ({ atom: PHANTOM, z: 0, mass: 0, dup: false, sphere: parent.sphere + 1, distance: parent.sphere + 1, parent, graph: parent.graph });

/** The parity of a permutation of 0..n-1: 1 even, -1 odd. */
export function parity(perm: readonly number[]): 1 | -1 {
  const seen = perm.map(() => false);
  let sign = 1;
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue;
    let len = 0;
    for (let j = i; !seen[j]; j = perm[j]) {
      seen[j] = true;
      len++;
    }
    if (len % 2 === 0) sign = -sign;
  }
  return sign as 1 | -1;
}

export class Ranker {
  readonly p: Prepared;
  /** Whether it reads every configuration as its mirror image would have it: centres turned, double bonds as they are. */
  readonly mirrored: boolean;
  private readonly budget: Budget;
  private twin: Ranker | null;
  /** Each node's ligands sorted, by the last rule read: those to rule 4c shared with the mirror image's ranker, which they read alike. */
  private readonly sortedOf: Map<CipNode, Sorted[]>;
  private readonly sorted5Of: Map<CipNode, Sorted>;
  private readonly sorted6Of = new Map<CipNode, Sorted>();
  /** Rule 6's reference node's atom, promoted above the nodes alike with it (`withPromoted`); none, where rule 6 is not asked. */
  readonly promoted: number | null;
  /** The ranker with nothing promoted that this one promotes on: its auxiliary descriptors are that one's, rule 6 left out of them (Hanson p. 1762). */
  private readonly base: Ranker | null;
  private readonly letterOf = new Map<CipNode, Letter | Unknown>();
  private readonly auxOf = new Map<CipNode, Aux | Unknown>();
  private readonly placesOf = new Map<CipNode, { places: Place[] } | Unknown>();
  private readonly ringOf = new Map<string, number>();

  constructor(p: Prepared, budget: Budget, mirrored = false, twin: Ranker | null = null, promoted: number | null = null, base: Ranker | null = null) {
    this.p = p;
    this.budget = budget;
    this.mirrored = mirrored;
    this.twin = twin;
    this.promoted = promoted;
    this.base = base;
    // (rules 1a to 4c read a structure and its mirror image alike: 4a and 4c read only whether a descriptor is chiral, and r or s; 4b
    //  like or unlike - so the twins share what they sort by them; and a ranker promoting a node for rule 6 sorts by rules 1a to 5 as
    //  the one it promotes on does)
    this.sortedOf = twin ? twin.sortedOf : base ? base.sortedOf : new Map();
    this.sorted5Of = base ? base.sorted5Of : new Map();
  }

  /** The same structure read in the mirror image, sharing this one's digraphs and budget. */
  get mirror(): Ranker {
    if (!this.twin) this.twin = new Ranker(this.p, this.budget, !this.mirrored, this, this.promoted, this.base ? this.base.mirror : null);
    return this.twin;
  }

  /**
   * The same ranking with `atom` promoted for rule 6, the 2018 proposal: an
   * undifferentiated reference node has priority over any other
   * undifferentiated node (Hanson p. 1761) - the node, and every duplicate
   * of its atom, ranking above a node of another atom alike with it.
   */
  withPromoted(atom: number): Ranker {
    return new Ranker(this.p, this.budget, this.mirrored, null, atom, this);
  }

  /** A centre's configuration as this ranker reads it: its volume turned in the mirror image. */
  volumeOf(atom: number): 1 | -1 {
    const v = this.p.input.atoms[atom].tetra!.volume;
    return (this.mirrored ? -v : v) as 1 | -1;
  }

  /** A node's value by rule `r`; rule 4b compares ligands whole (`rule4b`), and gives none here. */
  value(n: CipNode, r: number): number | Unknown {
    switch (r) {
      case 0:
        return Number.isNaN(n.z) ? new Unknown("unsure") : n.z;
      case 1:
        return -n.distance;
      case 2:
        return Number.isNaN(n.mass) ? new Unknown("unsure") : n.mass;
      case 3:
        return this.rule3(n);
      case RULE_4B:
        return 0;
      case RULE_6:
        return this.promoted != null && n.atom === this.promoted ? 1 : 0;
      default: {
        const d = this.descriptorOf(n);
        if (d instanceof Unknown) return d;
        if (!d) return 0;
        // (4a: chiral 2, pseudoasymmetric 1; 4c: r 2, s 1; 5: R or seqCis 2, S or seqTrans 1)
        if (r === RULE_4A) return d.chiral ? 2 : 1;
        if (r === RULE_4C) return d.kind === "centre" && !d.chiral ? (d.up ? 2 : 1) : 0;
        return d.chiral ? (d.up ? 2 : 1) : 0;
      }
    }
  }

  /** Two nodes by their own values, rules 1a to `r`. */
  private values(a: CipNode, b: CipNode, r: number): Compared {
    if (--this.budget.steps < 0) throw new TooLarge();
    for (let i = 0; i <= r; i++) {
      const x = this.value(a, i);
      if (x instanceof Unknown) return x;
      const y = this.value(b, i);
      if (y instanceof Unknown) return y;
      if (x !== y) return x > y ? 1 : -1;
    }
    return 0;
  }

  /** Two branches ranked by the rules 1a to `r`, exhaustively, each in turn: positive where `a` precedes. */
  ranked(a: CipNode, b: CipNode, r: number = LAST_RULE): Compared {
    const d = this.decided(a, b, r);
    return d instanceof Unknown ? d : d.c;
  }

  /**
   * `ranked`, and the rule that decided it. `inSort`: the order a node's
   * ligands are gone through in, which rule 4b - a comparison of two
   * ligands whole - leaves as it was: a later rule sorts them by itself, as
   * rule 4c sorts r before s (Hanson p. 1761, Fig. 10).
   */
  decided(a: CipNode, b: CipNode, r: number = LAST_RULE, inSort = false): Decided {
    for (let i = 0; i <= r; i++) {
      if ((inSort && i === RULE_4B) || (i === RULE_6 && this.promoted == null)) continue;
      const c = i === RULE_4B ? this.rule4b(a, b) : this.byRule(a, b, i);
      if (c instanceof Unknown) return c;
      if (c !== 0) return { c, rule: i };
    }
    return { c: 0, rule: -1 };
  }

  /** Two branches compared by rule `r` (its values read with those of the rules before it, which leave them alike), sphere by sphere. */
  private byRule(a: CipNode, b: CipNode, r: number): Compared {
    let la = [a];
    let lb = [b];
    let ambiguous = new Map<CipNode, Unknown>();
    for (;;) {
      for (let i = 0; i < la.length; i++) {
        const c = this.values(la[i], lb[i], r);
        if (c !== 0) return c;
      }
      const na: CipNode[] = [];
      const nb: CipNode[] = [];
      const next = new Map<CipNode, Unknown>();
      for (let i = 0; i < la.length; i++) {
        const sa = this.sorted(la[i], r);
        if (sa instanceof Unknown) return sa;
        const sb = this.sorted(lb[i], r);
        if (sb instanceof Unknown) return sb;
        if (!sa.kids.length && !sb.kids.length) continue;
        // (a node whose place among its alike siblings could not be told: the order its ligands come in neither)
        const lost = ambiguous.get(la[i]) ?? ambiguous.get(lb[i]);
        if (lost) return lost;
        const len = Math.max(sa.kids.length, sb.kids.length);
        for (let k = 0; k < len; k++) {
          na.push(sa.kids[k] ?? padding(la[i]));
          nb.push(sb.kids[k] ?? padding(lb[i]));
        }
        for (const [x, why] of sa.ambiguous) next.set(x, why);
        for (const [x, why] of sb.ambiguous) next.set(x, why);
      }
      if (!na.length) return 0;
      la = na;
      lb = nb;
      ambiguous = next;
    }
  }

  /** A node's ligands but the root-ward one, highest first by rules 1a to `r` (but 4b: `decided`), the order a comparison goes through them in; those whose order among them could not be told, said. */
  sorted(n: CipNode, r: number): Sorted {
    const own = r === RULE_5 ? this.sorted5Of : r === RULE_6 ? this.sorted6Of : null;
    const memo = own ? undefined : this.sortedOf.get(n);
    if (own ? own.has(n) : memo?.[r]) return own ? own.get(n)! : memo![r];
    let out: Sorted;
    if (n.dup || n.atom < 0 || !n.parent) out = { kids: [], ambiguous: new Map() };
    else if (this.p.unsure[n.atom]) out = new Unknown("unsure", undefined, n.atom);
    else {
      const kids = [...n.graph.children(n)];
      const ambiguous = new Map<CipNode, Unknown>();
      // (an insertion sort: few ligands, each comparison possibly deep)
      for (let i = 1; i < kids.length; i++) {
        for (let j = i; j > 0; j--) {
          const d = this.decided(kids[j - 1], kids[j], r, true);
          if (d instanceof Unknown) {
            ambiguous.set(kids[j - 1], d).set(kids[j], d);
            break;
          }
          if (d.c >= 0) break;
          [kids[j - 1], kids[j]] = [kids[j], kids[j - 1]];
        }
      }
      out = { kids, ambiguous };
    }
    if (own) own.set(n, out);
    else {
      const m = memo ?? [];
      m[r] = out;
      this.sortedOf.set(n, m);
    }
    return out;
  }

  /**
   * Rule 4b, like precedes unlike, as Hanson reads it for machines (p. 1760,
   * Figs. 8 and 9): each ligand's chiral descriptors read once against R and
   * once against S, as bits - like 1 - in the order of their places
   * (`readAgainst`); the ligand whose higher reading is the higher precedes.
   */
  private rule4b(a: CipNode, b: CipNode): Compared {
    const pa = this.places(a);
    if (pa instanceof Unknown) return pa;
    const pb = this.places(b);
    if (pb instanceof Unknown) return pb;
    const best = (ps: Place[]) => {
      const [r, s] = [true, false].map((ref) => readAgainst(ps, ref));
      return compareBits(r, s) >= 0 ? r : s;
    };
    const [x, y] = [best(pa), best(pb)];
    // (rule 4a has left both with as many chiral descriptors, in places alike)
    if (x.length !== y.length) return new Unknown("unsure");
    return compareBits(x, y);
  }

  /**
   * The nodes of a ligand on the way to each of its chiral descriptors: for
   * each node, its sphere and the way to it from the ligand - each step's
   * rank by rules 1a to 4a among its siblings, siblings alike taking one
   * rank, and the step's own descriptor where it is chiral - so that places
   * alike are alike whichever branch they are on (Hanson p. 1760, Fig. 9).
   */
  private places(l: CipNode): Place[] | Unknown {
    const memo = this.placesOf.get(l);
    if (memo) return memo instanceof Unknown ? memo : memo.places;
    const places: Place[] = [];
    const queue: [CipNode, Step[]][] = [];
    const first = this.descriptorOf(l);
    if (first instanceof Unknown) return this.remember(l, first);
    queue.push([l, [{ rank: 0, up: first?.chiral ? first.up : null }]]);
    while (queue.length) {
      const [n, path] = queue.shift()!;
      if (path[path.length - 1].up != null) places.push({ sphere: n.sphere, path });
      if (n.dup || n.atom < 0) continue;
      const s = this.sorted(n, RULE_4A);
      if (s instanceof Unknown) return this.remember(l, s);
      let rank = 0;
      for (let i = 0; i < s.kids.length; i++) {
        if (i > 0) {
          const c = this.ranked(s.kids[i - 1], s.kids[i], RULE_4A);
          if (c instanceof Unknown) return this.remember(l, c);
          if (c !== 0) rank = i;
        }
        const d = this.descriptorOf(s.kids[i]);
        if (d instanceof Unknown) return this.remember(l, d);
        queue.push([s.kids[i], [...path, { rank, up: d?.chiral ? d.up : null }]]);
      }
    }
    this.placesOf.set(l, { places });
    return places;
  }

  private remember(l: CipNode, u: Unknown): Unknown {
    this.placesOf.set(l, u);
    return u;
  }

  /** The atoms on the far side of `from` (not passing `blocked`): what a tie of ligands is between. */
  region(from: readonly number[], blocked: ReadonlySet<number>): Set<number> {
    const seen = new Set<number>(from.filter((a) => a >= 0 && !blocked.has(a)));
    const queue = [...seen];
    while (queue.length) {
      const a = queue.pop()!;
      for (const b of this.p.around[a]) {
        if (blocked.has(b) || seen.has(b)) continue;
        seen.add(b);
        queue.push(b);
      }
    }
    return seen;
  }

  /**
   * Whether a configuration these rules do not read yet is drawn in
   * `atoms`, but at `but`: an axis, or a cumulene's cis or trans - whose M
   * and P rules 4 and 5 would read (docs/CIP.md, *What it does not do yet*).
   */
  configured(atoms: ReadonlySet<number>, but: { bond?: number } = {}): boolean {
    const input = this.p.input;
    if ([...(input.axes ?? []), ...(input.cumulated ?? [])].some((x) => x.atoms.some((a) => atoms.has(a)))) return true;
    return input.bonds.some((b, i) => !!b.stereo && i !== but.bond && (atoms.has(b.a) || atoms.has(b.b)) && (this.cumulated(b.a) || this.cumulated(b.b)));
  }

  /** The size of the smallest ring through a bond, or Infinity. */
  private ringThrough(a: number, b: number): number {
    const k = pair(a, b);
    const known = this.ringOf.get(k);
    if (known != null) return known;
    const far = new Map<number, number>([[a, 0]]);
    const queue = [a];
    let size = Infinity;
    while (queue.length && size === Infinity) {
      const x = queue.shift()!;
      for (const y of this.p.around[x]) {
        if ((x === a && y === b) || far.has(y)) continue;
        far.set(y, far.get(x)! + 1);
        if (y === b) {
          size = far.get(y)! + 1;
          break;
        }
        if (far.get(y)! < OPEN_RING) queue.push(y);
      }
    }
    this.ringOf.set(k, size);
    return size;
  }

  /** Whether an atom has more than one multiple bond (an allene's middle C, a cumulene's): its double bonds have no cis or trans. */
  private cumulated(a: number): boolean {
    return this.p.around[a].filter((b) => (this.p.order.get(pair(a, b)) ?? 1) >= 2).length > 1;
  }

  /** A node's double bond in this digraph: its near end and far end, where it is an end of one; or none. */
  private doubleAt(n: CipNode): { near: CipNode; far: CipNode } | null | Unknown {
    if (n.dup || n.atom < 0 || !n.parent) return null;
    const p = this.p;
    const partners = p.around[n.atom].filter((c) => p.order.get(pair(n.atom, c)) === 2);
    if (partners.length !== 1) return null;
    const c = partners[0];
    if (c === n.parent.atom) return n.parent.sphere === 0 ? null : { near: n.parent, far: n };
    const kid = n.graph.children(n).find((k) => !k.dup && k.atom === c);
    if (kid) return { near: n, far: kid };
    // (its double bond closes a ring back to the path, its far end a duplicate here, with phantoms for its groups: none to tell on this
    //  branch - its descriptor is the one its end nearer the root carries)
    return null;
  }

  /**
   * Rule 3's value of a node, at either end of a double bond in this
   * digraph: seqcis 2, seqtrans 1, none 0. A seqCis or seqTrans bond, which
   * turns in the mirror image, is left to rules 4a and 5: rule 3 reads it as
   * none (Hanson p. 1760, rule 3 leaving rules 4 and 5 only seqCis and
   * seqTrans).
   */
  private rule3(n: CipNode): number | Unknown {
    const at = this.doubleAt(n);
    if (!at || at instanceof Unknown) return at ?? 0;
    const d = this.aux(at.near);
    if (d instanceof Unknown) return d;
    return !d || d.chiral ? 0 : d.up ? 2 : 1;
  }

  /** The descriptor a node carries for rules 4a to 5: its centre's, or its double bond's where it is the near end. */
  private descriptorOf(n: CipNode): Aux | Unknown {
    if (n.dup || n.atom < 0 || !n.parent) return null;
    if (this.p.input.atoms[n.atom].tetra) return this.aux(n);
    const at = this.doubleAt(n);
    if (at instanceof Unknown) return at;
    return at && at.near === n ? this.aux(n) : null;
  }

  /** A node's auxiliary descriptor: its sense (`letter`), told chiral where it turns in the mirror image. */
  aux(n: CipNode): Aux | Unknown {
    if (this.base) return this.base.aux(n);
    const memo = this.auxOf.get(n);
    if (memo !== undefined) return memo;
    const l = this.letter(n);
    let out: Aux | Unknown;
    if (!l || l instanceof Unknown) out = l;
    else if (l.rule < RULE_5) out = { kind: l.kind, up: l.up, chiral: l.kind === "centre" };
    else {
      // (decided by rule 5: chiral where the mirror image reads it the other way - Hanson p. 1761)
      const m = this.mirror.letter(n);
      out = !m || m instanceof Unknown ? (m ?? new Unknown("unsure")) : { kind: l.kind, up: l.up, chiral: m.up !== l.up };
    }
    this.auxOf.set(n, out);
    return out;
  }

  /**
   * A node's descriptor's sense, as this ranker reads its configuration, and
   * the last rule its ligands needed: a centre's (R up), a double bond's
   * from its near end (seqcis up); none where it is no stereogenic unit.
   */
  private letter(n: CipNode): Letter | Unknown {
    const memo = this.letterOf.get(n);
    if (memo !== undefined) return memo;
    let out: Letter | Unknown;
    if (this.p.input.atoms[n.atom].tetra) out = this.centreLetter(n);
    else {
      const at = this.doubleAt(n);
      out = !at || at instanceof Unknown ? at : this.doubleLetter(at.near, at.far);
    }
    this.letterOf.set(n, out);
    return out;
  }

  /** An auxiliary centre's sense: its ligands in the digraph ranked by all the rules, the one toward the root among them by rule 1a. */
  private centreLetter(n: CipNode): Letter | Unknown {
    const p = this.p;
    const a = n.atom;
    if (p.unsure[a] || p.dups[a].length) return new Unknown("unsure", undefined, a);
    const here = this.centreSense(n, this);
    if (here instanceof Unknown) return here;
    if (here !== "tie") return { kind: "centre", up: here.up, rule: here.rule };
    // two ligands alike by every rule: an axis might tell them apart (not worked out yet); else rule 6, where three paths or more lead
    // back to it (Hanson p. 1762: "Rule 6 must be applied in the determination of all auxiliary descriptors", VS300); else no unit
    const kids = n.graph.children(n);
    const alike = new Set<number>();
    for (let i = 0; i < kids.length; i++)
      for (let j = i + 1; j < kids.length; j++) {
        const c = this.ranked(kids[i], kids[j]);
        if (c instanceof Unknown) return c;
        if (c === 0) alike.add(i).add(j);
      }
    const tied = [...alike].map((i) => kids[i].atom).filter((x) => x >= 0);
    if (this.configured(this.region(tied, new Set([a])))) return new Unknown("later");
    const ends = [...kids.map((k) => k.atom).filter((x) => x >= 0), n.parent!.atom];
    const back = ends.filter((x) => ends.some((y) => y !== x && this.region([x], new Set([a])).has(y)));
    if (back.length < 3) return null;
    let votes = 0;
    for (const x of tied) {
      const promoted = this.withPromoted(x);
      for (const [read, turned] of [
        [promoted, false],
        [promoted.mirror, true],
      ] as const) {
        const s = this.centreSense(n, read);
        if (s instanceof Unknown) return s;
        if (s !== "tie") votes += s.up !== turned ? 1 : -1;
      }
    }
    return votes === 0 ? null : { kind: "centre", up: votes > 0, rule: RULE_6 };
  }

  /**
   * An auxiliary centre's sense as `r` ranks it - its ligands in the digraph
   * by every rule, 4b with them, the one toward the root among them by rule
   * 1a - and the last rule its ligands needed; `tie` where two are alike.
   */
  private centreSense(n: CipNode, r: Ranker): { up: boolean; rule: number } | "tie" | Unknown {
    const a = n.atom;
    const t = this.p.input.atoms[a].tetra!;
    const kids = [...n.graph.children(n)];
    let rule = -1;
    for (let i = 1; i < kids.length; i++) {
      for (let j = i; j > 0; j--) {
        const d = r.decided(kids[j - 1], kids[j]);
        if (d instanceof Unknown) return d;
        if (d.c === 0) return "tie";
        rule = Math.max(rule, d.rule);
        if (d.c > 0) break;
        [kids[j - 1], kids[j]] = [kids[j], kids[j - 1]];
      }
    }
    const back = rootwardOf(n, this.budget);
    let at = 0;
    for (const k of kids) {
      const c = r.ranked(back, k, 0);
      if (c instanceof Unknown) return c;
      if (c === 0) return new Unknown("unsure");
      if (c < 0) at++;
    }
    const ligands = [...kids];
    ligands.splice(at, 0, back);
    const lone = kids.find((k) => k.atom === PHANTOM);
    const h = kids.find((k) => k.atom === HYDROGEN);
    const of = (x: number) => (x === n.parent!.atom ? back : x === -1 ? h : kids.find((k) => k.atom === x));
    const nodes = t.neighbours.map(of);
    if (t.neighbours.length === 3) nodes.push(lone);
    if (nodes.some((x) => !x) || nodes.length !== 4) return new Unknown("unsure");
    const order = ligands.map((l) => nodes.indexOf(l));
    if (order.some((i) => i < 0)) return new Unknown("unsure");
    // (as at the root: R where the volume turned to the order of rank is negative)
    return { up: r.volumeOf(a) * parity(order) < 0, rule };
  }

  /** The sense of the double bond from `near` out to `far`, on their digraph: seqcis or seqtrans, or none. */
  private doubleLetter(near: CipNode, far: CipNode): Letter | Unknown {
    const p = this.p;
    const u = near.atom;
    const v = far.atom;
    const bond = p.bondAt.get(pair(u, v))!;
    if (this.ringThrough(u, v) < OPEN_RING || this.cumulated(u) || this.cumulated(v)) return null;
    // at the far end: its two substituents, all the rules
    const atFar = this.sorted(far, LAST_RULE);
    if (atFar instanceof Unknown) return atFar;
    const farSubs = [...atFar.kids];
    const mate = farSubs.findIndex((k) => k.dup && k.atom === u);
    if (mate >= 0) farSubs.splice(mate, 1);
    if (mate < 0 || farSubs.length !== 2) return new Unknown("unsure");
    const tie = this.decided(farSubs[0], farSubs[1]);
    if (tie instanceof Unknown) return tie;
    if (tie.c === 0) {
      const around = this.region(
        farSubs.map((k) => k.atom),
        new Set([v]),
      );
      return this.configured(around, { bond }) ? new Unknown("later") : null;
    }
    const highFar = (tie.c > 0 ? farSubs[0] : farSubs[1]).atom;
    // at the near end: the root-ward ligand against the other, by rule 1a, on a digraph rooted at the near end
    const others = near.graph.children(near).filter((k) => k !== far && !(k.dup && k.atom === v));
    if (others.length !== 1) return new Unknown("unsure");
    const back = near.parent!.atom;
    const c = this.ranked(rootwardOf(near, this.budget), others[0], 0);
    if (c instanceof Unknown) return c;
    if (c === 0) return new Unknown("unsure");
    const highNear = c > 0 ? back : others[0].atom;
    const stereo = p.input.bonds[bond].stereo;
    if (!stereo) return new Unknown("open", bond);
    const b = p.input.bonds[bond];
    const [refU, refV] = b.a === u ? stereo.refs : [stereo.refs[1], stereo.refs[0]];
    const cis = (stereo.cis !== (highNear !== refU)) !== (highFar !== refV);
    return { kind: "double", up: cis, rule: tie.rule };
  }
}

/** A step on the way from a ligand to a node: its rank among its siblings by rules 1a to 4a, and its chiral descriptor's sense (R up), if it has one. */
type Step = { rank: number; up: boolean | null };
/** A chiral descriptor's place in a ligand: its sphere, and the way to it, its own step last. */
type Place = { sphere: number; path: Step[] };

/**
 * A ligand's chiral descriptors read against a reference (R `true`), like 1
 * and unlike 0, in the order of their places: sphere by sphere, then step
 * by step on the way out - by rank, and, ranks alike, a step like the
 * reference before one unlike it - "the full path from the root to this
 * node, including all Rule 4a priorities as well as the similarity or
 * dissimilarity of the node's descriptor to the reference" (Hanson p. 1760).
 */
function readAgainst(places: readonly Place[], ref: boolean): number[] {
  const key = (p: Place) => [p.sphere, ...p.path.flatMap((s) => [s.rank, s.up == null || s.up === ref ? 0 : 1])];
  const keyed = places.map((p) => ({ k: key(p), like: p.path[p.path.length - 1].up === ref }));
  keyed.sort((x, y) => compareKeys(x.k, y.k));
  return keyed.map((x) => (x.like ? 1 : 0));
}

/** Two keys, number by number. */
function compareKeys(x: readonly number[], y: readonly number[]): number {
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}

/** Two readings, bit by bit: positive where `x` is the higher. */
function compareBits(x: readonly number[], y: readonly number[]): number {
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

export { HYDROGEN, PHANTOM };
