import { describe, expect, it } from "vitest";
import { lonePairsIn3d, MOST_ANGLE_SUM, type AtomIn3d, type BondIn3d } from "./lonePairsIn3d";

const RAD = Math.PI / 180;

/**
 * A pyramid of three about atom 0 at the origin, its lone pair up (+z): its
 * neighbours 1, 2 and 3 round it anticlockwise seen from above, each at
 * `r` and 19.5 degrees below the plane through it (a tetrahedral angle),
 * and any further atoms where `more` puts them - all of it in a mirror
 * (z turned) where `mirror`.
 */
function pyramid(r: readonly number[], more: readonly number[][] = [], mirror = false): number[] {
  const down = Math.sin(19.5 * RAD);
  const flat = Math.cos(19.5 * RAD);
  const round = [0, 120, 240].map((t, k) => [r[k] * flat * Math.cos(t * RAD), r[k] * flat * Math.sin(t * RAD), -r[k] * down]);
  return [[0, 0, 0], ...round, ...more].flatMap(([x, y, z]) => [x, y, mirror ? -z : z]);
}

/**
 * The same pyramid, its three bonds 1.85 long and `angle` degrees from each
 * other, so that its three angles add up to three times that: each bond as
 * far below the plane as cos(angle) = -1/2 + 3/2 s^2 puts it (s its height
 * over its length, three bonds 120 degrees apart round z), flat at 120.
 */
function even(angle: number): number[] {
  const s = Math.sqrt(Math.max(0, (Math.cos(angle * RAD) + 0.5) / 1.5));
  const c = Math.sqrt(1 - s * s);
  return [[0, 0, 0], ...[0, 120, 240].map((t) => [1.85 * c * Math.cos(t * RAD), 1.85 * c * Math.sin(t * RAD), -1.85 * s]), [-1.6, 2.4, -0.3]].flat();
}

// (methyl-ethyl-chlorophosphine: P, its methyl's C, its ethyl's two C, Cl - heavy atoms alone, synthetic)
const phosphine = (el = "P", third = "Cl"): { atoms: AtomIn3d[]; bonds: BondIn3d[] } => ({
  atoms: [{ el }, { el: "C" }, { el: "C" }, { el: third }, { el: "C" }],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
    { a1: 0, a2: 3, order: 1 },
    { a1: 2, a2: 4, order: 1 },
  ],
});
const PLACES = [1.85, 1.85, 2.05];
const ETHYL = [[-1.6, 2.4, -0.3]];

/**
 * An aziridine's N at the origin, its ring's two C 30 degrees either side
 * of x (the ring's 60 degrees), and its third neighbour `on` with its bond
 * `out` degrees from each of theirs: in the xz plane, as far above the
 * ring's plane (below, where `below`) as cos(out) = -cos(30) cos(up) puts
 * it - in the plane at 150, the three angles then 360. A methyl on the
 * first C.
 */
function aziridine(on: string, out: number, below = false): { atoms: AtomIn3d[]; bonds: BondIn3d[]; xyz: number[] } {
  const up = Math.acos(Math.min(1, -Math.cos(out * RAD) / Math.cos(30 * RAD)));
  const c = [1.47 * Math.cos(30 * RAD), 1.47 * Math.sin(30 * RAD)];
  return {
    atoms: [{ el: "N" }, { el: "C" }, { el: "C" }, { el: on }, { el: "C" }],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
      { a1: 1, a2: 2, order: 1 },
      { a1: 0, a2: 3, order: 1 },
      { a1: 1, a2: 4, order: 1 },
    ],
    xyz: [0, 0, 0, c[0], c[1], 0, c[0], -c[1], 0, -1.75 * Math.cos(up), 0, (below ? -1.75 : 1.75) * Math.sin(up), c[0] + 0.8, c[1] + 0.9, 0.8],
  };
}

