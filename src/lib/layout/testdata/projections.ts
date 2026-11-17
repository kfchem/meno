/**
 * Structures drawn in perspective as a chemist draws them - a cyclohexane chair, a Haworth ring, a Newman projection - for the tests of how a
 * drawing with depth is read (lib/layout/drawn) and kept (the moves): places with a depth for the ring or the atom in front, none for the groups.
 */
import type { DrawnAtom, DrawnBond } from "../drawn";

export const rad = (d: number) => (d * Math.PI) / 180;

export type Place = "axial" | "equatorial";

/**
 * A cyclohexane chair seen from the side, as a textbook draws one: its six ring atoms with a depth, and a methyl
 * (no depth) on each ring atom of `groups` - the ring atom's index, and whether the methyl is axial or equatorial.
 * The ring is turned `tilt` degrees about the page's horizontal, nearer the viewer at the bottom.
 */
export function chair(
  groups: Record<number, Place | { place: Place; el?: string; hs?: number; branches?: number }>,
  tilt = 70,
  how?: "turned over" | "mirrored",
): { atoms: DrawnAtom[]; bonds: DrawnBond[] } {
  const R = 1.45;
  const BOND = 1.53;
  // (turned over - about the page's vertical, 180 degrees: the page mirrored and the depth turned, the compound kept - or only mirrored in the page, its depth as it was: the mirror image)
  const view = (p: [number, number, number]) => ({
    x: how ? -p[0] : p[0],
    y: p[1] * Math.cos(rad(tilt)) - p[2] * Math.sin(rad(tilt)),
    z: (how === "turned over" ? -1 : 1) * (p[1] * Math.sin(rad(tilt)) + p[2] * Math.cos(rad(tilt))),
  });
  const atoms: DrawnAtom[] = [];
  const bonds: DrawnBond[] = [];
  const ring: [number, number, number][] = [0, 1, 2, 3, 4, 5].map((k) => [R * Math.cos(rad(60 * k)), R * Math.sin(rad(60 * k)), k % 2 ? -0.25 : 0.25]);
  ring.forEach((p, k) => {
    const v = view(p);
    atoms.push({ x: v.x, y: v.y, z: v.z, hs: groups[k] ? 1 : 2, centre: true });
    if (k) bonds.push({ a: k - 1, b: k, order: 1 });
  });
  bonds.push({ a: 5, b: 0, order: 1 });
  for (const [k, spec] of Object.entries(groups)) {
    const i = Number(k);
    const { place, el = "C", hs = 3, branches = 0 } = typeof spec === "string" ? { place: spec } : spec;
    const s = ring[i][2] > 0 ? 1 : -1;
    const along: [number, number, number] =
      place === "axial"
        ? [0, 0, s]
        : [Math.cos(rad(60 * i)) * Math.cos(rad(19.5)), Math.sin(rad(60 * i)) * Math.cos(rad(19.5)), -s * Math.sin(rad(19.5))];
    const v = view([ring[i][0] + BOND * along[0], ring[i][1] + BOND * along[1], ring[i][2] + BOND * along[2]]);
    atoms.push({ x: v.x, y: v.y, el, hs });
    bonds.push({ a: i, b: atoms.length - 1, order: 1 });
    // (a group's own branches, drawn in the page either side of its bond, no depth)
    const from = atoms.length - 1;
    const dir = Math.atan2(v.y - atoms[i].y, v.x - atoms[i].x);
    for (let b = 0; b < branches; b++) {
      const turn = (b === 0 ? 1 : -1) * rad(35);
      atoms.push({ x: v.x + Math.cos(dir + turn), y: v.y + Math.sin(dir + turn), hs: 3 });
      bonds.push({ a: from, b: atoms.length - 1, order: 1 });
    }
  }
  return { atoms, bonds };
}

