/**
 * The sequence rules 1a, 1b, 2 and 3, applied to a hierarchical digraph as
 * the texts give it (docs/CIP.md).
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
 *
 * What cannot be told gives `Unknown`, never a guess: a double bond the
 * drawing leaves open, an unsure atom (lib/chem/cip/prepare) that would have
 * to be looked past, a tie only rules 4 and 5 could break.
 */
import { Digraph, HYDROGEN, PHANTOM, type Budget, type CipNode } from "./digraph";
import type { Prepared } from "./prepare";

/** The rules in their order: 1a, 1b, 2, 3. */
export const RULES = ["1a", "1b", "2", "3"] as const;
export const LAST_RULE = RULES.length - 1;

/** Why a comparison cannot be made: a double bond left open in the drawing (`bond`), an unsure atom to be looked past, or a tie for rules 4 and 5. */
export class Unknown {
  constructor(
    readonly why: "open" | "unsure" | "later",
    readonly bond?: number,
  ) {}
}
export type Compared = number | Unknown;

/** The value rule 3 gives a node: seqcis 2, seqtrans 1, none 0. */
const SEQCIS = 2;
const SEQTRANS = 1;

/** The smallest ring a double bond in which has no cis or trans to be told: one of seven atoms or fewer is held cis. */
const OPEN_RING = 8;

const pair = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);

/** A node's ligands in order, and those whose place among alike siblings could not be told, each with why. */
type Sorted = { kids: CipNode[]; ambiguous: Map<CipNode, Unknown> } | Unknown;

/** A padding phantom, for a set compared with a longer one. */
const padding = (parent: CipNode): CipNode => ({ atom: PHANTOM, z: 0, mass: 0, dup: false, sphere: parent.sphere + 1, distance: parent.sphere + 1, parent, graph: parent.graph });

export class Ranker {
  readonly p: Prepared;
  private readonly budget: Budget;
  private readonly sortedOf = new Map<CipNode, Sorted[]>();
  private readonly auxOf = new Map<CipNode, number | Unknown>();
  private readonly ringOf = new Map<string, number>();

  constructor(p: Prepared, budget: Budget) {
    this.p = p;
    this.budget = budget;
  }

  /** A node's value by rule `r`. */
  value(n: CipNode, r: number): number | Unknown {
    switch (r) {
      case 0:
        return Number.isNaN(n.z) ? new Unknown("unsure") : n.z;
      case 1:
        return -n.distance;
      case 2:
        return Number.isNaN(n.mass) ? new Unknown("unsure") : n.mass;
      default:
        return this.rule3(n);
    }
  }

