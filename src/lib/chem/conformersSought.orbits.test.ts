import { describe, expect, it, vi } from "vitest";

// Two atoms alike, for a bond held flat (conformersSought `turningBonds`), are two in one orbit of the molecule's symmetry - an
// automorphism takes the one onto the other - never two of one symmetry class alone: classes can join atoms no automorphism
// takes onto each other (cuneane's: one class, three orbits), and counting those alike would seek fewer conformers. Here the
// classes join every atom, as such a tie would, and the count must still keep an N-ethyl-N-methylamide's two forms apart.
vi.mock("../layout/canonical", async (importOriginal) => {
  const canonical = await importOriginal<typeof import("../layout/canonical")>();
  return {
    ...canonical,
    symmetryClasses: vi.fn((g: { atoms: readonly unknown[] }) => g.atoms.map(() => 0)),
    // (the orbit search itself, watched: what it is given)
    symmetryOrbits: vi.fn(canonical.symmetryOrbits),
  };
});

const { readSmiles } = await import("./smiles");
const { turningBonds } = await import("./conformersSought");
const { symmetryClasses, symmetryOrbits } = await import("../layout/canonical");

const turns = (smiles: string) => {
  const s = readSmiles(smiles);
  return turningBonds(
    s.atoms.map((a) => ({ el: a.el, charge: a.charge ?? 0 })),
    s.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })),
  ).length;
};

describe("two alike on an atom whose bond is held flat", () => {
  it("are two of one orbit, not of one class: an N-ethyl-N-methylamide's two forms counted, an N,N-dimethylamide's one", () => {
    expect(symmetryClasses({ atoms: [{ el: "C" }, { el: "N" }], bonds: [] } as never)).toEqual([0, 0]);
    expect(turns("CC(=O)N(C)CC")).toBe(2);
    expect(turns("CC(=O)N(C)C")).toBe(0);
  });

  it("are found by the symmetries that keep the flat bond in place: its own two atoms marked apart in the search", () => {
    const search = vi.mocked(symmetryOrbits);
    search.mockClear();
    // (N,N-dimethylacetamide: its acyl C (atom 2) and its N (atom 4) marked; its other atoms by element as they came)
    expect(turns("CC(=O)N(C)C")).toBe(0);
    const given = search.mock.calls.map(([g]) => (g as unknown as { atoms: { el: string }[] }).atoms.map((a) => a.el));
    expect(given).toEqual([["C", "C*", "O", "N*", "C", "C"]]);
  });

  it("is where cuneane's atoms show classes and orbits apart, as canonical works them out", async () => {
    const { symmetryClasses: real } = await vi.importActual<typeof import("../layout/canonical")>("../layout/canonical");
    const s = readSmiles("C12C3C4C3C2C5C4C51");
    const g = { atoms: s.atoms.map((a) => ({ el: a.el })), bonds: s.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })) } as never;
    expect(new Set(real(g)).size).toBe(1);
    expect(new Set(symmetryOrbits(g).orbit).size).toBe(3);
  });
});
