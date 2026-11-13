/**
 * Which way a solid is seen (foundation part 9): a parallel projection - a rotation to the page, x to the right, y up the page, z toward
 * the viewer, so a larger z is nearer - and the textbook's standard views of each solid. No page units: the tools scale.
 */
import { cross, distance, dot, type FreePosition, type Solid, type V3, scale, sub } from "./solids";

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
 * The elevation a ring is seen from, in degrees, over the ring's MEAN plane: a matter of look, no basis claimed. What the texts say
 * is only that the ring is seen from above, so that the nearer edge is drawn lower (Brecher 2006, ST-3.1, for a ring system in perspective:
 * drawn "from above and from the right", so that the nearer atoms of a mostly-horizontal ring are lower in the drawing; McNaught 1996,
 * 2-Carb-5.4, for the Haworth ring: "viewed from slightly above so that the edge closer to the viewer is drawn below the more distant edge").
 */
export const CHAIR_ELEVATION_DEG = 15;
export const HAWORTH_ELEVATION_DEG = 30;

/**
 * How far a chair is turned about its axis in its standard view, in degrees: the eye is atan(sqrt(3)/5) = 19.107 degrees from the line through
 * two opposite atoms, which puts the head - atom 0, at the right - 30 - 19.107 = 10.893 degrees from the page's right. Derived, not chosen:
 * at that turn the six atoms, atoms 0 to 5, stand across the page at x = R cos(60 k + turn) in the ratio 3, 1, -2, -3, -1, 2, so -3, -2, -1, 1, 2
 * and 3 in order of x, equally spaced, which is the textbook's far seat line offset toward the foot.
 */
export const CHAIR_TURN_DEG = 30 - Math.atan(Math.sqrt(3) / 5) / DEG;

/**
 * A solid's textbook view: the view that gives the DEPTH of a chair, and what `seen` shows.
 *  - A chair: the ring's axis up the page, the eye `CHAIR_ELEVATION_DEG` over the mean plane and the solid turned `CHAIR_TURN_DEG` about the axis
 *    (Brecher 2006, ST-3.1: from above, the nearer atoms lower in the drawing); `form` 0 the chair with its first atom at the right end of the page.
 *    A chair whose first atom lies below the mean plane (the ring flip) is turned the other way, so that it is seen as the first chair's mirror
 *    picture, its first atom the low end at the right. `form` 1 is the SAME solid seen from the other side of its own mirror plane through atoms 0
 *    and 3: the eye turned about the axis to 180 degrees minus the turn of form 0 (from the opposite azimuth), the head at the left. The picture is
 *    form 0's with x turned about, with atoms 1 and 5, 2 and 4 changing places, and each atom's depth is its depth in THAT view. It is never form 0's
 *    picture mirrored with every atom keeping its own depth: that is the mirror image of the solid, and reads as the other configuration.
 *  - A boat, half-chair and envelope: seen as the first chair is.
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
    default: {
      const turn = solid.kind === "chair" && solid.atoms[0][2] < 0 ? -CHAIR_TURN_DEG : CHAIR_TURN_DEG;
      return fromAbove(CHAIR_ELEVATION_DEG, form === 1 ? 180 - turn : turn);
    }
  }
}

/**
 * The three lines a chair's ring bonds are drawn along in the textbook's chair, as angles on the page in degrees (a line is the angle and its
 * half turn): the seat, falling toward the head's end; the steep bond, 60; the gentle one, rising toward the head. Read by eye from two textbook
 * figures: a matter of look, no basis claimed. The axial bond is vertical and the equatorial one is drawn along the ring bond one removed.
 */
export const CHAIR_SEAT_DEG = -15;
export const CHAIR_STEEP_DEG = 60;
export const CHAIR_GENTLE_DEG = 15;

/** A solid as it is drawn: every atom's place on the page by the rule of drawing and its depth by the view, and each free position's drawn direction and depth. */
export type Drawn = { atoms: Seen[]; free: { free: FreePosition; x: number; y: number; z: number }[] };

const LATTICE_TOLERANCE = 1e-6;

/** The angle between a direction on the page and a line (an angle and its half turn), in degrees, 0 to 90. */
function lineGap(direction: number, line: number): number {
  const d = (((direction - line) % 180) + 180) % 180;
  return Math.min(d, 180 - d);
}

/** The orderings of three. */
const ORDERS: [number, number, number][] = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

