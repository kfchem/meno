/**
 * Which way a solid is seen (foundation part 9): a parallel projection - a rotation to the page, x to the right, y up the page, z toward
 * the viewer, so a larger z is nearer - and the textbook's standard views of each solid. No page units: the tools scale.
 */
import { cross, dot, type FreePosition, type Solid, type V3 } from "./solids";

/** A rotation from the solid's space to the page: three unit vectors, as rows - the page's right, its up, and the way toward the viewer. */
export type View = { readonly right: V3; readonly up: V3; readonly toward: V3 };

export type Seen = { x: number; y: number; z: number };

const DEG = Math.PI / 180;

/** A point or direction as the page has it: parallel projection; `z` is its depth, nearer larger. */
export function project(view: View, p: V3): Seen {
  return { x: dot(view.right, p), y: dot(view.up, p), z: dot(view.toward, p) };
}

/** A solid's atoms as the page has them, in the order `atoms` has them. */
export function seen(solid: Solid, view: View): Seen[] {
  return solid.atoms.map((p) => project(view, p));
}

/** A solid's free positions as the page has them: each direction, as a page direction with its depth. */
export function seenFree(solid: Solid, view: View): { free: FreePosition; seen: Seen }[] {
  return solid.free.map((free) => ({ free, seen: project(view, free.direction) }));
}

/**
 * A ring seen from above and in front: the eye `elevation` degrees above the ring's plane, on the side of -y (y runs away from the viewer),
 * the solid turned `turn` degrees about its axis (z) first. The page's right is x, its up tilts toward +y by the elevation, and the nearer
 * atoms of a ring, the ones with the smaller y, are lower in the drawing. Derived: the eye is at (0, -cos e, sin e), the page's up
 * (0, sin e, cos e), right x; their cross product right x up = (0, -cos e, sin e) is the eye, so the rows are a right-handed rotation.
 */
export function fromAbove(elevation: number, turn = 0): View {
  const e = elevation * DEG;
  const t = turn * DEG;
  const [s, c] = [Math.sin(e), Math.cos(e)];
  // (the solid turned about z by `turn`: the rows turned the other way)
  const [ct, st] = [Math.cos(t), Math.sin(t)];
  const turned = (v: V3): V3 => [ct * v[0] + st * v[1], -st * v[0] + ct * v[1], v[2]];
  const right = turned([1, 0, 0]);
  const up = turned([0, s, c]);
  return { right, up, toward: cross(right, up) };
}

/**
 * The elevation a ring is seen from, in degrees. By eye: the look owner's choice, no basis claimed. What the texts say is only that
 * the ring is seen from above, so that the nearer edge is drawn lower (Brecher 2006, ST-3.1, for a ring system in perspective: drawn "from
 * above and from the right", so that the nearer atoms of a mostly-horizontal ring are lower in the drawing; McNaught 1996, 2-Carb-5.4,
 * for the Haworth ring: "viewed from slightly above so that the edge closer to the viewer is drawn below the more distant edge"). The
 * "from the right" of ST-3.1 is not taken: the standard view is straight from the front, its turn naught - by convention, no basis claimed.
 */
export const CHAIR_ELEVATION_DEG = 25;
export const HAWORTH_ELEVATION_DEG = 30;

/**
 * A solid's textbook view.
 *  - A chair: from above and in front (Brecher 2006, ST-3.1); `form` 0 the chair with its first atom - the one above the mean plane - at the
 *    right, its head up; `form` 1 the same solid turned half a turn about its axis, the other textbook chair, each the other's mirror picture
 *    (a chair is symmetric about the plane through atoms 0 and 3, so turned half way round it is the mirror picture of itself).
 *  - A boat, half-chair and envelope: seen as the chair is.
 *  - A Haworth ring: from slightly above, so that the edge closer to the viewer is drawn below the more distant one, the oxygen behind and C-1
 *    at the right-hand end (McNaught 1996, 2-Carb-5.4) - which `haworth` has built: the ring O first, at the back; the elevation `HAWORTH_ELEVATION_DEG`.
 *  - A Newman pair: along its line of sight, the front atom nearer.
 */
export function standardView(solid: Solid, form = 0): View {
  switch (solid.kind) {
    case "newman":
      return { right: [1, 0, 0], up: [0, 1, 0], toward: [0, 0, 1] };
    case "haworth":
      return fromAbove(HAWORTH_ELEVATION_DEG);
    default:
      return fromAbove(CHAIR_ELEVATION_DEG, form === 1 ? 180 : 0);
  }
}
