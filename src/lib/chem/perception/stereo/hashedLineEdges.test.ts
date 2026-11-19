/**
 * The edges of the hashed line's rule (found in review): what counts as a group of the end (hydrogens drawn as atoms are none; a real
 * isopropyl is two others), an atom of five bonds no centre, a hashed wedge drawn the wrong way round read only where the text allows, and
 * which centres a hashed line leaves open.
 */
import { describe, expect, it } from "vitest";
import { HASHED_BETWEEN, HASHED_TO_LARGE, HASHED_TWO, readStereo, unreadWhy, unsureStereo, type DrawnAtom, type DrawnBond } from "./from2d";

/** A centre (atom 0) with an ethyl up-left (atoms 1, 2), a methyl up-right (3) and `far` (4) down; `more` the atoms out of `far`; `line` how its bond is drawn. */
function build(far: DrawnAtom, more: { atom: DrawnAtom; order?: 1 | 2 }[], line: Partial<DrawnBond> | null, hs = 1): { atoms: DrawnAtom[]; bonds: DrawnBond[] } {
  const atoms: DrawnAtom[] = [{ x: 0, y: 0, el: "C", hs }, { x: -0.87, y: 0.5, el: "C", hs: 2 }, { x: -1.73, y: 0, el: "C", hs: 3 }, { x: 0.87, y: 0.5, el: "C", hs: 3 }, far];
  const bonds: DrawnBond[] = [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 }, { a: 0, b: 3, order: 1 }, { a: 0, b: 4, order: 1, ...(line ?? {}) }];
  more.forEach((m, k) => {
    atoms.push({ ...m.atom, x: m.atom.x + (k - (more.length - 1) / 2) * 0.9, y: m.atom.y });
    bonds.push({ a: 4, b: atoms.length - 1, order: m.order ?? 1 });
  });
  return { atoms, bonds };
}
const at = (el: string, hs: number, x = 0, y = -2): DrawnAtom => ({ x, y, el, hs });
const tetra = (d: { atoms: DrawnAtom[]; bonds: DrawnBond[] }, i = 0) => readStereo(d.atoms, d.bonds).tetra.get(i);

describe("what counts as a group of the end", () => {
  it("a methyl drawn with its three hydrogens as atoms is an end group: the hashed line to it is read, as to a methyl with none drawn", () => {
    const withH = build(at("C", 0, 0, -1), [0, 1, 2].map((k) => ({ atom: at("H", 0, k - 1, -2) })), { hashed: true });
    const bare = build(at("C", 3, 0, -1), [], { hashed: true });
    expect(tetra(withH)).toBeDefined();
    expect(tetra(withH)).toEqual(tetra(bare));
  });

  it("a real isopropyl (its CH has its H) is a group of two others: the line is read as nothing, the words 'a group of this size', not 'between two stereocentres'", () => {
    const d = build(at("C", 1, 0, -1), [{ atom: at("C", 3, -0.5, -2) }, { atom: at("C", 3, 0.5, -2) }], { hashed: true });
    expect(tetra(d)).toBeUndefined();
    expect(unreadWhy(d.atoms, d.bonds, 0)).toBe(HASHED_TO_LARGE);
    // (a CH(OH)CH3 - four different groups, a stereocentre of its own: the other words)
    const centre = build(at("C", 1, 0, -1), [{ atom: at("O", 1, -0.5, -2) }, { atom: at("C", 3, 0.5, -2) }], { hashed: true });
    expect(unreadWhy(centre.atoms, centre.bonds, 0)).toBe(HASHED_BETWEEN);
  });

  it("an atom of five bonds is no centre: a hashed line out of it states nothing and leaves it no open centre", () => {
    const d = build(at("C", 1, 0, -1), [{ atom: at("C", 3, -0.5, -2) }, { atom: at("C", 3, 0.5, -2) }], { hashed: true });
    d.atoms[0] = { ...d.atoms[0], hs: 0 };
    for (const x of [0.5, -0.5]) {
      d.atoms.push({ x, y: 1.2, el: "C", hs: 3 });
      d.bonds.push({ a: 0, b: d.atoms.length - 1, order: 1 });
    }
    expect(unsureStereo(d.atoms, d.bonds).atoms).not.toContain(0);
  });
});

