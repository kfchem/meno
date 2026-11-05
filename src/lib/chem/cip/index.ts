/**
 * R/S and E/Z by Meno's own reading of the CIP rules (docs/CIP.md), from a
 * structure's configuration as drawn (lib/layout/drawn `readStereo`) or as
 * read: the descriptors of its centres and its double bonds, or why one
 * has none. Rules 1a to 5, as Hanson et al. 2018 state them on BB 2013,
 * and their proposed rule 6 (`byRule6`): R and S, r and s for a
 * pseudoasymmetric centre, E and Z - seqCis and seqTrans said as Z and E
 * that turn in the mirror image (`turns`). A tie only an axis's M or P
 * could break is said not worked out, never guessed.
 *
 * Which atoms and bonds are units is the configuration's to say (what
 * perception reads): this ranks what it is given, and tells whether the
 * ranking gives a descriptor at all - a wedge on C(CH3)2Br is a
 * configuration, and no centre.
 */
import { isMetal } from "../../layout/perceive";
import type { IdentityInput } from "../identity";
import { Digraph, HYDROGEN, NODE_BUDGET, PHANTOM, STEP_BUDGET, TooLarge, type Budget, type CipNode } from "./digraph";
import { lonePairs, MOST_STRUCTURES, prepared, type Prepared } from "./prepare";
import { parity, Ranker, RULE_5, Unknown } from "./rank";

/**
 * Why a unit has no descriptor:
 * - `alike`: two of its ligands are alike, by every rule (no centre);
 * - `open`: it hangs on a double bond the drawing leaves open (`bond`);
 * - `later`: only an axis's M or P could tell two ligands apart - not worked out yet;
 * - `unsure`: a ligand it would have to look past cannot be told from the
 *   drawing - a charged or radical mesomeric system whose usual structures
 *   give different labels, or more of them than `MOST_VARIANTS`, a metal, a
 *   star - or it is no centre the rules can complement (three bonds and no
 *   lone pair);
 * - `large`: its digraph grows past what is worked out.
 */
export type CipWhy = "alike" | "open" | "later" | "unsure" | "large";
/**
 * A unit's descriptor: R or S, or r or s for a pseudoasymmetric centre; E or
 * Z, `turns` where it turns in the mirror image (seqCis or seqTrans, Hanson
 * et al. 2018 p. 1761, shown as Z or E: docs/CIP.md); an axis's M or P, m or
 * p where pseudoasymmetric - or why it has none.
 */
export type CipResult = { label: "R" | "S" | "r" | "s" | "E" | "Z" | "M" | "P" | "m" | "p"; turns?: true } | { why: CipWhy; bond?: number };

/**
 * A unit's result as worked out on one structure, with the unsure atom it
 * stopped at, if it did (`agreed`) - or, ligands alike and three paths or
 * more back to the root, rule 6 to be asked (`byRule6`).
 */
type Said = (CipResult | { why: "rule 6" }) & { at?: number };

const no = (why: CipWhy, bond?: number): CipResult => (bond == null ? { why } : { why, bond });
const RULE_6_ASKED: Said = { why: "rule 6" };
const fromUnknown = (u: Unknown): Said => (u.at == null ? no(u.why, u.bond) : { ...no(u.why, u.bond), at: u.at });

/**
 * Ligands put in order, highest first, by every rule; or why they cannot
 * be: a comparison that cannot be made, or two alike - and then whether
 * rules 4 and 5, or rule 6, might yet tell them apart.
 */
function inOrder(rank: Ranker, ligands: readonly CipNode[], root: readonly number[]): { order: number[]; rule: number } | Said {
  const order = ligands.map((_, i) => i);
  let rule = -1;
  for (let i = 1; i < order.length; i++) {
    for (let j = i; j > 0; j--) {
      const d = rank.decided(ligands[order[j - 1]], ligands[order[j]]);
      if (d instanceof Unknown) return fromUnknown(d);
      if (d.c === 0) return tied(rank, ligands, [order[j - 1], order[j]], root);
      rule = Math.max(rule, d.rule);
      if (d.c > 0) break;
      [order[j - 1], order[j]] = [order[j], order[j - 1]];
    }
  }
  return { order, rule };
}