  /** Two nodes by their own values, rules 1a to `r`. */
  private values(a: CipNode, b: CipNode, r: number): Compared {
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
    for (let i = 0; i <= r; i++) {
      const c = this.byRule(a, b, i);
      if (c !== 0) return c;
    }
    return 0;
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

  /** A node's ligands but the root-ward one, highest first by rules 1a to `r`; those whose order among them could not be told, said. */
  sorted(n: CipNode, r: number): Sorted {
    const memo = this.sortedOf.get(n);
    if (memo?.[r]) return memo[r];
    let out: Sorted;
    if (n.dup || n.atom < 0 || !n.parent) out = { kids: [], ambiguous: new Map() };
    else if (this.p.unsure[n.atom]) out = new Unknown("unsure");
    else {
      const kids = [...n.graph.children(n)];
      const ambiguous = new Map<CipNode, Unknown>();
      // (an insertion sort: few ligands, each comparison possibly deep)
      for (let i = 1; i < kids.length; i++) {
        for (let j = i; j > 0; j--) {
          const c = this.ranked(kids[j - 1], kids[j], r);
          if (c instanceof Unknown) {
            ambiguous.set(kids[j - 1], c).set(kids[j], c);
            break;
          }
          if (c >= 0) break;
          [kids[j - 1], kids[j]] = [kids[j], kids[j - 1]];
        }
      }
      out = { kids, ambiguous };
    }
    const m = memo ?? [];
    m[r] = out;
    this.sortedOf.set(n, m);
    return out;
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

  /** Whether a configuration is drawn in `atoms`, but at `but`: a centre, or a double bond's cis or trans - what rules 4 and 5 would read. */
  configured(atoms: ReadonlySet<number>, but: { atoms?: readonly number[]; bond?: number } = {}): boolean {
    const input = this.p.input;
    for (const a of atoms) if (input.atoms[a].tetra && !but.atoms?.includes(a)) return true;
    return input.bonds.some((b, i) => !!b.stereo && i !== but.bond && (atoms.has(b.a) || atoms.has(b.b)));
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

  /** Rule 3's value of a node: its double bond's auxiliary descriptor, where it is an end of one in this digraph. */
  private rule3(n: CipNode): number | Unknown {
    if (n.dup || n.atom < 0 || !n.parent) return 0;
    const p = this.p;
    const partners = p.around[n.atom].filter((c) => p.order.get(pair(n.atom, c)) === 2);
    if (partners.length !== 1) return 0;
    const c = partners[0];
    const roots = n.graph.roots.map((r) => r.atom);
    if (roots.includes(n.atom) && roots.includes(c)) return 0;
    if (c === n.parent.atom) return n.parent.sphere === 0 ? 0 : this.aux(n.parent, n);
    const kid = n.graph.children(n).find((k) => !k.dup && k.atom === c);
    if (kid) return this.aux(n, kid);
    // (its double bond closes a ring back to the path: none to tell in a small ring, else not worked out here)
    return this.ringThrough(n.atom, c) < OPEN_RING ? 0 : new Unknown("unsure");
  }

  /** The auxiliary descriptor of the double bond from `near` out to `far`, on their digraph: seqcis, seqtrans, or none. */
  private aux(near: CipNode, far: CipNode): number | Unknown {
    const memo = this.auxOf.get(near);
    if (memo != null) return memo;
    const out = this.auxWorked(near, far);
    this.auxOf.set(near, out);
    return out;
  }

  private auxWorked(near: CipNode, far: CipNode): number | Unknown {
    const p = this.p;
    const u = near.atom;
    const v = far.atom;
    const bond = p.bondAt.get(pair(u, v))!;
    if (this.ringThrough(u, v) < OPEN_RING || this.cumulated(u) || this.cumulated(v)) return 0;
    // at the far end: its two substituents, all the rules
    const atFar = this.sorted(far, LAST_RULE);
    if (atFar instanceof Unknown) return atFar;
    const farSubs = [...atFar.kids];
    const mate = farSubs.findIndex((k) => k.dup && k.atom === u);
    if (mate >= 0) farSubs.splice(mate, 1);
    if (mate < 0 || farSubs.length !== 2) return new Unknown("unsure");
    const tie = this.ranked(farSubs[0], farSubs[1]);
    if (tie instanceof Unknown) return tie;
    if (tie === 0) {
      const around = this.region(
        farSubs.map((k) => k.atom),
        new Set([v]),
      );
      return this.configured(around, { bond }) ? new Unknown("later") : 0;
    }
    const highFar = (tie > 0 ? farSubs[0] : farSubs[1]).atom;
    // at the near end: the root-ward ligand against the other, by rule 1a, on a digraph rooted at the near end
    const others = near.graph.children(near).filter((k) => k !== far && !(k.dup && k.atom === v));
    if (others.length !== 1) return new Unknown("unsure");
    const back = near.parent!.atom;
    const own = new Digraph(p, [u], this.budget);
    const rootward = own.branchToward(own.roots[0], back);
    const c = this.ranked(rootward, others[0], 0);
    if (c instanceof Unknown) return c;
    if (c === 0) return new Unknown("unsure");
    const highNear = c > 0 ? back : others[0].atom;
    const stereo = p.input.bonds[bond].stereo;
    if (!stereo) return new Unknown("open", bond);
    const b = p.input.bonds[bond];
    const [refU, refV] = b.a === u ? stereo.refs : [stereo.refs[1], stereo.refs[0]];
    const cis = stereo.cis !== (highNear !== refU) !== (highFar !== refV);
    return cis ? SEQCIS : SEQTRANS;
  }
}

export { HYDROGEN, PHANTOM };
