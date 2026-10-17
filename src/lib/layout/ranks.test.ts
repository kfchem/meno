import { describe, expect, it } from "vitest";
import { perceive, type LayoutInput } from "./perceive";
import { atomClasses, canonicalRanks } from "./ranks";
import { fromSmiles } from "./testdata/fromSmiles";
import { shuffled } from "./testdata/shuffled";

/** Each atom's new place in `shuffled(g, seed)`: the same shuffle, its atoms told apart by a charge. */
const placesIn = (n: number, seed: number) => {
  const marked = { atoms: Array.from({ length: n }, (_, i) => ({ el: "C", hs: 0, charge: i + 1 })), bonds: [] };
  const out = shuffled(marked, seed);
  const to = new Array<number>(n);
  out.atoms.forEach((a, t) => (to[(a.charge ?? 0) - 1] = t));
  return to;
};

describe("atom classes and canonical ranks", () => {
  const molecules = [
    "CC(C)(C)c1ccc(O)cc1",
    "C12C3C4C3C2C5C4C51",
    "C[C@H]1CC[C@@H](C(C)C)[C@@H](O)C1",
    "OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O",
  ];
  /** The molecule written by its atoms' canonical ranks: the same text for the same molecule, whichever of alike atoms took which rank. */
  const written = (g: LayoutInput) => {
    const r = canonicalRanks(perceive(g));
    return g.bonds.map((b) => [r[b.a], r[b.b]].sort((p, q) => p - q).join("-") + `:${b.order}`).sort().join(" ");
  };
  it.each(molecules)("are the same for %s in any order of its atoms", (smiles) => {
    const g = fromSmiles(smiles);
    const classes = atomClasses(perceive(g));
    for (const seed of [11, 23, 37]) {
      const to = placesIn(g.atoms.length, seed);
      const other = shuffled(g, seed);
      const c = atomClasses(perceive(other));
      expect(to.map((t) => c[t])).toEqual(classes);
      expect(written(other)).toBe(written(g));
    }
  });

  it("puts a tert-butyl's methyls in one class, each still alone by its canonical rank", () => {
    const mol = perceive(fromSmiles("CC(C)(C)O"));
    const c = atomClasses(mol);
    expect(new Set([c[0], c[2], c[3]]).size).toBe(1);
    expect(new Set(canonicalRanks(mol)).size).toBe(mol.n);
  });
});