/** Why two ligands alike by every rule leave no descriptor: alike, or for an axis or rule 6, not worked out yet. */
function tied(rank: Ranker, ligands: readonly CipNode[], two: readonly number[], root: readonly number[]): Said {
  const blocked = new Set(root);
  const atoms = two.map((i) => ligands[i].atom);
  const around = rank.region(atoms, blocked);
  // (an axis or a cumulene configured in them: its M or P might tell them apart)
  if (rank.configured(around)) return no("later");
  // (three paths or more back to the root: the proposed rule 6 might - Hanson et al. 2018 p. 1762)
  const back = ligands.filter((l) => l.atom >= 0 && ligands.some((m) => m !== l && m.atom >= 0 && rank.region([l.atom], blocked).has(m.atom)));
  return back.length >= 3 ? RULE_6_ASKED : no("alike");
}

/** Whether a centre is one the rules complement as it is configured: its ligands its neighbours and H, and a lone pair where it has three. */
function refusedCentre(p: Prepared, c: number): boolean {
  const t = p.input.atoms[c].tetra!;
  if (p.unsure[c] || p.dups[c].length) return true;
  // (bonded to a metal or a star: ligancy complementation says nothing of it)
  if (p.around[c].some((b) => isMetal(p.input.atoms[b].el) || p.input.atoms[b].el === "*" || (p.unsure[b] && !Number.isFinite(p.z[b])))) return true;
  const drawn = t.neighbours.filter((n) => n >= 0);
  const hs = t.neighbours.length - drawn.length;
  if (hs !== p.hs[c] || drawn.length !== p.around[c].length || drawn.some((n) => !p.around[c].includes(n))) return true;
  if (t.neighbours.length === 4) return false;
  // (three, and the fourth its lone pair: an atom with one - not a B, nor a C+)
  return t.neighbours.length !== 3 || lonePairs(p, c) < 1;
}

function centre(p: Prepared, c: number): Said {
  const t = p.input.atoms[c].tetra!;
  if (refusedCentre(p, c)) return no("unsure");
  const budget: Budget = { left: NODE_BUDGET, steps: STEP_BUDGET };
  try {
    const g = new Digraph(p, [c], budget);
    const subs = g.substituentsOf(g.roots[0], null);
    // (the root's ligands kept on it, for an auxiliary unit's way back through it - digraph `rootwardOf`)
    g.roots[0].kids = subs;
    const h = subs.find((s) => s.atom === HYDROGEN);
    const lone = subs.find((s) => s.atom === PHANTOM);
    const ligands = t.neighbours.map((n) => (n === -1 ? h! : subs.find((s) => !s.dup && s.atom === n)!));
    if (t.neighbours.length === 3) ligands.push(lone!);
    const rank = new Ranker(p, budget);
    // (the configuration's volume, its first three as drawn, turned to the order of rank by the permutation's parity: R where, the
    //  lowest away, the three highest turn clockwise - the volume they span, seen from the centre, negative)
    const sense = (r: Ranker): boolean | Said => {
      const o = inOrder(r, ligands, [c]);
      return "order" in o ? r.volumeOf(c) * parity(o.order) < 0 : o;
    };
    const labelBy = (r: Ranker): Said => {
      const o = inOrder(r, ligands, [c]);
      if (!("order" in o)) return o;
      const up = r.volumeOf(c) * parity(o.order) < 0;
      if (o.rule < RULE_5) return { label: up ? "R" : "S" };
      // (decided by rule 5: pseudoasymmetric, r or s, where the mirror image reads it the same - Hanson et al. 2018 p. 1761)
      const m = sense(r.mirror);
      if (typeof m !== "boolean") return m;
      return { label: m === up ? (up ? "r" : "s") : up ? "R" : "S" };
    };
    const first = labelBy(rank);
    return "why" in first && first.why === "rule 6" ? byRule6(rank, ligands, sense) : first;
  } catch (e) {
    if (e instanceof TooLarge) return no("large");
    throw e;
  }
}

