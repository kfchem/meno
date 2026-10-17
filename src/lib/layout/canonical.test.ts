import { describe, expect, it } from "vitest";
import { canonicalOrder, reordered } from "./canonical";
import type { LayoutAtom, LayoutBond } from "./perceive";
import type { LayoutInput } from "./perceive";
import { shuffled } from "./testdata/shuffled";
import { fromSmiles } from "./testdata/fromSmiles";

/** The molecule's bonds as its own order writes them: the same list for the same molecule. */
const certificate = (g: LayoutInput, way = 0) =>
  reordered(g, canonicalOrder(g, way))
    .bonds.map((b) => `${b.a}-${b.b}:${b.order}`)
    .join(" ");

describe("canonicalOrder", () => {
  // (cages of three-bonded CH whose atoms the neighbours' ranks never part,
  // though not all alike: which of them is taken first decides the order)
  const cages: Record<string, string> = {
    cuneane: "C12C3C4C3C2C5C4C51",
    basketane: "C12C3C4C5C3C2C5C4CC1",
    cubane: "C12C3C4C1C5C2C3C45",
    adamantane: "C1C2CC3CC1CC(C2)C3",
    snoutene: "C12C3C4C3C5C2C5C4C=C1",
  };

  it("writes the same bonds for the same molecule however its atoms come, where ranks alone leave atoms alike that are not", () => {
    for (const [name, smiles] of Object.entries(cages)) {
      const g = fromSmiles(smiles);
      for (const way of [0, 1, 2, 3]) {
        const own = certificate(g, way);
        for (const seed of [1, 7919, 104729, 1299709]) expect(certificate(shuffled(g, seed), way), `${name} way ${way} seed ${seed}`).toBe(own);
      }
    }
  });

  it("takes the same order for a molecule with many alike groups in little time", () => {
    // (hexa-tert-butylbenzene's 18 methyls, alike in threes and sixes)
    const g = fromSmiles("CC(C)(C)c1c(C(C)(C)C)c(C(C)(C)C)c(C(C)(C)C)c(C(C)(C)C)c1C(C)(C)C");
    const t = performance.now();
    const own = certificate(g);
    expect(certificate(shuffled(g, 31))).toBe(own);
    expect(performance.now() - t).toBeLessThan(2000);
  });

  // Everything the layout reads of an atom tells it apart: two atoms alike
  // but for one thing are never taken for each other, whatever order the
  // atoms come in - each keeps its place in the molecule's own order.
  describe("tells apart atoms alike but for one thing the layout reads", () => {
    const chain = (n: number, at = 0): LayoutBond[] => Array.from({ length: n - 1 }, (_, i) => ({ a: at + i, b: at + i + 1, order: 1 }));
    const carbons = (n: number, hs: (i: number) => number = (i) => (i === 0 || i === n - 1 ? 3 : 2)): LayoutAtom[] => Array.from({ length: n }, (_, i) => ({ el: "C", hs: hs(i) }));
    /** Whether atom `k` of `g` (with any atoms alike to it by symmetry, `alike`) takes the same place in its own order however the atoms are put. */
    const keepsItsPlace = (g: LayoutInput, k: number, alike: readonly number[] = []) => {
      const places = (order: readonly number[], ks: readonly number[]) => ks.map((a) => order[a]).sort((p, q) => p - q).join(",");
      const own = places(canonicalOrder(g), [k, ...alike]);
      let x = 17;
      const next = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
      for (let round = 0; round < 12; round++) {
        const to = g.atoms.map((_, i) => i);
        for (let i = to.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          [to[i], to[j]] = [to[j], to[i]];
        }
        if (places(canonicalOrder(reordered(g, to)), [k, ...alike].map((a) => to[a])) !== own) return false;
      }
      return true;
    };
    const butane = (): LayoutInput => ({ atoms: carbons(4), bonds: chain(4) });
    it("its element, or the label it stands for", () => {
      const g = butane();
      expect(keepsItsPlace({ ...g, atoms: g.atoms.map((a, i) => (i === 0 ? { ...a, el: "OMe", hs: 0 } : a)) }, 0)).toBe(true);
    });
    it("its charge", () => {
      const g = butane();
      expect(keepsItsPlace({ ...g, atoms: g.atoms.map((a, i) => (i === 0 ? { ...a, charge: 1 } : a)) }, 0)).toBe(true);
    });
    it("its H count", () => {
      const g = butane();
      expect(keepsItsPlace({ ...g, atoms: g.atoms.map((a, i) => (i === 0 ? { ...a, hs: 2 } : a)) }, 0)).toBe(true);
    });
    it("a bond's order", () => {
      const g = butane();
      expect(keepsItsPlace({ atoms: g.atoms.map((a, i) => (i < 2 ? { ...a, hs: a.hs! - 1 } : a)), bonds: g.bonds.map((b, i) => (i === 0 ? { ...b, order: 2 } : b)) }, 0)).toBe(true);
    });
    it("a stereocentre's configuration", () => {
      // pentane-2,4-diol, C2 given, C4 not
      const atoms: LayoutAtom[] = [...carbons(5, (i) => (i === 0 || i === 4 ? 3 : i === 2 ? 2 : 1)), { el: "O", hs: 1 }, { el: "O", hs: 1 }];
      atoms[1] = { ...atoms[1], tetra: { neighbours: [0, 2, 5, -1], volume: 1 } };
      const bonds = [...chain(5), { a: 1, b: 5, order: 1 }, { a: 3, b: 6, order: 1 }];
      expect(keepsItsPlace({ atoms, bonds }, 1)).toBe(true);
    });
    it("a double bond's cis or trans", () => {
      // hexa-2,4-diene, C2=C3 given cis, C4=C5 not
      const atoms = carbons(6, (i) => (i === 0 || i === 5 ? 3 : 1));
      const bonds = chain(6).map((b, i) => (i === 1 ? { ...b, order: 2, stereo: { refs: [0, 3] as [number, number], cis: true } } : i === 3 ? { ...b, order: 2 } : b));
      expect(keepsItsPlace({ atoms, bonds }, 1)).toBe(true);
    });
    it("a star's pi system", () => {
      // two cyclopentadienyl rings, one bound face-on through a star
      const ring = (at: number): LayoutBond[] => [0, 1, 2, 3, 4].map((i) => ({ a: at + i, b: at + ((i + 1) % 5), order: i % 2 ? 1 : 2 }));
      const atoms: LayoutAtom[] = [...Array.from({ length: 10 }, () => ({ el: "C", hs: 1 })), { el: "*", hs: 0, pi: [0, 1, 2, 3, 4] }];
      expect(keepsItsPlace({ atoms, bonds: [...ring(0), ...ring(5)] }, 0)).toBe(true);
    });
    it("a part in an axis of chirality", () => {
      // two butanes, an axis given along the middle bond of one (its two
      // atoms alike, the axis the same either way round)
      const g: LayoutInput = { atoms: carbons(8, (i) => (i % 4 === 0 || i % 4 === 3 ? 3 : 2)), bonds: [...chain(4), ...chain(4, 4)], axes: [{ atoms: [1, 2], refs: [0, 3], sense: 1 }] };
      expect(keepsItsPlace(g, 1, [2])).toBe(true);
    });
  });
});
