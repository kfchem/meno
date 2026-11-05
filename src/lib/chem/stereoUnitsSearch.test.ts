import { afterEach, describe, expect, it, vi } from "vitest";
import * as canonical from "../layout/canonical";
import { fromSmiles } from "../layout/testdata/fromSmiles";
import type { LayoutInput } from "../layout/perceive";
import { identity, identityText } from "./identity";

// The search for alike groups (`stereoUnitsOnly`), with what it asks of the
// canonical search changed: the ranks' shortcut taken away, or a search
// that ran out of steps. Neither can be had from a structure small enough
// to test - the ranks tell apart every such group met, and a search that
// runs out on the unit runs out on the whole - so it is told so here.
const real = await vi.importActual<typeof import("../layout/canonical")>("../layout/canonical");
vi.mock("../layout/canonical", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../layout/canonical")>();
  return { ...actual, symmetryClasses: vi.fn(actual.symmetryClasses), symmetryOrbits: vi.fn(actual.symmetryOrbits) };
});
afterEach(() => {
  vi.mocked(canonical.symmetryClasses).mockImplementation(real.symmetryClasses);
  vi.mocked(canonical.symmetryOrbits).mockImplementation(real.symmetryOrbits);
});

/** Whether an atom is a unit's own, as the search marks it. */
const searched = (g: LayoutInput) => g.atoms.some((a) => a.el.endsWith("*"));

describe("a configuration's groups, searched without the ranks' shortcut", () => {
  // (every atom one class: every unit searched)
  const noShortcut = () => vi.mocked(canonical.symmetryClasses).mockImplementation((g) => g.atoms.map(() => 0));

  it("are weighed with the unit where it is: 1,3-dichloro-2,4-dimethylcyclobutane, one CHCl drawn and one open", () => {
    // (ring C0-C3: Cl on C0 and C2, methyls on C1 and C3; C0 and both methyls' CH drawn, C2 open. A half turn takes
    // C0 onto C2 and its arms onto each other, but no symmetry keeping C0 does where the methyls are cis)
    const ring = (v0: 1 | -1, v1: 1 | -1, v3: 1 | -1): LayoutInput => ({
      atoms: [
        { el: "C", hs: 1, tetra: { neighbours: [1, 3, 4, -1], volume: v0 } },
        { el: "C", hs: 1, tetra: { neighbours: [0, 2, 6, -1], volume: v1 } },
        { el: "C", hs: 1 },
        { el: "C", hs: 1, tetra: { neighbours: [2, 0, 7, -1], volume: v3 } },
        { el: "Cl", hs: 0 },
        { el: "Cl", hs: 0 },
        { el: "C", hs: 3 },
        { el: "C", hs: 3 },
      ],
      bonds: [
        { a: 0, b: 1, order: 1 },
        { a: 1, b: 2, order: 1 },
        { a: 2, b: 3, order: 1 },
        { a: 3, b: 0, order: 1 },
        { a: 0, b: 4, order: 1 },
        { a: 2, b: 5, order: 1 },
        { a: 1, b: 6, order: 1 },
        { a: 3, b: 7, order: 1 },
      ],
    });
    noShortcut();
    expect(identityText(ring(1, 1, 1))).not.toBe(identityText(ring(-1, 1, 1)));
    expect(identityText(ring(1, 1, -1))).toBe(identityText(ring(-1, 1, -1)));
  });

  it("come out as with it: the shortcut only spares searches", () => {
    const cases = [
      "C[C@H](C)O",
      "C/C(C)=C/CO",
      "C[C@H]1CC[C@@H](C)CC1",
      "C[C@H]1C[C@@H](C)C1",
      "O=C(O)[C@@H](O)[C@H](O)[C@@H](O)C(=O)O",
      "O=C(O)[C@H](O)[C@H](O)[C@@H](O)C(=O)O",
      "C/C=C1/CC[C@@H](C)CC1",
      "C[C@H](C)[C@H](O)[C@@H](C)C",
      "[C@@H]1(Cl)[C@H](Cl)[C@H](Cl)C1Cl",
    ];
    const withIt = cases.map((s) => identityText(fromSmiles(s)));
    noShortcut();
    expect(cases.map((s) => identityText(fromSmiles(s)))).toEqual(withIt);
  });
});

describe("a configuration whose search for alike groups ran out of steps", () => {
  it("is kept where the search did not find its groups alike, and the identity says it may not be the only one", () => {
    // (the unit's search finds no symmetry and stops; the structure's own search is complete)
    vi.mocked(canonical.symmetryOrbits).mockImplementation((g) => (searched(g) ? { orbit: g.atoms.map((_, i) => i), automorphisms: [], complete: false } : real.symmetryOrbits(g)));
    const found = identity(fromSmiles("C[C@H](C)O"));
    expect(found.complete).toBe(false);
    expect(found.text).not.toBe(identity(fromSmiles("CC(C)O")).text);
    expect(identity(fromSmiles("CC(C)O")).complete).toBe(true);
  });

  it("is set aside where the search found its groups alike before it stopped, and the identity is complete", () => {
    vi.mocked(canonical.symmetryOrbits).mockImplementation((g) => (searched(g) ? { ...real.symmetryOrbits(g), complete: false } : real.symmetryOrbits(g)));
    const found = identity(fromSmiles("C[C@H](C)O"));
    expect(found.complete).toBe(true);
    expect(found.text).toBe(identity(fromSmiles("CC(C)O")).text);
  });
});
