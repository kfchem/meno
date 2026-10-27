/**
 * A drawing made regular with its arrangement kept (the maintainer,
 * 2026-10-27, on structures read from a figure), where that has put two of
 * its parts in each other's way: cleared as the engine clears its own
 * (`untangle` - a branch turned off its angle, a little and then more, and
 * at last the bond it hangs from drawn longer), but only by moves that keep
 * the arrangement as drawn. No ring is turned, nor anything the caller
 * keeps as drawn (a chair's atoms); a ring system - with what is kept as
 * drawn on it - may be moved whole, its shape and its turn kept, by at most
 * `MOST_SLID` of a bond, and nothing else kept as drawn moves at all (the
 * maintainer, 2026-10-27). No turn leaves an atom's bonds closer than
 * `NARROWEST` - `NARROWEST_SP2` at an atom with a double bond - where they
 * were not already; and no move is taken that puts a
 * neighbour of any atom on the other side of another - a substituent across
 * its bond, a chain's turn the other way - from where the regular drawing
 * has it, which is where the drawing has it (the caller's to see to), but
 * for a pair drawn near in line and set to one side, held so, and a triple
 * bond's neighbours put in line, held in line.
 * Atoms only move: what is drawn on each bond is the caller's, and stays.
 * Pure.
 */
import { scorer, untangle } from "./engine";
import type { Point } from "./geometry";
import { key, perceive, type LayoutInput, type Molecule } from "./perceive";

/** How far a ring system may be moved whole, in bonds. */
export const MOST_SLID = 0.6;
/** The closest two of an atom's bonds may be left, where they were not already: at most atoms, and at one with a double bond. */
const NARROWEST = (100 * Math.PI) / 180;
const NARROWEST_SP2 = (110 * Math.PI) / 180;

/** How near a straight line, as a sine, two of an atom's bonds may be and count as in line. */
const STRAIGHT = Math.sin((10 * Math.PI) / 180);

/** Which way round `w` lies from `v` about `u`: -1, 1, or 0 for along its line. */
function sideOf(u: Point, v: Point, w: Point): number {
  const ax = v.x - u.x;
  const ay = v.y - u.y;
  const bx = w.x - u.x;
  const by = w.y - u.y;
  const s = (ax * by - ay * bx) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1);
  return Math.abs(s) < STRAIGHT ? 0 : Math.sign(s);
}

/** Every side a drawing gives: about each atom, each pair of its neighbours and which way round they are - or, `inLine`, 0 for those in line. */
function sidesOf(mol: Molecule, at: readonly Point[], inLine = false): [number, number, number, number][] {
  const sides: [number, number, number, number][] = [];
  mol.neighbours.forEach((ns, u) => {
    for (const v of ns)
      for (const w of ns) {
        if (v === w) continue;
        const s = sideOf(at[u], at[v], at[w]);
        if (s || inLine) sides.push([u, v, w, s]);
      }
  });
  return sides;
}

/**
 * `placed` - a drawing made regular, `bond` its bond length - with its
 * parts cleared out of each other's way, keeping the arrangement it has
 * (see above; the drawing's own, `_drawn`, is not read); the atoms `kept`
 * says are as drawn are not moved, nor any ring's. Where nothing is in the
 * way, or nothing can be moved so, `placed` as it is. Whether what is left
 * is clear enough is the caller's to judge.
 */