/**
 * Rule 6, the 2018 proposal (Hanson et al. 2018 pp. 1761-1762): where
 * rules 1a to 5 leave ligands alike and three paths or more lead back to
 * the root, one undifferentiated node - each ligand alike with another, in
 * turn - is promoted above the rest, and the unit worked out again, as
 * drawn and in its mirror image (read back: its R for an S). Each
 * promotion that tells every ligand apart gives R or S; those that come in
 * pairs, R and S, are set aside, and what is left over is the unit's ("a
 * full application of Rule 6 tests all possible promotions ... Any
 * matching R and S pairs are ignored; if a descriptor remains, it is
 * valid", p. 1762). None left over: its ligands are alike after all -
 * cubane's, its promotions' R in its mirror image's S.
 */
function byRule6(rank: Ranker, ligands: readonly CipNode[], senseBy: (r: Ranker) => boolean | Said): Said {
  const alike = new Set<number>();
  for (let i = 0; i < ligands.length; i++)
    for (let j = i + 1; j < ligands.length; j++) {
      const c = rank.ranked(ligands[i], ligands[j]);
      if (c instanceof Unknown) return fromUnknown(c);
      if (c === 0) alike.add(i).add(j);
    }
  let r = 0;
  for (const i of alike) {
    if (ligands[i].atom < 0) continue;
    const promoted = rank.withPromoted(ligands[i].atom);
    for (const [read, back] of [
      [promoted, false],
      [promoted.mirror, true],
    ] as const) {
      const up = senseBy(read);
      if (typeof up === "boolean") r += up !== back ? 1 : -1;
      // (one that cannot be told: the unit neither; one still alike: no descriptor of its own - Hanson's outcome (a))
      else if ("why" in up && up.why !== "alike" && up.why !== "rule 6") return up;
    }
  }
  return r === 0 ? no("alike") : { label: r > 0 ? "R" : "S" };
}

function doubleBond(p: Prepared, i: number): Said {
  const b = p.input.bonds[i];
  const stereo = b.stereo!;
  // (a double bond on a blended cycle is still the unit drawn: a cyclophane's bridge, its alternating cycle through both rings - Hanson et al. 2018 validation suite VS155)
  const k = b.a < b.b ? `${b.a},${b.b}` : `${b.b},${b.a}`;
  if (p.order.get(k) !== 2 && !p.blended.has(k)) return no("unsure");
  if (p.unsure[b.a] || p.unsure[b.b]) return no("unsure");
  const budget: Budget = { left: NODE_BUDGET, steps: STEP_BUDGET };
  try {
    const g = new Digraph(p, [b.a, b.b], budget);
    const ends = [
      [0, b.a, b.b],
      [1, b.b, b.a],
    ] as const;
    // (each end's two groups, kept on it for an auxiliary unit's way back through it - digraph `rootwardOf`)
    for (const [k, , other] of ends) g.roots[k].kids = g.substituentsOf(g.roots[k], other);
    // (cis where, each end's higher group taken for its reference, the drawing's sides say so; and the last rule either end needed)
    const sense = (rank: Ranker): { cis: boolean; rule: number } | Said => {
      const high: number[] = [];
      let rule = -1;
      for (const [k, end, other] of ends) {
        const subs = g.roots[k].kids!;
        if (subs.length !== 2) return no("unsure");
        const o = inOrder(rank, subs, [end, other]);
        if (!("order" in o)) return o;
        high.push(subs[o.order[0]].atom);
        rule = Math.max(rule, o.rule);
      }
      return { cis: (stereo.cis !== (high[0] !== stereo.refs[0])) !== (high[1] !== stereo.refs[1]), rule };
    };
    const rank = new Ranker(p, budget);
    const here = sense(rank);
    if (!("cis" in here)) return here;
    const label = here.cis ? "Z" : "E";
    if (here.rule < RULE_5) return { label };
    // (decided by rule 5 at an end: seqCis or seqTrans where the mirror image reads it the other way - Hanson et al. 2018 p. 1761)
    const m = sense(rank.mirror);
    if (!("cis" in m)) return m;
    return m.cis === here.cis ? { label } : { label, turns: true };
  } catch (e) {
    if (e instanceof TooLarge) return no("large");
    throw e;
  }
}

