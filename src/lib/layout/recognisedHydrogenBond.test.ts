// A hydrogen bond drawn is no bond of the structure (perception/graph `ofTheStructure`): it closes no ring for the recognition of a ring in
// perspective either. Between two groups of a chair drawn with no depth it would make a second ring sharing three atoms with it - taken for a
// bridged system, read by a mark only - and the chair would not be read (found in review).
import { describe, expect, it } from "vitest";
import { readStereo, type DrawnAtom, type DrawnBond } from "./drawn";
import { chair } from "./testdata/projections";

/** The chair with no depth and no mark, two hydroxyls on its atoms 0 and 2 drawn axial (atoms 6 and 7): a diaxial 1,3-diol, as a teaching figure draws it. */
function diol(withHydrogenBond: boolean): { atoms: DrawnAtom[]; bonds: DrawnBond[] } {
  const d = chair({ 0: { place: "axial", el: "O", hs: 1 }, 2: { place: "axial", el: "O", hs: 1 } });
  const atoms = d.atoms.map(({ z: _z, centre: _c, ...a }) => a);
  return { atoms, bonds: withHydrogenBond ? [...d.bonds, { a: 6, b: 7, order: 1, hydrogen: true }] : d.bonds };
}

describe("a chair drawn bond by bond with a hydrogen bond between two of its groups", () => {
  it("is read as the chair without it: the hydrogen bond closes no ring", () => {
    const without = diol(false);
    const read = (d: { atoms: DrawnAtom[]; bonds: DrawnBond[] }) => [...readStereo(d.atoms, d.bonds).tetra].map(([c, t]) => `${c}:${t.volume}`).sort();
    expect(read(without).length).toBeGreaterThan(0);
    expect(read(diol(true))).toEqual(read(without));
  });
});