describe("a hashed wedge drawn the wrong way round, read only where the text allows", () => {
  const reversed = (group: { atom: DrawnAtom; order?: 1 | 2 }[], first: DrawnAtom) => build(first, group, { wedge: { narrow: 4, stereo: "down" } });
  it("narrow at a group of two others (an NMe2, an isopropyl): states nothing", () => {
    expect(tetra(reversed([{ atom: at("C", 3, -0.5, -2) }, { atom: at("C", 3, 0.5, -2) }], at("N", 0, 0, -1)))).toBeUndefined();
    expect(tetra(reversed([{ atom: at("C", 3, -0.5, -2) }, { atom: at("C", 3, 0.5, -2) }], at("C", 1, 0, -1)))).toBeUndefined();
    // (and at an OH it is read: the control)
    expect(tetra(reversed([], at("O", 1, 0, -1)))).toBeDefined();
  });

  it("at a centre with a solid wedge of its own: read from that wedge, as without the reversed one", () => {
    const d = reversed([], at("O", 1, 0, -1));
    d.bonds[0] = { ...d.bonds[0], wedge: { narrow: 0, stereo: "up" } };
    const without = { atoms: d.atoms, bonds: d.bonds.map((b) => (b.wedge && b.wedge.narrow === 4 ? { a: b.a, b: b.b, order: b.order } : b)) };
    expect(tetra(d)).toBeDefined();
    expect(tetra(d)).toEqual(tetra(without));
  });

  it("at a centre with a hashed line of its own to another end group: read from the line only, as with the reversed wedge a plain bond", () => {
    const d = reversed([], at("O", 1, 0, -1));
    d.bonds[2] = { ...d.bonds[2], hashed: true };
    const plainOH = { atoms: d.atoms, bonds: d.bonds.map((b) => (b.wedge ? { a: b.a, b: b.b, order: b.order } : b)) };
    expect(tetra(d)).toBeDefined();
    expect(tetra(d)).toEqual(tetra(plainOH));
  });
});

describe("the centres a hashed line leaves open, and those it does not", () => {
  it("a line read at a centre to its OH leaves no atom open - not the OH either", () => {
    const d = build(at("O", 1, 0, -1), [], { hashed: true });
    expect(tetra(d)).toBeDefined();
    expect(unsureStereo(d.atoms, d.bonds).atoms).not.toContain(4);
  });

  it("two hashed lines at one atom: it is listed once, the words say so", () => {
    const d = build(at("O", 1, 0, -1), [], { hashed: true });
    d.bonds[2] = { ...d.bonds[2], hashed: true };
    const open = unsureStereo(d.atoms, d.bonds).atoms;
    expect(open.filter((i) => i === 0)).toHaveLength(1);
    expect(unreadWhy(d.atoms, d.bonds, 0)).toBe(HASHED_TWO);
  });

  it("a hashed line between two atoms each looking an end group (two CH2X, their hydrogens drawn): the line is read at neither", () => {
    // (X-CH2-CH2-Y: each carbon four groups, one other that is not a hydrogen; the bond between them the hashed line)
    const atoms: DrawnAtom[] = [
      { x: 0, y: 0, el: "C", hs: 0 }, { x: 0, y: -1, el: "C", hs: 0 }, { x: -0.87, y: 0.5, el: "Cl", hs: 0 }, { x: 0.87, y: 0.5, el: "H", hs: 0 }, { x: 0, y: 1, el: "H", hs: 0 },
      { x: -0.87, y: -1.5, el: "Br", hs: 0 }, { x: 0.87, y: -1.5, el: "H", hs: 0 }, { x: 0, y: -2, el: "H", hs: 0 },
    ];
    const bonds: DrawnBond[] = [{ a: 0, b: 1, order: 1, hashed: true }, { a: 0, b: 2, order: 1 }, { a: 0, b: 3, order: 1 }, { a: 0, b: 4, order: 1 }, { a: 1, b: 5, order: 1 }, { a: 1, b: 6, order: 1 }, { a: 1, b: 7, order: 1 }];
    expect(readStereo(atoms, bonds).tetra.size).toBe(0);
  });
});