/**
 * An axis's M or P (CIP 1966 pp. 395-396, helicity; the Blue Book via
 * Hanson et al. 2018 pp. 1760-1761): its two groups at each end ranked by
 * the rules on a digraph rooted at its ends, as a double bond's are - a
 * biaryl's bond, or an allene's two ends, each end's groups but the one the
 * axis runs on through - and the sense of the turn from the near end's
 * higher group to the far end's: P where it is clockwise looking along the
 * axis, else M. Rule 5 having decided it, m or p where the mirror image
 * reads it the same. Shown on the page as Ra (M) or Sa (P).
 */
function axis(p: Prepared, k: number): Said {
  const x = p.input.axes![k];
  const [i, j] = x.atoms;
  if (p.unsure[i] || p.unsure[j]) return no("unsure");
  // (the neighbour each end runs on to the other through: the other end, a biaryl's; its cumulated double bond, an allene's)
  const through = (end: number, other: number) => (p.around[end].includes(other) ? other : p.around[end].find((n) => (p.order.get(end < n ? `${end},${n}` : `${n},${end}`) ?? 1) >= 2));
  const [ti, tj] = [through(i, j), through(j, i)];
  if (ti == null || tj == null) return no("unsure");
  const budget: Budget = { left: NODE_BUDGET, steps: STEP_BUDGET };
  try {
    const g = new Digraph(p, [i, j], budget);
    const ends = [
      [0, i, ti],
      [1, j, tj],
    ] as const;
    for (const [r, , other] of ends) g.roots[r].kids = g.substituentsOf(g.roots[r], other);
    // (P where, each end's higher group taken for its reference, the axis turns clockwise; and the last rule either end needed)
    const sense = (rank: Ranker): { p: boolean; rule: number } | Said => {
      const high: number[] = [];
      let rule = -1;
      for (const [r, end, other] of ends) {
        const subs = g.roots[r].kids!.filter((n) => n.atom !== PHANTOM);
        if (subs.length !== 2) return no("unsure");
        const o = inOrder(rank, subs, [end, other]);
        if (!("order" in o)) return o;
        high.push(subs[o.order[0]].atom);
        rule = Math.max(rule, o.rule);
      }
      const turned = (high[0] !== x.refs[0]) !== (high[1] !== x.refs[1]);
      return { p: (x.sense > 0) !== turned !== rank.mirrored, rule };
    };
    const rank = new Ranker(p, budget);
    const here = sense(rank);
    if (!("p" in here)) return here;
    if (here.rule < RULE_5) return { label: here.p ? "P" : "M" };
    const m = sense(rank.mirror);
    if (!("p" in m)) return m;
    return { label: m.p === here.p ? (here.p ? "p" : "m") : here.p ? "P" : "M" };
  } catch (e) {
    if (e instanceof TooLarge) return no("large");
    throw e;
  }
}

/**
 * The most structures one unit is worked out on (`agreed`): the usual
 * structures of the mesomeric systems its ranking reaches, each with each.
 * A unit past it is unsure, never guessed.
 */
export const MOST_VARIANTS = MOST_STRUCTURES;

/**
 * A unit's result where its ranking reaches a charged or radical mesomeric
 * system - a carboxylate, an enolate, an amidinate: Meno's own rule where
 * the Blue Book leaves the case open (Hanson et al. 2018 p. 1758; docs/
 * CIP.md, *Charged and radical mesomeric systems*). The unit is worked out
 * again with each usual structure of each system it reaches drawn, as many
 * systems as it goes on to reach so; it has a label where every one of
 * those gives the same, and is unsure where they differ, or where there
 * are more of them than `MOST_VARIANTS`. So no label hangs on which of its
 * usual structures was drawn.
 */