/**
 * A chair, and chairs fused, as the textbook DRAWS them - a convention, not a view of the solid (as ruled): an ideal chair's bonds, ring and
 * free, lie along four directions in space: out of an atom above the mean plane, to its two ring neighbours, its equatorial bond and its axial
 * one (the four sum to nothing); out of an atom below, the same four reversed. Chairs fused by `fused`, trans or cis, stay on the same four.
 * Each is drawn one way, ONE BOND LONG: the ring's three directions along the three lines `CHAIR_SEAT_DEG`, `CHAIR_STEEP_DEG` and `CHAIR_GENTLE_DEG`
 * - each the line nearest to where the standard view puts that bond, one to each, pointing as the view points it - and the axis vertical. An
 * atom's place is the sum of the drawn bonds from the first atom to it, then the first ring's centre is put at the page's origin; every ring
 * closes, since a chair goes along each of its three directions once each way. A free position is drawn along its own direction's image: an axial
 * one vertical, an equatorial one parallel to the ring bonds one removed, nothing more. DEPTH is the true view's: each atom's, and each free
 * direction's, in the standard view of the solid (`form` as `standardView`: for form 1 the solid seen from the other side of its mirror plane, the lines of the convention reflected, never the form-0 drawing mirrored with each atom's depth kept), so that the drawing is read back as the solid is - the nearer wins.
 *
 * Null for a solid with a bond or a free direction off the four (the boat, half-chair, envelope, a five-ring fused on, with its `miss`): those
 * are `seen`. The Haworth ring and the Newman pair are `seen` as well.
 */
export function drawn(solid: Solid, form = 0): Drawn | null {
  if (solid.kind !== "chair" || solid.miss != null || solid.atoms.length < 6) return null;
  const view = standardView(solid, form);
  // (the ring's three bond directions, by the first six atoms in order, and the axis: the four of the lattice)
  const ring = [sub(solid.atoms[1], solid.atoms[0]), sub(solid.atoms[2], solid.atoms[1]), sub(solid.atoms[3], solid.atoms[2])];
  const axis: V3 = [0, 0, 1];
  const classes = [...ring, axis];
  // (where the view puts each of the ring's three, as an angle on the page; the axis stands vertical)
  const true2d = ring.map((v) => project(view, v));
  const angles = true2d.map((p) => Math.atan2(p.y, p.x) / DEG);
  // (the lines of the convention, or - for a chair seen as the first one's mirror picture - their reflection in the page's vertical: whichever
  // the view's own picture lies nearer; one line to each of the three, the pairing that leaves the least total gap)
  const lines = [CHAIR_GENTLE_DEG, CHAIR_SEAT_DEG, CHAIR_STEEP_DEG];
  const choices = [lines, lines.map((a) => 180 - a)].flatMap((set) => ORDERS.map((o) => ({ set, o, gap: o.reduce((sum, line, k) => sum + lineGap(angles[k], set[line]), 0) })));
  const { set, o: pairing } = choices.sort((p, q) => p.gap - q.gap)[0];
  const images: [number, number][] = true2d.map((p, k) => {
    const a = set[pairing[k]] * DEG;
    const along: [number, number] = [Math.cos(a), Math.sin(a)];
    // (pointing as the view points it)
    return along[0] * p.x + along[1] * p.y >= 0 ? along : [-along[0], -along[1]];
  });
  images.push([0, 1]);
  /** A direction in space as the lattice has it: its class and its sign, or none. */
  const classify = (w: V3): { image: [number, number]; sign: 1 | -1 } | null => {
    for (let k = 0; k < 4; k++) {
      for (const sign of [1, -1] as const) if (distance(w, scale(classes[k], sign)) < LATTICE_TOLERANCE) return { image: images[k], sign };
    }
    return null;
  };
  const step = (w: V3): [number, number] | null => {
    const c = classify(w);
    return c ? [c.image[0] * c.sign, c.image[1] * c.sign] : null;
  };
  // (the places: from atom 0, along each bond of the solid, the first time an atom is reached)
  const places: ([number, number] | null)[] = solid.atoms.map(() => null);
  places[0] = [0, 0];
  const queue = [0];
  while (queue.length) {
    const u = queue.shift()!;
    for (const [a, b] of solid.bonds) {
      const [from, to] = a === u ? [a, b] : b === u ? [b, a] : [-1, -1];
      if (from < 0 || places[to]) continue;
      const d = step(sub(solid.atoms[to], solid.atoms[from]));
      if (!d) return null;
      places[to] = [places[from]![0] + d[0], places[from]![1] + d[1]];
      queue.push(to);
    }
  }
  if (places.some((p) => !p)) return null;
  // (every bond is drawn along its own direction's image: the rings close on the page, whichever way they were reached)
  for (const [a, b] of solid.bonds) {
    const d = step(sub(solid.atoms[b], solid.atoms[a]));
    if (!d || Math.hypot(places[b]![0] - places[a]![0] - d[0], places[b]![1] - places[a]![1] - d[1]) > 1e-9) return null;
  }
  const centre = [0, 1, 2, 3, 4, 5].reduce<[number, number]>((c, k) => [c[0] + places[k]![0] / 6, c[1] + places[k]![1] / 6], [0, 0]);
  const atoms = solid.atoms.map((p, k): Seen => ({ x: places[k]![0] - centre[0], y: places[k]![1] - centre[1], z: dot(view.toward, p) }));
  const free = [];
  for (const f of solid.free) {
    const d = step(f.direction);
    if (!d) return null;
    free.push({ free: f, x: d[0], y: d[1], z: dot(view.toward, f.direction) });
  }
  return { atoms, free };
}
