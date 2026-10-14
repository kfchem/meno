/**
 * Where a bond being drawn out of an atom goes, as the pointer leads it.
 *
 * A bond drawn on its own points at the pointer, held to a 30-degree grid -
 * except that it is drawn to the direction that makes 120 degrees with a
 * bond already at the atom whenever the pointer is near it, which is where
 * a chemist's next bond almost always goes. A chain drawn in one stroke
 * turns 120 degrees at every atom, one way or the other, whichever brings
 * it nearer the pointer, and zigzags when the pointer goes straight.
 */

export type Pt = { x: number; y: number };

const TAU = Math.PI * 2;
const GRID = Math.PI / 6; // 30°
const TRIGONAL = (2 * Math.PI) / 3; // 120°
/** How near the pointer's direction has to be for 120° to take it. */
const TRIGONAL_REACH = (20 * Math.PI) / 180;
/** How near another bond a new one may point: 60 degrees, not 30 or 0. */
const CROWDED = (45 * Math.PI) / 180;
/**
 * How much farther from the pointer than the best angle the one the bond
 * was at may be and still be kept: a bond swung onto another at the atom
 * has two angles equally near the pointer on either side of it, and
 * without this it went to and fro between them as the pointer crossed.
 */
const KEEP = (14 * Math.PI) / 180;

const norm = (a: number) => ((a % TAU) + TAU) % TAU;
const between = (a: number, b: number) => {
  const d = Math.abs(norm(a) - norm(b));
  return d > Math.PI ? TAU - d : d;
};
const toward = (from: Pt, to: Pt) => Math.atan2(to.y - from.y, to.x - from.x);
const out = (from: Pt, angle: number, length: number): Pt => ({
  x: from.x + length * Math.cos(angle),
  y: from.y + length * Math.sin(angle),
});

export type SnappedBond = {
  /** Where the new atom goes. */
  end: Pt;
  angle: number;
  /**
   * The direction of the bond it makes 120 degrees with, when that is what
   * it snapped to: the arc between the two is shown, so a 120-degree bond
   * can be told from one that only happens to sit on the grid.
   */
  trigonalTo?: number;
};

/**
 * A single bond out of `tip`, which already has bonds to `neighbours`,
 * toward `pointer`, `length` long. `held` is the angle it was last at, kept
 * - in the tie only, the two angles either side of a bond at the atom -
 * while it is no farther from the pointer than `KEEP` more than the
 * angle it would go to, and no nearer another bond than one may be.
 */
export function snapBond(
  tip: Pt,
  neighbours: Pt[],
  pointer: Pt,
  length: number,
  held?: number,
): SnappedBond {
  const found = snapFresh(tip, neighbours, pointer, length);
  if (held == null) return found;
  const want = toward(tip, pointer);
  const taken = neighbours
    .filter((n) => Math.hypot(n.x - tip.x, n.y - tip.y) > 1e-9)
    .map((n) => toward(tip, n));
  if (between(held, found.angle) < 1e-9) return found;
  if (taken.some((a) => between(a, held) < CROWDED)) return found;
  // only the tie: the angle it was at and the one it goes to are the two either side of a bond at the atom,
  // as near each other as the grid's steps - a 120-degree snap or a grid angle elsewhere is not held
  if (!taken.some((a) => between(a, held) <= 2 * GRID + 1e-6 && between(a, found.angle) <= 2 * GRID + 1e-6 && between(held, found.angle) > 1e-9)) return found;
  if (between(held, want) > between(found.angle, want) + KEEP) return found;
  const from = taken.find((a) => [TRIGONAL, -TRIGONAL].some((turn) => between(norm(a + turn), held) < 1e-6));
  return { end: out(tip, held, length), angle: norm(held), ...(from != null ? { trigonalTo: from } : {}) };
}

function snapFresh(
  tip: Pt,
  neighbours: Pt[],
  pointer: Pt,
  length: number,
): SnappedBond {
  const want = toward(tip, pointer);
  const taken = neighbours
    .filter((n) => Math.hypot(n.x - tip.x, n.y - tip.y) > 1e-9)
    .map((n) => toward(tip, n));
  let best: { angle: number; from: number; off: number } | null = null;
  for (const from of taken) {
    for (const turn of [TRIGONAL, -TRIGONAL]) {
      const angle = norm(from + turn);
      // not onto, or crowding, another bond at the atom
      if (taken.some((t) => between(t, angle) < CROWDED)) continue;
      const off = between(angle, want);
      if (off <= TRIGONAL_REACH && (!best || off < best.off)) {
        best = { angle, from, off };
      }
    }
  }
  if (best) {
    return {
      end: out(tip, best.angle, length),
      angle: best.angle,
      trigonalTo: best.from,
    };
  }
  // the grid angle nearest the pointer that does not run into a bond there
  const near = Math.round(want / GRID) * GRID;
  let angle = near;
  for (let k = 0; k <= 6; k++) {
    const tries = k === 0 ? [near] : [near + k * GRID, near - k * GRID];
    tries.sort((a, b) => between(a, want) - between(b, want));
    const free = tries.find((a) => !taken.some((t) => between(t, a) < CROWDED));
    if (free != null) {
      angle = free;
      break;
    }
  }
  return { end: out(tip, angle, length), angle };
}

