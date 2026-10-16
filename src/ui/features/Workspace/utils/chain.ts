/**
 * A chain traced on its honeycomb (./honeycomb): the walk the pointer leads
 * it on, bond by bond. Pure.
 *
 * - The pointer leads: the chain goes along the honeycomb to the point
 *   nearest it, one bond at a time, each to the next point nearer the
 *   pointer; led back the way it came - or beside it, near enough - it
 *   takes its bonds back again, as far as the point it is led back to.
 * - Led round, along the honeycomb, to a point it has been through - not
 *   straight back the way it came, but round, so that the way the pointer
 *   went encloses room - it closes the ring that way makes: round one
 *   hexagon, a six-membered ring; round two, a ten-membered one; and so on.
 *   Back to such a point without going round, it is taken back to it.
 * - It draws the honeycomb's rings and no other (the maintainer, 2026-10-07
 *   and 2026-10-08): a loop that does not come round to a point of the
 *   chain draws no ring of its own, and a ring of another size is drawn by
 *   hand. A loop is taken as the hand meant it: a way out and back that
 *   encloses only a sliver goes round nothing.
 */
import { cellOf, honeycombFrom, neighboursOf, type Cell, type Honeycomb, type Pt } from "./honeycomb";

export type Chain = {
  honeycomb: Honeycomb;
  /** The points of the honeycomb the chain has gone through, from its start: one bond a step. A point it came round to again is in it again. */
  walk: string[];
  /** Where the pointer has been; and for each step of the walk after the first, where in that it was taken. */
  trail: Pt[];
  stepAt: number[];
};

/** How much nearer the pointer the next point has to be than the one the chain is at, as a part of a bond. */
const STEP_MARGIN = 0.12;
/** How much further from the pointer the point the chain came from may be than another, and still be gone back to first. */
const BACK_MARGIN = 0.25;
/** How far the pointer has to have gone for another point of the trail, as a part of a bond. */
const TRAIL_STEP = 0.04;
/** The least a loop encloses and the least way it goes, in a bond's squares and lengths, to go round. */
const LOOP_AREA = 0.35;
const LOOP_LENGTH = 2.3;
/** How round a loop has to be to go round: 4π times what it encloses over its length squared, 1 for a circle. */
const LOOP_ROUND = 0.45;
/** How far apart a loop's points are taken, as a part of a bond: any closer, and the hand's tremble lengthens it. */
const LOOP_STEP = 0.25;

/**
 * The trail the pointer leaves, as it is drawn: from where the pointer was
 * first seen, not from the chain's start. A chain begun from Quick Add's icon
 * starts where the double-click was and its trail's first point is where the
 * pointer then is - the icon, up and to the right of it, with a move there
 * before or after the press - and a line joining them, drawn, was no path
 * the pointer took. None until there are two of the pointer's own points.
 */
export function trailShown(trail: readonly Pt[]): readonly Pt[] {
  return trail.length > 2 ? trail.slice(1) : [];
}

/** A chain from `start`, its honeycomb turned so that a bond it already has (`bondedTo`) is one of its own. */
export function startChain(start: Pt, bondedTo: Pt[], length: number): Chain {
  const honeycomb = honeycombFrom(start, bondedTo, length);
  return { honeycomb, walk: ["0,0,A"], trail: [{ ...start }], stepAt: [] };
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** The chain after the pointer has moved to `pointer`. */
export function followChain(c: Chain, pointer: Pt): Chain {
  const L = c.honeycomb.length;
  const last = c.trail[c.trail.length - 1];
  const trail = dist(last, pointer) >= TRAIL_STEP * L ? [...c.trail, { ...pointer }] : c.trail;
  let walk = c.walk;
  let stepAt = c.stepAt;
  for (let i = 0; i < 64; i++) {
    const head: Cell = cellOf(c.honeycomb, walk[walk.length - 1]);
    const ways = neighboursOf(c.honeycomb, head);
    let best: Cell | null = null;
    for (const o of ways) if (!best || dist(o, pointer) < dist(best, pointer)) best = o;
    // (back the way it came, rather than off beside it, when the two are
    // much the same)
    const came = walk.length >= 2 ? ways.find((o) => o.key === walk[walk.length - 2]) : undefined;
    if (came && best && dist(came, pointer) <= dist(best, pointer) + BACK_MARGIN * L) best = came;
    if (!best || dist(best, pointer) >= dist(head, pointer) - STEP_MARGIN * L) break;
    if (walk.length >= 2 && best.key === walk[walk.length - 2]) {
      // back the way it came: the bond goes again
      walk = walk.slice(0, -1);
      stepAt = stepAt.slice(0, -1);
      continue;
    }
    // round to a point it has been through: the ring the way round makes,
    // the honeycomb's; back to it without going round, the chain taken
    // back to it
    const back = walk.lastIndexOf(best.key);
    if (back >= 0 && back < walk.length - 1 && !wentRound(best, trail.slice(stepAt[back]), L)) {
      walk = walk.slice(0, back + 1);
      stepAt = stepAt.slice(0, back);
      continue;
    }
    walk = [...walk, best.key];
    stepAt = [...stepAt, trail.length - 1];
  }
  return { ...c, trail, walk, stepAt };
}

/**
 * Whether the pointer went round, back to `j`, along `loop`: the way it
 * went encloses room enough, is long enough and round enough - not a step
 * straight back, nor out and back beside the way out.
 */
function wentRound(j: Pt, loop: Pt[], L: number): boolean {
  // (its points no closer than the hand is steady; and all the way round:
  // the pointer may not be quite back yet)
  const path = [j];
  for (const p of loop) if (dist(p, path[path.length - 1]) >= LOOP_STEP * L) path.push(p);
  const end = loop[loop.length - 1];
  if (end && path[path.length - 1] !== end) path.push(end);
  let length = dist(path[path.length - 1], j);
  for (let i = 1; i < path.length; i++) length += dist(path[i - 1], path[i]);
  let area = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    const q = path[(i + 1) % path.length];
    area += p.x * q.y - q.x * p.y;
  }
  const encloses = Math.abs(area / 2);
  return encloses >= LOOP_AREA * L * L && length >= LOOP_LENGTH * L && (4 * Math.PI * encloses) / (length * length) >= LOOP_ROUND;
}