function agreed(p: Prepared, unit: (q: Prepared) => Said, variants: (systems: number[]) => Prepared[]): CipResult {
  const first = unit(p);
  const reached: number[] = [];
  let results = [first];
  for (;;) {
    const next = results.map((r) => (r.at == null ? -1 : p.systemOf[r.at])).find((i) => i >= 0 && p.systems[i].structures.length > 1 && !reached.includes(i));
    if (next == null) break;
    reached.push(next);
    if (reached.reduce((t, i) => t * p.systems[i].structures.length, 1) > MOST_VARIANTS) return no("unsure");
    results = variants(reached).map(unit);
  }
  // (rule 6 left asked - a double bond's end, which rule 6 is not worked out for: its groups alike)
  const plain = (r: Said): CipResult =>
    "label" in r ? (r.turns ? { label: r.label, turns: true } : { label: r.label }) : r.why === "rule 6" ? no("alike") : no(r.why, "bond" in r ? r.bond : undefined);
  const said = new Set(results.map((r) => JSON.stringify(plain(r))));
  return said.size === 1 ? plain(results[0]) : no("unsure");
}

/**
 * The descriptors of a structure's configured centres (by atom index),
 * double bonds (by bond index) and axes (by their index in `axes`) - all
 * of them, or those asked for.
 */
export function cipLabels(
  input: IdentityInput,
  ask?: { centres?: Iterable<number>; bonds?: Iterable<number>; axes?: Iterable<number> },
): { centres: Map<number, CipResult>; bonds: Map<number, CipResult>; axes: Map<number, CipResult> } {
  const p = prepared(input);
  const made = new Map<string, Prepared>();
  // (the structure with each combination of usual structures of `systems` drawn, each made once)
  const variants = (systems: number[]): Prepared[] => {
    let combos: number[][] = [[]];
    for (const i of systems) combos = combos.flatMap((c) => p.systems[i].structures.map((_, k) => [...c, k]));
    return combos.map((combo) => {
      const key = systems.map((i, j) => `${i}:${combo[j]}`).join(" ");
      let q = made.get(key);
      if (!q) {
        const atoms = input.atoms.map((a) => ({ ...a }));
        const bonds = input.bonds.map((b) => ({ ...b }));
        const asDrawn = new Set<number>();
        systems.forEach((i, j) => {
          const s = p.systems[i].structures[combo[j]];
          for (const [a, c] of s.charges) atoms[a].charge = c;
          for (const [k, o] of s.orders) bonds[p.bondAt.get(k)!].order = o;
          for (const a of p.systems[i].atoms) asDrawn.add(a);
        });
        q = prepared({ ...input, atoms, bonds }, asDrawn);
        made.set(key, q);
      }
      return q;
    });
  };
  const centres = new Map<number, CipResult>();
  const bonds = new Map<number, CipResult>();
  const atomsAsked = ask?.centres ? [...ask.centres] : input.atoms.map((_, i) => i);
  const bondsAsked = ask?.bonds ? [...ask.bonds] : input.bonds.map((_, i) => i);
  for (const c of atomsAsked) {
    if (input.atoms[c]?.tetra) centres.set(c, agreed(p, (q) => centre(q, c), variants));
  }
  for (const i of bondsAsked) {
    if (input.bonds[i]?.stereo) bonds.set(i, agreed(p, (q) => doubleBond(q, i), variants));
  }
  const axes = new Map<number, CipResult>();
  for (const k of ask?.axes ? [...ask.axes] : (input.axes ?? []).map((_, k) => k)) {
    if (input.axes?.[k]) axes.set(k, agreed(p, (q) => axis(q, k), variants));
  }
  return { centres, bonds, axes };
}
