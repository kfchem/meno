import { describe, expect, it } from "vitest";
import { donorKinds, octahedralOpen, type FourView } from "./perceive";

// A metal's donors told apart as ligands (`donorKinds`): two donors are one kind only where they and all they carry are alike - the
// element, charge, H's and bonds of every atom, and the bond to the metal. A centre whose donors differ in any of these can be set
// round the metal more ways than one, and is marked (`octahedralOpen`).

type A = { el: string; charge?: number; hs?: number };
/** A view of a structure: the atoms, the bonds as [a, b, order]. */
function view(atoms: A[], bonds: [number, number, number][]): FourView {
  const nb = atoms.map(() => [] as number[]);
  const order = new Map<string, number>();
  for (const [a, b, o] of bonds) {
    nb[a].push(b);
    nb[b].push(a);
    order.set(`${a},${b}`, o);
    order.set(`${b},${a}`, o);
  }
  return { el: (i) => atoms[i].el, charge: (i) => atoms[i].charge ?? 0, hs: (i) => atoms[i].hs ?? 0, neighbours: (i) => nb[i], order: (a, b) => order.get(`${a},${b}`) ?? 0 };
}

/**
 * Co (atom 0) and six donors, each a ligand of its own: `ligand(k)` gives the k-th one's atoms (its donor first) and its own bonds by
 * index within it, and the bond's order to the metal.
 */
function centre(ligand: (k: number) => { atoms: A[]; bonds: [number, number, number][]; toMetal?: number }) {
  const atoms: A[] = [{ el: "Co" }];
  const bonds: [number, number, number][] = [];
  for (let k = 0; k < 6; k++) {
    const l = ligand(k);
    const base = atoms.length;
    atoms.push(...l.atoms);
    bonds.push([0, base, l.toMetal ?? 1], ...l.bonds.map(([a, b, o]): [number, number, number] => [base + a, base + b, o]));
  }
  return view(atoms, bonds);
}
/** The six donors' kinds, how many of each, most first. */
const counts = (v: FourView) => {
  const n = new Map<string, number>();
  for (const k of donorKinds(v, 0)) n.set(k, (n.get(k) ?? 0) + 1);
  return [...n.values()].sort((p, q) => q - p);
};

describe("a metal's donors told apart as ligands", () => {
  it("are one kind where they and all they carry are alike: six ammines, MA6, not marked", () => {
    const v = centre(() => ({ atoms: [{ el: "N", hs: 3 }], bonds: [] }));
    expect(counts(v)).toEqual([6]);
    expect(octahedralOpen(v, 0)).toBe(false);
  });

  it("are two kinds where two differ only in their charge: MA4B2, marked", () => {
    const v = centre((k) => ({ atoms: [{ el: "N", hs: 3, charge: k < 4 ? 0 : 1 }], bonds: [] }));
    expect(counts(v)).toEqual([4, 2]);
    expect(octahedralOpen(v, 0)).toBe(true);
  });

  it("are two kinds where two differ only in their H's: an amine's NH3 and an amide's NH2, marked", () => {
    const v = centre((k) => ({ atoms: [{ el: "N", hs: k < 4 ? 3 : 2 }], bonds: [] }));
    expect(counts(v)).toEqual([4, 2]);
    expect(octahedralOpen(v, 0)).toBe(true);
  });

  it("are two kinds where two differ only in their bond to the metal: a single and a double, marked", () => {
    const v = centre((k) => ({ atoms: [{ el: "N", hs: 1 }, { el: "C", hs: 3 }], bonds: [[0, 1, 1]], toMetal: k < 4 ? 1 : 2 }));
    expect(counts(v)).toEqual([4, 2]);
    expect(octahedralOpen(v, 0)).toBe(true);
  });

  it("are two kinds where two differ only in a bond within them: an amine and an imine on the same atoms, marked", () => {
    // (N-C beside N=C, each atom's H's set so that every atom's element, charge, H's and bonds count is the same)
    const v = centre((k) => ({ atoms: [{ el: "N", hs: 1 }, { el: "C", hs: 2 }], bonds: [[0, 1, k < 4 ? 1 : 2]] }));
    expect(counts(v)).toEqual([4, 2]);
    expect(octahedralOpen(v, 0)).toBe(true);
  });

  it("are told apart however far out the two differ: two bonds out, and three", () => {
    // (H2N-CH2-CH2-X: X an F on four, a Cl on two - the donor and the two carbons alike, the difference three bonds from the metal's N)
    const far = centre((k) => ({ atoms: [{ el: "N", hs: 2 }, { el: "C", hs: 2 }, { el: "C", hs: 2 }, { el: k < 4 ? "F" : "Cl" }], bonds: [[0, 1, 1], [1, 2, 1], [2, 3, 1]] }));
    expect(counts(far)).toEqual([4, 2]);
    expect(octahedralOpen(far, 0)).toBe(true);
    // (H2N-CH2-X: an F on four, a Cl on two - two bonds out)
    const near = centre((k) => ({ atoms: [{ el: "N", hs: 2 }, { el: "C", hs: 2 }, { el: k < 4 ? "F" : "Cl" }], bonds: [[0, 1, 1], [1, 2, 1]] }));
    expect(counts(near)).toEqual([4, 2]);
  });
});
