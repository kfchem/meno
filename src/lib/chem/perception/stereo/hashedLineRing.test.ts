/**
 * An allene's end is no end group, and a hashed bond along a ring bond states nothing (found in review: the ring's far edge in
 * perspective): its centres are open, said so, where they have no wedge of their own.
 */
import { describe, expect, it } from "vitest";
import { HASHED_RING, HASHED_TO_LARGE, readStereo, unreadWhy, type DrawnAtom, type DrawnBond } from "./from2d";

describe("an allene's end, and a ring's bond", () => {
  it("an allene's hashed wedge to a carbinol carbon is read as before: the allene's axis, no centre at the carbinol", () => {
    // CH3-CH=C=CH-CH(OH)-CH3: atoms 0 CH3, 1 allene end, 2 central, 3 allene end, 4 carbinol, 5 OH, 6 CH3; the bond 3-4 a hashed wedge narrow at 3
    const atoms: DrawnAtom[] = [
      { x: -0.5, y: 0.87, el: "C", hs: 3 }, { x: 0, y: 0, el: "C", hs: 1 }, { x: 1, y: 0, el: "C", hs: 0 }, { x: 2, y: 0, el: "C", hs: 1 },
      { x: 2.5, y: -0.87, el: "C", hs: 1 }, { x: 2.0, y: -1.73, el: "O", hs: 1 }, { x: 3.5, y: -0.87, el: "C", hs: 3 },
    ];
    const bonds: DrawnBond[] = [
      { a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 2 }, { a: 2, b: 3, order: 2 },
      { a: 3, b: 4, order: 1, wedge: { narrow: 3, stereo: "down" } }, { a: 4, b: 5, order: 1 }, { a: 4, b: 6, order: 1 },
    ];
    const read = readStereo(atoms, bonds);
    expect([...read.tetra.keys()]).toEqual([]);
    expect(read.axes).toHaveLength(1);
    // (the solid wedge, drawn so, is read as it ever was)
    const solid = readStereo(atoms, bonds.map((b) => (b.wedge ? { ...b, wedge: { narrow: 3, stereo: "up" as const } } : b)));
    expect([...solid.tetra.keys()]).toEqual([]);
    expect(solid.axes).toHaveLength(1);
  });

  it("a hashed line along a ring bond states nothing: 3-methylcyclohexanone's C3 is read from no ring bond drawn hashed", () => {
    const ring = Array.from({ length: 6 }, (_, k) => ({ x: Math.cos((Math.PI / 3) * k + Math.PI / 6), y: Math.sin((Math.PI / 3) * k + Math.PI / 6) }));
    const atoms: DrawnAtom[] = [
      { ...ring[0], el: "C", hs: 0 }, { ...ring[1], el: "C", hs: 2 }, { ...ring[2], el: "C", hs: 1 }, { ...ring[3], el: "C", hs: 2 }, { ...ring[4], el: "C", hs: 2 }, { ...ring[5], el: "C", hs: 2 },
      { x: ring[0].x * 2, y: ring[0].y * 2, el: "O", hs: 0 }, { x: ring[2].x * 2, y: ring[2].y * 2, el: "C", hs: 3 },
    ];
    const bonds = (hashedRing: number): DrawnBond[] => [
      ...ring.map((_, k): DrawnBond => ({ a: k, b: (k + 1) % 6, order: 1, ...(k === hashedRing ? { hashed: true } : {}) })),
      { a: 0, b: 6, order: 2 }, { a: 2, b: 7, order: 1 },
    ];
    for (const k of [1, 2]) {
      expect([...readStereo(atoms, bonds(k)).tetra.keys()], `ring bond ${k}`).toEqual([]);
      // (C3 open, its words those of a ring bond)
      expect(unreadWhy(atoms, bonds(k), 2), `ring bond ${k}`).toBe(HASHED_RING);
    }
    // (a hashed line from C3 to its methyl: read)
    const toMethyl = bonds(-1).map((b) => (b.a === 2 && b.b === 7 ? { ...b, hashed: true } : b));
    expect(readStereo(atoms, toMethyl).tetra.get(2)).toBeDefined();
    // (a hashed wedge narrow at C2 along C2-C3, the wrong way round for C3: not read at C3)
    const reversed = bonds(-1).map((b) => (b.a === 1 && b.b === 2 ? { ...b, wedge: { narrow: 1, stereo: "down" as const } } : b));
    expect(readStereo(atoms, reversed).tetra.get(2)).toBeUndefined();
  });

  it("a hashed line to an OH at an ordinary centre is read, the same as the hashed wedge", () => {
    const mk = (hashed: boolean): [DrawnAtom[], DrawnBond[]] => [
      [{ x: 0, y: 0, el: "C", hs: 1 }, { x: 0, y: -1, el: "O", hs: 1 }, { x: -0.87, y: 0.5, el: "C", hs: 2 }, { x: -1.73, y: 0, el: "C", hs: 3 }, { x: 0.87, y: 0.5, el: "C", hs: 3 }],
      [{ a: 0, b: 1, order: 1, ...(hashed ? { hashed: true } : { wedge: { narrow: 0, stereo: "down" as const } }) }, { a: 0, b: 2, order: 1 }, { a: 2, b: 3, order: 1 }, { a: 0, b: 4, order: 1 }],
    ];
    const [a1, b1] = mk(true), [a2, b2] = mk(false);
    expect(readStereo(a1, b1).tetra.get(0)).toBeDefined();
    expect(readStereo(a1, b1).tetra.get(0)).toEqual(readStereo(a2, b2).tetra.get(0));
  });
});

