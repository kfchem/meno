/**
 * A drawing made regular with its arrangement kept (the maintainer,
 * 2026-10-27, on structures read from a figure), where that has put two of
 * its parts in each other's way: cleared as the engine clears its own
 * (`untangle` - a branch turned off its angle, a little and then more, and
 * at last the bond it hangs from drawn longer), but only by moves that keep
 * the arrangement as drawn. No ring is turned or moved, nor anything the
 * caller keeps as drawn (a chair's atoms); and no move is taken that puts a
 * neighbour of any atom on the other side of another - a substituent across
 * its bond, a chain's turn the other way - from where the drawing has it.
 * Atoms only move: what is drawn on each bond is the caller's, and stays.
 * Pure.
 */
import { scorer, untangle } from "./engine";
import type { Point } from "./geometry";
import { perceive, type LayoutInput, type Molecule } from "./perceive";

/** How near a straight line, as a sine, two of an atom's bonds drawn may be and have no side to keep. */
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

/** Every side the drawing gives: about each atom, each pair of its neighbours not drawn in line, and which way round they are. */
function sidesOf(mol: Molecule, at: readonly Point[]): [number, number, number, number][] {
  const sides: [number, number, number, number][] = [];
  mol.neighbours.forEach((ns, u) => {
    for (const v of ns)
      for (const w of ns) {
        if (v === w) continue;
        const s = sideOf(at[u], at[v], at[w]);
        if (s) sides.push([u, v, w, s]);
      }
  });
  return sides;
}

/**
 * `placed` - a drawing made regular, `bond` its bond length - with its
 * parts cleared out of each other's way, keeping the arrangement `drawn`
 * gives (see above); the atoms `kept` says are as drawn are not moved, nor
 * any ring's. Where nothing is in the way, or nothing can be moved so,
 * `placed` itself. Whether what is left is clear enough is the caller's to
 * judge.
 */
export function untangledKeeping(
  input: LayoutInput,
  placed: readonly Point[],
  drawn: readonly Point[],
  bond: number,
  kept: (atom: number) => boolean = () => false,
): Point[] {
  const mol = perceive(input);
  // (the sides the drawing gives that the regular drawing keeps: one it set in line, or that was, is not held to)
  const now = new Set(sidesOf(mol, placed).map((s) => s.join()));
  const sides = sidesOf(mol, drawn).filter((s) => now.has(s.join()));
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
    const score = (pos: Map<number, Point>) => (arranged(pos) ? benchmark(pos) : Infinity);
    const { pos } = untangle(mol, piece, start, benchmark(start), score, (side) => side.some(still));
    for (const a of piece) out[a] = { x: pos.get(a)!.x * bond, y: pos.get(a)!.y * bond };
  }
  return out;
}