describe("lonePairsIn3d", () => {
  it("reads a phosphine's P from its geometry: its three neighbours' volume, anticlockwise from below its lone pair negative, its mirror image the other", () => {
    // (by hand: the three at 0, 120 and 240 degrees round z, below the P; seen from the P, the volume u . (v x w) of
    // the first three bond vectors is -(3 sqrt(3)/2) r^3 cos^2(19.5) sin(19.5) - negative)
    const { atoms, bonds } = phosphine();
    const one = lonePairsIn3d(atoms, bonds, pyramid(PLACES, ETHYL), [0]);
    const other = lonePairsIn3d(atoms, bonds, pyramid(PLACES, ETHYL, true), [0]);
    expect(one.read.get(0)).toEqual({ neighbours: [1, 2, 3], volume: -1 });
    expect(other.read.get(0)).toEqual({ neighbours: [1, 2, 3], volume: 1 });
    // (the two keyed apart: two stereoisomers)
    expect(one.key).not.toBeNull();
    expect(one.key).not.toBe(other.key);
  });

  it("reads an arsine's As, an N-chloro aziridine's N and a secondary phosphine's P, its H an atom of its own, the same way", () => {
    const { atoms, bonds } = phosphine("As");
    const as = [false, true].map((m) => lonePairsIn3d(atoms, bonds, pyramid([1.95, 1.95, 2.15], ETHYL, m), [0]));
    expect(as.map((x) => x.read.get(0)?.volume)).toEqual([-1, 1]);
    expect(as[0].key).not.toBe(as[1].key);
    // (the N turned over, its ring kept)
    const n = [false, true].map((below) => {
      const z = aziridine("Cl", 120, below);
      return lonePairsIn3d(z.atoms, z.bonds, z.xyz, [0]);
    });
    // (by hand: its ring's C at (a, b, 0) and (a, -b, 0), the Cl at (-c, 0, d) above - u . (v x w) = -2abd, negative)
    expect(n.map((x) => x.read.get(0)?.volume)).toEqual([-1, 1]);
    expect(n[0].key).not.toBe(n[1].key);
    const ph = phosphine("P", "H");
    expect(lonePairsIn3d(ph.atoms, ph.bonds, pyramid([1.85, 1.85, 1.42], ETHYL), [0]).read.get(0)?.volume).toBe(-1);
  });

  it("keys one molecule the same whatever order its atoms are in", () => {
    const { atoms, bonds } = phosphine();
    const xyz = pyramid(PLACES, ETHYL);
    // (its atoms the other way round: atom i is now 4 - i)
    const turned = (i: number) => 4 - i;
    const atoms2 = atoms.map((_, i) => atoms[turned(i)]);
    const bonds2 = bonds.map((b) => ({ a1: turned(b.a1), a2: turned(b.a2), order: b.order }));
    const xyz2 = atoms.flatMap((_, i) => xyz.slice(3 * turned(i), 3 * turned(i) + 3));
    expect(lonePairsIn3d(atoms2, bonds2, xyz2, [4]).key).toBe(lonePairsIn3d(atoms, bonds, xyz, [0]).key);
  });

  it("keys apart two molecules that differ only in an atom's charge, its isotope or a bond's order", () => {
    const { atoms, bonds } = phosphine();
    const xyz = pyramid(PLACES, ETHYL);
    const key = lonePairsIn3d(atoms, bonds, xyz, [0]).key;
    const others = [
      lonePairsIn3d(atoms.map((a, i) => (i === 4 ? { ...a, charge: -1 } : a)), bonds, xyz, [0]),
      lonePairsIn3d(atoms.map((a, i) => (i === 4 ? { ...a, isotope: 13 } : a)), bonds, xyz, [0]),
      lonePairsIn3d(atoms, bonds.map((b) => (b.a2 === 4 ? { ...b, order: 2 } : b)), xyz, [0]),
    ];
    for (const o of others) {
      expect(o.read.get(0)?.volume).toBe(-1);
      expect(o.key).not.toBe(key);
    }
  });

  it(`reads a centre whose three bond angles add up to ${MOST_ANGLE_SUM} degrees or less - the bound itself read - and not one closer to flat`, () => {
    const { atoms, bonds } = phosphine();
    for (const sum of [280, 320, 349, 350]) {
      const r = lonePairsIn3d(atoms, bonds, even(sum / 3), [0]);
      expect(r.read.get(0)?.volume, `${sum}`).toBe(-1);
      expect(r.flat.size, `${sum}`).toBe(0);
    }
    for (const sum of [351, 359.9, 360]) {
      const r = lonePairsIn3d(atoms, bonds, even(sum / 3), [0]);
      expect(r.read.size, `${sum}`).toBe(0);
      expect(r.flat.get(0), `${sum}`).toBeCloseTo(sum, 6);
      expect(r.key, `${sum}`).toBeNull();
    }
  });

  it("takes an aziridine's N by the same bound, its ring's 60 degrees with the rest: read to 60 + 145 + 145, not past it", () => {
    for (const [out, read] of [
      [110, true],
      [145, true],
      [146, false],
      [150, false],
    ] as const) {
      const z = aziridine("Cl", out);
      const r = lonePairsIn3d(z.atoms, z.bonds, z.xyz, [0]);
      expect(r.read.has(0), `${out}`).toBe(read);
      expect(r.flat.has(0), `${out}`).toBe(!read);
      if (!read) expect(r.flat.get(0), `${out}`).toBeCloseTo(60 + 2 * out, 6);
    }
  });

  it("reads an oxaziridine's N-methyl and no oxaziridine's N-H, the same ring: no N with an H is a centre, in 3D too (the maintainer, 2026-11-06)", () => {
    const ring = (on: string) => {
      const z = aziridine(on, 120);
      return { ...z, atoms: z.atoms.map((a, i) => (i === 2 ? { el: "O" } : a)) };
    };
    const methyl = ring("C");
    const nh = ring("H");
    expect(lonePairsIn3d(methyl.atoms, methyl.bonds, methyl.xyz, [0]).read.has(0)).toBe(true);
    const r = lonePairsIn3d(nh.atoms, nh.bonds, nh.xyz, [0]);
    expect(r.read.size).toBe(0);
    expect(r.none).toEqual(new Set([0]));
  });

  it("reads no atom whose lone pair keeps no configuration, and says it is no centre: a plain N-methyl aziridine's N, an amine's, an O+", () => {
    const plain = aziridine("C", 120);
    const amine = { atoms: [{ el: "N" }, { el: "C" }, { el: "C" }, { el: "C" }, { el: "C" }], bonds: phosphine().bonds };
    const oxonium = { atoms: [{ el: "O", charge: 1 }, { el: "C" }, { el: "C" }, { el: "C" }, { el: "C" }], bonds: phosphine().bonds };
    for (const [name, r] of [
      ["aziridine", lonePairsIn3d(plain.atoms, plain.bonds, plain.xyz, [0])],
      ["amine", lonePairsIn3d(amine.atoms, amine.bonds, pyramid([1.47, 1.47, 1.47], ETHYL), [0])],
      ["oxonium", lonePairsIn3d(oxonium.atoms, oxonium.bonds, pyramid([1.47, 1.47, 1.47], ETHYL), [0])],
    ] as const) {
      expect(r.none, name).toEqual(new Set([0]));
      expect(r.read.size, name).toBe(0);
      expect(r.key, name).toBeNull();
    }
  });

  it("reads nothing, and calls nothing flat or no centre, at an atom of four bonds or of two, or one not asked", () => {
    // (a carbon of four, and an S of four single bonds - a lone pair left, but four neighbours: each tetrahedral)
    const four = (el: string) => ({
      atoms: [{ el }, { el: "C" }, { el: "C" }, { el: "Cl" }, { el: "F" }],
      bonds: [1, 2, 3, 4].map((k) => ({ a1: 0, a2: k, order: 1 })),
    });
    const tetrahedron = [0, 0, 0, 1, 1, 1, 1, -1, -1, -1, 1, -1, -1, -1, 1];
    const { atoms, bonds } = phosphine();
    for (const r of [
      lonePairsIn3d(four("C").atoms, four("C").bonds, tetrahedron, [0]),
      lonePairsIn3d(four("S").atoms, four("S").bonds, tetrahedron, [0]),
      // (the ethyl's CH2, of two bonds here; and an atom not asked)
      lonePairsIn3d(atoms, bonds, pyramid(PLACES, ETHYL), [2]),
      lonePairsIn3d(atoms, bonds, pyramid(PLACES, ETHYL), []),
    ]) {
      expect([r.read.size, r.flat.size, r.none.size]).toEqual([0, 0, 0]);
      expect(r.key).toBeNull();
    }
  });

  it("reads nothing at a centre with an atom placed nowhere, or whose three bonds lie in one plane all to one side, though their angles are short of 360", () => {
    const { atoms, bonds } = phosphine();
    const nowhere = pyramid(PLACES, ETHYL).map((v, k) => (k === 3 ? Number.NaN : v));
    // (at 0, 60 and 120 degrees round z, in its plane: 60 + 60 + 120)
    const fan = [0, 0, 0, ...[0, 60, 120].flatMap((t) => [1.85 * Math.cos(t * RAD), 1.85 * Math.sin(t * RAD), 0]), -1.6, 2.4, -0.3];
    for (const xyz of [nowhere, fan]) {
      const r = lonePairsIn3d(atoms, bonds, xyz, [0]);
      expect([r.read.size, r.flat.size, r.none.size]).toEqual([0, 0, 0]);
    }
  });

  it("reads a centre asked twice once, as if asked once", () => {
    const { atoms, bonds } = phosphine();
    const xyz = pyramid(PLACES, ETHYL);
    expect(lonePairsIn3d(atoms, bonds, xyz, [0, 0])).toEqual(lonePairsIn3d(atoms, bonds, xyz, [0]));
  });
});