/** A centre (atom 0) with an ethyl up-left, a methyl up-right and a hashed line down to `far` (atom 4, whose own atoms follow). */
function centre(far: DrawnAtom, more: { atom: DrawnAtom; order: 1 | 2 }[]) {
  const atoms: DrawnAtom[] = [{ x: 0, y: 0, el: "C", hs: 1 }, { x: -0.87, y: 0.5, el: "C", hs: 2 }, { x: -1.73, y: 0, el: "C", hs: 3 }, { x: 0.87, y: 0.5, el: "C", hs: 3 }, far];
  const bonds: DrawnBond[] = [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 }, { a: 0, b: 3, order: 1 }, { a: 0, b: 4, order: 1, hashed: true }];
  more.forEach((m) => {
    atoms.push(m.atom);
    bonds.push({ a: 4, b: atoms.length - 1, order: m.order });
  });
  return { atoms, bonds };
}
const wedged = (d: { atoms: DrawnAtom[]; bonds: DrawnBond[] }) => ({ atoms: d.atoms, bonds: d.bonds.map((b) => (b.hashed ? { a: b.a, b: b.b, order: b.order, wedge: { narrow: 0, stereo: "down" as const } } : b)) });

describe("the edges of an allene's end and a ring's bond (found in review)", () => {
  it("a hashed line to a carbonyl carbon (CHO: a C with =O and an H) is read, as the hashed wedge: a double bond is no allene", () => {
    const d = centre({ x: 0, y: -1, el: "C", hs: 1 }, [{ atom: { x: 0.5, y: -1.8, el: "O", hs: 0 }, order: 2 }]);
    expect(readStereo(d.atoms, d.bonds).tetra.get(0)).toBeDefined();
    expect(readStereo(d.atoms, d.bonds).tetra.get(0)).toEqual(readStereo(wedged(d).atoms, wedged(d).bonds).tetra.get(0));
  });

  it("a hashed line from a centre to an allene's end states nothing, and the centre is open, saying 'a group of this size'", () => {
    // (the far end an allene's: =C=CH-CH3 out of it)
    const d = centre({ x: 0, y: -1, el: "C", hs: 1 }, [{ atom: { x: 0.9, y: -1.4, el: "C", hs: 0 }, order: 2 }]);
    d.atoms.push({ x: 1.8, y: -1.0, el: "C", hs: 2 });
    d.bonds.push({ a: 5, b: 6, order: 2 });
    expect(readStereo(d.atoms, d.bonds).tetra.get(0)).toBeUndefined();
    expect(unreadWhy(d.atoms, d.bonds, 0)).toBe(HASHED_TO_LARGE);
  });

  it("a ring atom with a hashed line along a ring bond and another to its OH: open, the words those of the ring bond", () => {
    // (cyclopentane C1 with an OH on a hashed line, and the bond C1-C2 hashed: both lines at C1)
    const ring = Array.from({ length: 5 }, (_, k) => ({ x: Math.cos((2 * Math.PI * k) / 5), y: Math.sin((2 * Math.PI * k) / 5) }));
    const atoms: DrawnAtom[] = [{ ...ring[0], el: "C", hs: 1 }, ...ring.slice(1).map((p): DrawnAtom => ({ ...p, el: "C", hs: 2 })), { x: ring[0].x * 2, y: ring[0].y * 2, el: "O", hs: 1 }];
    const ringBonds: DrawnBond[] = ring.map((_, k): DrawnBond => ({ a: k, b: (k + 1) % 5, order: 1, ...(k === 0 ? { hashed: true } : {}) }));
    const toOH: DrawnBond = { a: 0, b: 5, order: 1, hashed: true };
    // (its words the ring bond's, whichever of the two lines is looked at first)
    expect(unreadWhy(atoms, [toOH, ...ringBonds], 0)).toBe(HASHED_RING);
    expect(unreadWhy(atoms, [...ringBonds, toOH], 0)).toBe(HASHED_RING);
    // (and either way the centre is open: none read)
    expect(readStereo(atoms, [...ringBonds, toOH]).tetra.get(0)).toBeUndefined();
    expect(readStereo(atoms, [toOH, ...ringBonds]).tetra.get(0)).toBeUndefined();
  });
});