export function untangledKeeping(
  input: LayoutInput,
  placed: readonly Point[],
  _drawn: readonly Point[],
  bond: number,
  kept: (atom: number) => boolean = () => false,
): Point[] {
  const mol = perceive(input);
  // (each side the regular drawing gives - a pair in line, held in line:
  // where the drawing has a pair the other way round, an unsure atom's put
  // by the bonds about it, say, the regular drawing is the one kept to)
  const sides = sidesOf(mol, placed, true);
  const still = (a: number) => mol.systemOf[a] >= 0 || kept(a);
  const out = placed.map((p) => ({ x: p.x, y: p.y }));
  for (const piece of mol.pieces) {
    if (piece.length < 3) continue;
    // (in the engine's units, a bond 1)
    const start = new Map(piece.map((a) => [a, { x: placed[a].x / bond, y: placed[a].y / bond }]));
    const inPiece = new Set(piece);
    const mine = sides.filter(([u]) => inPiece.has(u));
    const arranged = (pos: Map<number, Point>) => mine.every(([u, v, w, s]) => sideOf(pos.get(u)!, pos.get(v)!, pos.get(w)!) === s);
    const benchmark = scorer(mol, piece);
    // (each move judged by where it leaves the atoms - a turn, a bond drawn
    // longer, whatever the engine tries: what is kept together - a ring
    // system, with what is kept as drawn on it - moved whole, if at all, by
    // one shift no longer than MOST_SLID; anything else kept, not at all;
    // `fixed` only spares the turns that would turn one)
    const together = keptTogether(mol, piece.filter(still));
    const held = (pos: Map<number, Point>) =>
      together.every((group) => {
        const ring = group.some((a) => mol.systemOf[a] >= 0);
        const dx = pos.get(group[0])!.x - start.get(group[0])!.x;
        const dy = pos.get(group[0])!.y - start.get(group[0])!.y;
        if (ring ? Math.hypot(dx, dy) > MOST_SLID + 1e-9 : dx !== 0 || dy !== 0) return false;
        return group.every((a) => Math.abs(pos.get(a)!.x - start.get(a)!.x - dx) < 1e-9 && Math.abs(pos.get(a)!.y - start.get(a)!.y - dy) < 1e-9);
      });
    // (and no atom's bonds left narrower than they may be, where they were not)
    const atoms = piece.filter((a) => mol.neighbours[a].length > 1);
    const narrowestOf = (pos: Map<number, Point>, a: number) => narrowest(pos.get(a)!, mol.neighbours[a].map((b) => pos.get(b)!));
    const least = new Map(atoms.map((a) => [a, angleFloor(doubled(mol, a), narrowestOf(start, a))]));
    const wide = (pos: Map<number, Point>) => atoms.every((a) => narrowestOf(pos, a) >= least.get(a)!);
    const score = (pos: Map<number, Point>) => (held(pos) && arranged(pos) && wide(pos) ? benchmark(pos) : Infinity);
    const { pos } = untangle(mol, piece, start, benchmark(start), score, (side) => side.some(still));
    for (const a of piece) out[a] = { x: pos.get(a)!.x * bond, y: pos.get(a)!.y * bond };
  }
  return out;
}

/** How close two of an atom's bonds may be left, in radians: NARROWEST, or NARROWEST_SP2 at one with a double bond - or as close as they `were`, where that is closer. */
export function angleFloor(double: boolean, were: number): number {
  return Math.min(double ? NARROWEST_SP2 : NARROWEST, were - 1e-9);
}

/** The atoms kept, in groups bonded together: a ring system, with what is kept as drawn on it, one group. */
function keptTogether(mol: Molecule, kept: readonly number[]): number[][] {
  const left = new Set(kept);
  const groups: number[][] = [];
  for (const a of kept) {
    if (!left.has(a)) continue;
    left.delete(a);
    const group = [a];
    for (let k = 0; k < group.length; k++)
      for (const b of mol.neighbours[group[k]])
        if (left.has(b)) {
          left.delete(b);
          group.push(b);
        }
    groups.push(group);
  }
  return groups;
}

/** The narrowest angle between two of an atom's bonds, at `at`, to `ends`. */
function narrowest(at: Point, ends: readonly Point[]): number {
  const turns = ends.map((e) => Math.atan2(e.y - at.y, e.x - at.x)).sort((p, q) => p - q);
  let least = 2 * Math.PI - (turns[turns.length - 1] - turns[0]);
  for (let i = 1; i < turns.length; i++) least = Math.min(least, turns[i] - turns[i - 1]);
  return least;
}

/** Whether an atom has a double bond. */
function doubled(mol: Molecule, a: number): boolean {
  return mol.neighbours[a].some((b) => mol.bonds[mol.bondIndex.get(key(a, b)) ?? -1]?.order === 2);
}
