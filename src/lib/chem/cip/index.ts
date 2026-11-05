/**
 * R/S and E/Z by Meno's own reading of the CIP rules (docs/CIP.md), from a
 * structure's configuration as drawn (lib/layout/drawn `readStereo`) or as
 * read: the descriptors of its centres and its double bonds, or why one
 * has none. Rules 1a to 3 so far, as Hanson et al. 2018 propose them on BB
 * 2013; a tie only rules 4 and 5 could break (a pseudoasymmetric centre, a
 * seqCis/seqTrans double bond) or only the proposed rule 6 (a centre on an
 * axis of symmetry) is said not worked out, never guessed.
 *
 * Which atoms and bonds are units is the configuration's to say (what
 * perception reads): this ranks what it is given, and tells whether the
 * ranking gives a descriptor at all - a wedge on C(CH3)2Br is a
 * configuration, and no centre.
 */
import { isMetal } from "../../layout/perceive";
import type { IdentityInput } from "../identity";
import { Digraph, HYDROGEN, NODE_BUDGET, PHANTOM, TooLarge, type Budget, type CipNode } from "./digraph";
import { lonePairs, prepared, type Prepared } from "./prepare";
import { Ranker, Unknown } from "./rank";

/**
 * Why a unit has no descriptor:
 * - `alike`: two of its ligands are alike, by every rule (no centre);
 * - `open`: it hangs on a double bond the drawing leaves open (`bond`);
 * - `later`: only rules 4 and 5 could tell two ligands apart - not worked out yet;
 * - `symmetric`: only the proposed rule 6 could - not worked out yet;
 * - `unsure`: a ligand it would have to look past cannot be told from the
 *   drawing (a mesomeric system, a metal, a star), or it is no centre the
 *   rules can complement (three bonds and no lone pair);
 * - `large`: its digraph grows past what is worked out.
 */
export type CipWhy = "alike" | "open" | "later" | "symmetric" | "unsure" | "large";
export type CipResult = { label: "R" | "S" | "E" | "Z" } | { why: CipWhy; bond?: number };

const no = (why: CipWhy, bond?: number): CipResult => (bond == null ? { why } : { why, bond });
const fromUnknown = (u: Unknown): CipResult => no(u.why, u.bond);

/** The parity of a permutation of 0..n-1: 1 even, -1 odd. */
function parity(perm: readonly number[]): 1 | -1 {
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

/**
 * Ligands put in order, highest first, by every rule; or why they cannot
 * be: a comparison that cannot be made, or two alike - and then whether
 * rules 4 and 5, or rule 6, might yet tell them apart.
 */
function inOrder(rank: Ranker, ligands: readonly CipNode[], root: readonly number[]): number[] | CipResult {
  const order = ligands.map((_, i) => i);
  for (let i = 1; i < order.length; i++) {
    for (let j = i; j > 0; j--) {
      const c = rank.ranked(ligands[order[j - 1]], ligands[order[j]]);
      if (c instanceof Unknown) return fromUnknown(c);
      if (c === 0) return tied(rank, ligands, [order[j - 1], order[j]], root);
      if (c > 0) break;
      [order[j - 1], order[j]] = [order[j], order[j - 1]];
    }
  }
  return order;
}

/** Why two ligands alike by rules 1a to 3 leave no descriptor: alike, or for a rule not worked out yet. */
function tied(rank: Ranker, ligands: readonly CipNode[], two: readonly number[], root: readonly number[]): CipResult {
  const blocked = new Set(root);
  const atoms = two.map((i) => ligands[i].atom);
  const around = rank.region(atoms, blocked);
  // (a configuration in them: rules 4 and 5 might tell them apart - a pseudoasymmetric centre, a seqCis double bond)
  if (rank.configured(around, { atoms: root })) return no("later");
  // (three paths or more back to the root: the proposed rule 6 might - Hanson et al. 2018 p. 1762)
  const back = ligands.filter((l) => l.atom >= 0 && ligands.some((m) => m !== l && m.atom >= 0 && rank.region([l.atom], blocked).has(m.atom)));
  return back.length >= 3 ? no("symmetric") : no("alike");
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

function centre(p: Prepared, c: number): CipResult {
  const t = p.input.atoms[c].tetra!;
  if (refusedCentre(p, c)) return no("unsure");
  const budget: Budget = { left: NODE_BUDGET };
  try {
    const g = new Digraph(p, [c], budget);
    const subs = g.substituentsOf(g.roots[0], null);
    const h = subs.find((s) => s.atom === HYDROGEN);
    const lone = subs.find((s) => s.atom === PHANTOM);
    const ligands = t.neighbours.map((n) => (n === -1 ? h! : subs.find((s) => !s.dup && s.atom === n)!));
    if (t.neighbours.length === 3) ligands.push(lone!);
    const order = inOrder(new Ranker(p, budget), ligands, [c]);
    if (!Array.isArray(order)) return order;
    // (the configuration's volume, its first three as drawn, turned to the order of rank by the permutation's parity: R where, the
    //  lowest away, the three highest turn clockwise - the volume they span, seen from the centre, negative)
    const volume = t.volume * parity(order);
    return { label: volume < 0 ? "R" : "S" };
  } catch (e) {
    if (e instanceof TooLarge) return no("large");
    throw e;
  }
}

function doubleBond(p: Prepared, i: number): CipResult {
  const b = p.input.bonds[i];
  const stereo = b.stereo!;
  // (a double bond on a blended cycle is still the unit drawn: a cyclophane's bridge, its alternating cycle through both rings - Hanson et al. 2018 validation suite VS155)
  const k = b.a < b.b ? `${b.a},${b.b}` : `${b.b},${b.a}`;
  if (p.order.get(k) !== 2 && !p.blended.has(k)) return no("unsure");
  if (p.unsure[b.a] || p.unsure[b.b]) return no("unsure");
  const budget: Budget = { left: NODE_BUDGET };
  try {
    const g = new Digraph(p, [b.a, b.b], budget);
    const rank = new Ranker(p, budget);
    const high: number[] = [];
    for (const [k, end, other] of [
      [0, b.a, b.b],
      [1, b.b, b.a],
    ] as const) {
      const subs = g.substituentsOf(g.roots[k], other);
      if (subs.length !== 2) return no("unsure");
      const order = inOrder(rank, subs, [end, other]);
      if (!Array.isArray(order)) return order;
      high.push(subs[order[0]].atom);
    }
    const cis = (stereo.cis !== (high[0] !== stereo.refs[0])) !== (high[1] !== stereo.refs[1]);
    return { label: cis ? "Z" : "E" };
  } catch (e) {
    if (e instanceof TooLarge) return no("large");
    throw e;
  }
}

/**
 * The descriptors of a structure's configured centres (by atom index) and
 * double bonds (by bond index) - all of them, or those asked for.
 */
export function cipLabels(input: IdentityInput, ask?: { centres?: Iterable<number>; bonds?: Iterable<number> }): { centres: Map<number, CipResult>; bonds: Map<number, CipResult> } {
  const p = prepared(input);
  const centres = new Map<number, CipResult>();
  const bonds = new Map<number, CipResult>();
  const atomsAsked = ask?.centres ? [...ask.centres] : input.atoms.map((_, i) => i);
  const bondsAsked = ask?.bonds ? [...ask.bonds] : input.bonds.map((_, i) => i);
  for (const c of atomsAsked) if (input.atoms[c]?.tetra) centres.set(c, centre(p, c));
  for (const i of bondsAsked) if (input.bonds[i]?.stereo) bonds.set(i, doubleBond(p, i));
  return { centres, bonds };
}
