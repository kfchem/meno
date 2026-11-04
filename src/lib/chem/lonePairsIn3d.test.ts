import { describe, expect, it } from "vitest";
import { lonePairsIn3d, type AtomIn3d, type BondIn3d } from "./lonePairsIn3d";

/**
 * A pyramid of three about atom 0 at the origin, its lone pair up (+z): its
 * neighbours 1, 2 and 3 round it anticlockwise seen from above, each at
 * `r` and 19.5 degrees below the plane through it (a tetrahedral angle),
 * and any further atoms where `more` puts them - all of it in a mirror
 * (z turned) where `mirror`.
 */
function pyramid(r: readonly number[], more: readonly number[][] = [], mirror = false): number[] {
  const down = Math.sin((19.5 * Math.PI) / 180);
  const flat = Math.cos((19.5 * Math.PI) / 180);
  const round = [0, 120, 240].map((t, k) => [r[k] * flat * Math.cos((t * Math.PI) / 180), r[k] * flat * Math.sin((t * Math.PI) / 180), -r[k] * down]);
  return [[0, 0, 0], ...round, ...more].flatMap(([x, y, z]) => [x, y, mirror ? -z : z]);
}

// (methyl-ethyl-chlorophosphine: P, its methyl's C, its ethyl's two C, Cl - heavy atoms alone, synthetic)
const phosphine = (el = "P"): { atoms: AtomIn3d[]; bonds: BondIn3d[] } => ({
  atoms: [{ el }, { el: "C" }, { el: "C" }, { el: "Cl" }, { el: "C" }],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
    { a1: 0, a2: 3, order: 1 },
    { a1: 2, a2: 4, order: 1 },
  ],
});
const PLACES = [1.85, 1.85, 2.05];
const ETHYL = [[-1.6, 2.4, -0.3]];

describe("lonePairsIn3d", () => {
  it("reads a phosphine's P from its geometry: its three neighbours' volume, anticlockwise from below its lone pair negative, its mirror image the other", () => {
    // (by hand: the three at 0, 120 and 240 degrees round z, below the P; seen from the P, the volume u . (v x w) of
    // the first three bond vectors is -(3 sqrt(3)/2) r^3 cos^2(19.5) sin(19.5) - negative)
    const { atoms, bonds } = phosphine();
    const one = lonePairsIn3d(atoms, bonds, pyramid(PLACES, ETHYL), [0]);
    const other = lonePairsIn3d(atoms, bonds, pyramid(PLACES, ETHYL, true), [0]);
    expect(one?.read.get(0)).toEqual({ neighbours: [1, 2, 3], volume: -1 });
    expect(other?.read.get(0)).toEqual({ neighbours: [1, 2, 3], volume: 1 });
    // (the two keyed apart: two stereoisomers)
    expect(one!.key).not.toBe(other!.key);
  });

  it("reads an arsine's As and an N-chloro aziridine's N the same way", () => {
    const { atoms, bonds } = phosphine("As");
    const as = [false, true].map((m) => lonePairsIn3d(atoms, bonds, pyramid([1.95, 1.95, 2.15], ETHYL, m), [0]));
    expect(as.map((x) => x?.read.get(0)?.volume)).toEqual([-1, 1]);
    expect(as[0]!.key).not.toBe(as[1]!.key);
    // (N, its ring's two C - bonded to each other, a methyl on the first - and Cl: the N turned over, the ring kept)
    const aziridine = {
      atoms: [{ el: "N" }, { el: "C" }, { el: "C" }, { el: "Cl" }, { el: "C" }],
      bonds: [
        { a1: 0, a2: 1, order: 1 },
        { a1: 0, a2: 2, order: 1 },
        { a1: 1, a2: 2, order: 1 },
        { a1: 0, a2: 3, order: 1 },
        { a1: 1, a2: 4, order: 1 },
      ],
    };
    const ring = (side: 1 | -1) => [0, 0, 0, 1.47, 0, 0, 0.74, 1.27, 0, -0.9, -0.6, 1.3 * side, 2.2, -0.9, 0.9];
    const n = [1, -1].map((side) => lonePairsIn3d(aziridine.atoms, aziridine.bonds, ring(side as 1 | -1), [0]));
    expect(n.map((x) => x?.read.get(0)?.volume)).toEqual([1, -1]);
    expect(n[0]!.key).not.toBe(n[1]!.key);
  });

  it("keys one molecule the same whatever order its atoms are in", () => {
    const { atoms, bonds } = phosphine();
    const xyz = pyramid(PLACES, ETHYL);
    // (its atoms the other way round: atom i is now 4 - i)
    const turned = (i: number) => 4 - i;
    const atoms2 = atoms.map((_, i) => atoms[turned(i)]);
    const bonds2 = bonds.map((b) => ({ a1: turned(b.a1), a2: turned(b.a2), order: b.order }));
    const xyz2 = atoms.flatMap((_, i) => xyz.slice(3 * turned(i), 3 * turned(i) + 3));
    expect(lonePairsIn3d(atoms2, bonds2, xyz2, [4])!.key).toBe(lonePairsIn3d(atoms, bonds, xyz, [0])!.key);
  });

  it("reads nothing at a centre whose four atoms lie flat, at one of more or fewer bonds than three, or at an atom not asked", () => {
    const { atoms, bonds } = phosphine();
    const flat = pyramid(PLACES, ETHYL).map((v, k) => (k % 3 === 2 && k < 12 ? 0 : v));
    expect(lonePairsIn3d(atoms, bonds, flat, [0])).toBeNull();
    // (the ethyl's CH2, of two bonds here; and an atom not asked)
    expect(lonePairsIn3d(atoms, bonds, pyramid(PLACES, ETHYL), [2])).toBeNull();
    expect(lonePairsIn3d(atoms, bonds, pyramid(PLACES, ETHYL), [])).toBeNull();
  });
});
