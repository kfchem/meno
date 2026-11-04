/**
 * One drawing becoming another of the same structure (docs/WORKSPACE.md,
 * *Stacks of drawings*): which atom of one is which of the other, and how
 * the one is turned to lie on the other - what a stack of records lines up
 * by as it is opened, and what its records move by as one is let go of and
 * the next comes. Two drawings of one constitution are matched atom for
 * atom (scaffold.ts `coreMatches`), of the ways a symmetric structure
 * matches the one that moves its atoms least; any other pair is not
 * matched, and is never matched in part.
 */
import { bareGraph, coreMatches, graphText } from "./scaffold";
import type { LayoutInput } from "./perceive";

/** An atom of a drawing as a match reads it: its element and charge, the label it is drawn with where it is one (a group), and where it stands. */
export type MatchAtom = { el: string; charge?: number; label?: string; x: number; y: number };
/** A bond of a drawing as a match reads it: its atoms, by their places in the drawing's list, and its order. */
export type MatchBond = { a: number; b: number; order: number };
export type MatchDrawing = { atoms: readonly MatchAtom[]; bonds: readonly MatchBond[] };

/** The most atoms a drawing may have and still be matched: past it, a stack's records go over without moving. */
export const MATCH_MOST_ATOMS = 300;
/** The most ways a symmetric structure is matched that are looked at for the one that moves its atoms least. */
export const MATCH_MOST_WAYS = 240;

type Point = { x: number; y: number };

/** A rigid fit of points onto others: turned by `cos`/`sin` about the middle of the first, mirrored first where `mirror` is -1, and moved so that middle lies on the second's; `off`, the sum of the squared distances left. */
export type Fit = { mirror: 1 | -1; cos: number; sin: number; from: Point; to: Point; off: number };

const input = (d: MatchDrawing): LayoutInput => ({ atoms: d.atoms.map((a) => ({ el: a.el, ...(a.charge ? { charge: a.charge } : {}) })), bonds: d.bonds });

/**
 * The fit of points `p` onto points `q`, pair for pair (least squares - Kabsch's, in the plane, as `laidOnto`): turned only,
 * or mirrored too where `mirror` allows it and that fits better.
 */
export function fitOnto(p: readonly Point[], q: readonly Point[], mirror = false): Fit {
  const n = p.length;
  const mid = (v: readonly Point[]) => ({ x: v.reduce((s, a) => s + a.x, 0) / Math.max(1, n), y: v.reduce((s, a) => s + a.y, 0) / Math.max(1, n) });
  const from = mid(p);
  const to = mid(q);
  const fit = (m: 1 | -1): Fit => {
    let c = 0;
    let s = 0;
    for (let i = 0; i < n; i++) {
      const u = m * (p[i].x - from.x);
      const v = p[i].y - from.y;
      const X = q[i].x - to.x;
      const Y = q[i].y - to.y;
      c += u * X + v * Y;
      s += u * Y - v * X;
    }
    const t = Math.atan2(s, c);
    const [cos, sin] = [Math.cos(t), Math.sin(t)];
    let off = 0;
    for (let i = 0; i < n; i++) {
      const u = m * (p[i].x - from.x);
      const v = p[i].y - from.y;
      off += (cos * u - sin * v - (q[i].x - to.x)) ** 2 + (sin * u + cos * v - (q[i].y - to.y)) ** 2;
    }
    return { mirror: m, cos, sin, from, to, off };
  };
  const plain = fit(1);
  if (!mirror) return plain;
  const flipped = fit(-1);
  return flipped.off < plain.off - 1e-9 ? flipped : plain;
}

/** Where a fit takes a point. */
export function fitted(f: Fit, a: Point): Point {
  const u = f.mirror * (a.x - f.from.x);
  const v = a.y - f.from.y;
  return { x: f.to.x + f.cos * u - f.sin * v, y: f.to.y + f.sin * u + f.cos * v };
}

/**
 * Which atom of `from` each atom of `to` is, where the two are one constitution - the same atoms, elements, charges and
 * labels, bonded alike (each bond in its aromatic form, so two Kekulé structures are one) - of the ways it matches (a
 * symmetric structure's, at most `MATCH_MOST_WAYS`) the one that moves its atoms least, their middles laid on each
 * other: so a ring turns the least it can.
 * Null where they are not one constitution, or either has more than `MATCH_MOST_ATOMS` atoms.
 */
export function sameAtoms(from: MatchDrawing, to: MatchDrawing): number[] | null {
  const n = from.atoms.length;
  if (!n || n !== to.atoms.length || n > MATCH_MOST_ATOMS || from.bonds.length !== to.bonds.length) return null;
  const a = input(from);
  const b = input(to);
  const all = [...Array(n).keys()];
  if (graphText(bareGraph(a, all)) !== graphText(bareGraph(b, all))) return null;
  // (each way `to` is found in `from`: for each atom of `to`, its atom in `from` - the same element; its charge and label too)
  const alike = (i: number, j: number) => (to.atoms[i].charge ?? 0) === (from.atoms[j].charge ?? 0) && (to.atoms[i].label ?? "") === (from.atoms[j].label ?? "");
  const ways = coreMatches(b, a, MATCH_MOST_WAYS).filter((w) => w.every((j, i) => alike(i, j)));
  // (how far its atoms go, their middles laid on each other but not turned: of a ring's ways, the one turned least)
  const mid = (v: readonly Point[]) => ({ x: v.reduce((s, p) => s + p.x, 0) / n, y: v.reduce((s, p) => s + p.y, 0) / n });
  const p = mid(to.atoms);
  const q = mid(from.atoms);
  let best: number[] | null = null;
  let least = Infinity;
  for (const w of ways) {
    let off = 0;
    for (let i = 0; i < n; i++) off += (to.atoms[i].x - p.x - (from.atoms[w[i]].x - q.x)) ** 2 + (to.atoms[i].y - p.y - (from.atoms[w[i]].y - q.y)) ** 2;
    if (off < least - 1e-9) {
      least = off;
      best = w;
    }
  }
  return best;
}

/**
 * Where atom `i` of a drawing coming in stands at `t` (0 to 1) of its going over from another's places: at 0 on the place
 * it is matched to (`was`), at 1 on its own (`now`), between them turned as one - by the fit of the one onto the other,
 * the shorter way round, never mirrored - and moved, with what the turn leaves of each atom's way taken in a straight
 * line. `f` is the fit of `now` onto `was` (`fitOnto`, not mirrored).
 */
export function morphAt(f: Fit, was: Point, now: Point, t: number): Point {
  const angle = Math.atan2(f.sin, f.cos) * (1 - t);
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const u = now.x - f.from.x;
  const v = now.y - f.from.y;
  const turned = fitted(f, now);
  const left = { x: was.x - turned.x, y: was.y - turned.y };
  const mid = { x: f.from.x + (f.to.x - f.from.x) * (1 - t), y: f.from.y + (f.to.y - f.from.y) * (1 - t) };
  return { x: mid.x + cos * u - sin * v + left.x * (1 - t), y: mid.y + sin * u + cos * v + left.y * (1 - t) };
}