/**
 * A pyranose ring drawn as Haworth draws it, seen from a little above and in front: ring O at the back right, C1 at the right, C2 front right, C3 front left, C4 at the left, C5 back left,
 * every ring atom with a depth. `up` says, for C1 to C5, whether its group (an OH; CH2OH at C5) is drawn above the ring (true) or below. The groups have no depth.
 * `turn` steps of 60 degrees turn the ring about its axis, the ring O going round from the back right (McNaught 1996, 2-Carb-5.4: twelve such
 * representations, the ring turned and turned over; the lower edge is the nearer in each).
 */
export function haworth(up: [boolean, boolean, boolean, boolean, boolean], tilt = 20, turn = 0): { atoms: DrawnAtom[]; bonds: DrawnBond[] } {
  const R = 1.5;
  // the ring atoms, in the order O5, C1, C2, C3, C4, C5, as the ring runs
  const angles = [60, 0, -60, -120, 180, 120].map((a) => a - 60 * turn);
  const view = (X: number, H: number, D: number) => ({
    x: X,
    y: H * Math.cos(rad(tilt)) - D * Math.sin(rad(tilt)),
    z: D * Math.cos(rad(tilt)) + H * Math.sin(rad(tilt)),
  });
  const atoms: DrawnAtom[] = [];
  const bonds: DrawnBond[] = [];
  angles.forEach((a, k) => {
    const v = view(R * Math.cos(rad(a)), 0, -R * Math.sin(rad(a)));
    atoms.push({ x: v.x, y: v.y, z: v.z, el: k === 0 ? "O" : "C", hs: k === 0 ? 0 : 1, centre: true });
    if (k) bonds.push({ a: k - 1, b: k, order: 1 });
  });
  bonds.push({ a: 5, b: 0, order: 1 });
  up.forEach((isUp, j) => {
    const ring = j + 1;
    const a = angles[ring];
    const v = view(R * Math.cos(rad(a)), isUp ? 1.4 : -1.4, -R * Math.sin(rad(a)));
    atoms.push({ x: v.x, y: v.y, el: "O", hs: 1 });
    bonds.push({ a: ring, b: atoms.length - 1, order: 1 });
    if (j === 4) {
      // (C5's group is CH2OH: a carbon, then its O above it)
      atoms[atoms.length - 1] = { x: v.x, y: v.y, el: "C", hs: 2 };
      const w = view(R * Math.cos(rad(a)), isUp ? 2.8 : -2.8, -R * Math.sin(rad(a)));
      atoms.push({ x: w.x, y: w.y, el: "O", hs: 1 });
      bonds.push({ a: atoms.length - 2, b: atoms.length - 1, order: 1 });
    }
  });
  return { atoms, bonds };
}

/**
 * 2,3-dibromobutane as a Newman projection along C2-C3: C2 in front, C3 behind it in the same place on the page, each with a methyl, a bromine
 * (drawn at the angles given, degrees, from the circle's middle for the front atom, from its rim for the back one) and its H not drawn.
 */
export function newman(front: { methyl: number; bromine: number }, back: { methyl: number; bromine: number }): { atoms: DrawnAtom[]; bonds: DrawnBond[] } {
  const atoms: DrawnAtom[] = [
    { x: 0, y: 0, z: 1, hs: 1, centre: true },
    { x: 0, y: 0, z: 0, hs: 1, centre: true },
  ];
  const bonds: DrawnBond[] = [{ a: 0, b: 1, order: 1 }];
  const put = (from: number, r: number, deg: number, el: string, hs: number) => {
    atoms.push({ x: r * Math.cos(rad(deg)), y: r * Math.sin(rad(deg)), el, hs });
    bonds.push({ a: from, b: atoms.length - 1, order: 1 });
  };
  put(0, 1.6, front.methyl, "C", 3);
  put(0, 1.6, front.bromine, "Br", 0);
  put(1, 2.2, back.methyl, "C", 3);
  put(1, 2.2, back.bromine, "Br", 0);
  return { atoms, bonds };
}

