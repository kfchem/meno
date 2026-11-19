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
