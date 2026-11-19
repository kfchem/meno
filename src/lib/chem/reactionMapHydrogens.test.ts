// Held beside reactionMap.test.ts: a flat file structure whose atoms carry all their hydrogens as atoms, its radicals, charges and double bonds given, is no drawing - `mapReaction` does not refuse it as flat.
import { describe, expect, it } from "vitest";
import { mapReaction } from "./reactionMap";
import type { Molecule } from "./molecule";

/** A centre with `n` hydrogens drawn round it, all at z = 0 - a file's flat structure, hydrogens and all. */
const withHydrogens = (centre: { el: string; charge?: number; radical?: "doublet" | "singlet" | "triplet" }, n: number, doubleTo?: string): Molecule => {
  const atoms: Molecule["atoms"] = [{ ...centre, x: 0, y: 0, z: 0 } as Molecule["atoms"][number]];
  const bonds: Molecule["bonds"] = [];
  for (let k = 0; k < n; k++) {
    atoms.push({ el: "H", x: Math.cos((2 * Math.PI * k) / n), y: Math.sin((2 * Math.PI * k) / n), z: 0 } as Molecule["atoms"][number]);
    bonds.push({ a1: 0, a2: atoms.length - 1, order: 1 });
  }
  if (doubleTo) {
    atoms.push({ el: doubleTo, x: 0, y: 1.2, z: 0 } as Molecule["atoms"][number]);
    bonds.push({ a1: 0, a2: atoms.length - 1, order: 2 });
  }
  return { atoms, bonds };
};
const refusedAsFlat = (m: Molecule) => (mapReaction({ reactants: [m], products: [m] }) as { error?: string }).error === "2d";

describe("a flat structure with all its hydrogens, as a file gives it, is no drawing", () => {
  it("formaldehyde: its C=O of type 2 and two hydrogens", () => {
    expect(refusedAsFlat(withHydrogens({ el: "C" }, 2, "O"))).toBe(false);
  });
  it("the methyl cation: its charge leaves the carbon three bonds", () => {
    expect(refusedAsFlat(withHydrogens({ el: "C", charge: 1 }, 3))).toBe(false);
  });
  it("the methyl radical: its unpaired electron takes a bond's place", () => {
    expect(refusedAsFlat(withHydrogens({ el: "C", radical: "doublet" }, 3))).toBe(false);
  });
  it("and a methane short of one hydrogen is a drawing", () => {
    expect(refusedAsFlat(withHydrogens({ el: "C" }, 3))).toBe(true);
  });
});

describe("a flat pyrrole whose N-H is left out is short of it, its ring typed aromatic or Kekule (the chemistry check's ruling)", () => {
  /** Pyrrole flat, each C-H drawn, its ring's bonds of `ring` (4 aromatic; else Kekule), its N-H drawn or not. */
  const pyrrole = (ring: "aromatic" | "kekule", nh: boolean): Molecule => {
    const atoms: Molecule["atoms"] = [];
    const bonds: Molecule["bonds"] = [];
    const at = (el: string, x: number, y: number) => atoms.push({ el, x, y, z: 0 } as Molecule["atoms"][number]) - 1;
    const ringAtoms = ["N", "C", "C", "C", "C"].map((el, k) => at(el, Math.cos((2 * Math.PI * k) / 5), Math.sin((2 * Math.PI * k) / 5)));
    const kekule = [1, 2, 1, 2, 1];
    ringAtoms.forEach((a, k) => bonds.push({ a1: a, a2: ringAtoms[(k + 1) % 5], order: ring === "aromatic" ? 4 : kekule[k] }));
    ringAtoms.forEach((a, k) => {
      if (k === 0 && !nh) return;
      bonds.push({ a1: a, a2: at("H", 2 * Math.cos((2 * Math.PI * k) / 5), 2 * Math.sin((2 * Math.PI * k) / 5)), order: 1 });
    });
    return { atoms, bonds };
  };

  it("typed aromatic, its N-H left out: taken as a drawing short of its H", () => {
    expect(refusedAsFlat(pyrrole("aromatic", false))).toBe(true);
  });
  it("its N-H drawn: whole, aromatic or Kekule", () => {
    expect(refusedAsFlat(pyrrole("aromatic", true))).toBe(false);
    expect(refusedAsFlat(pyrrole("kekule", true))).toBe(false);
  });
  it("typed Kekule, its N-H left out: short of it, as before", () => {
    expect(refusedAsFlat(pyrrole("kekule", false))).toBe(true);
  });
});
