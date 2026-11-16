/**
 * The writers against the core's one hydrogen count (foundation part 12a, the order's: what is written to a file first). A skeleton's
 * test (./skeleton) and the valence a 3D molfile writes for an atom with no hydrogens beyond its bonds (./molWriter) both sum an aromatic
 * bond as one and a half; the core (perception/hydrogens `hydrogenCounts`) takes it by its Kekule order. This holds them side by side over
 * every atom of a thousand analogues and their cores (lib/layout/testdata/analogues) and a set of heteroaromatics, each read with no
 * hydrogens given, as a molecule in 3D has them: they differ on an aromatic N-H's nitrogen and nowhere else. A move changes no answer, so
 * neither writer is moved onto the core here; the difference is named where each sums (`halfOrderSums`) and is for part 12's fixes.
 */
import { describe, expect, it } from "vitest";
import { analogues, CORE_SMILES } from "../layout/testdata/analogues";
import { readSmiles } from "./smiles";
import { halfOrderSums, lacksHydrogens, type SkeletonAtom } from "./skeleton";
import { writeMolfile3d } from "./molWriter";
import { hydrogenCounts, implicitHydrogens } from "./perception/hydrogens";

const HETEROAROMATICS = [
  "c1ccccc1", "c1ccncc1", "c1cc[nH]c1", "c1ccoc1", "c1ccsc1", "c1c[nH]cn1", "c1ccc2[nH]ccc2c1", "c1ccc2ccccc2c1",
  "Clc1c(Cl)c(Cl)[nH]c1Cl", "Clc1c(Cl)c(Cl)n(C)c1Cl", "c1nc2[nH]cnc2c(=O)[nH]1", "O=c1cc[nH]cc1", "c1cc[n+](C)cc1", "[O-]c1ccccc1", "c1ccc[n-]1",
];
const CORPUS = [...HETEROAROMATICS, ...CORE_SMILES, ...analogues().map((a) => a.smiles)];

/** A SMILES read as a molecule in 3D has it: its atoms' elements and charges, no hydrogens given, its bonds' orders (4 aromatic). */
function asIn3d(smiles: string) {
  const s = readSmiles(smiles);
  return {
    atoms: s.atoms.map((a) => ({ el: a.el, charge: a.charge ?? 0 })),
    bonds: s.bonds.map((b) => ({ a1: b.a1, a2: b.a2, order: b.order })),
    aromaticN: new Set(s.atoms.flatMap((a, i) => (a.el === "N" && a.aromatic ? [i] : []))),
  };
}

describe("a skeleton's count against the core's", () => {
  const differing: { smiles: string; atom: number; half: number; core: number; aromaticN: boolean }[] = [];
  const wholeDiffers: string[] = [];
  for (const smiles of CORPUS) {
    const { atoms, bonds, aromaticN } = asIn3d(smiles);
    const half = halfOrderSums(atoms.length, bonds);
    const core = hydrogenCounts(atoms, bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })));
    atoms.forEach((a, i) => {
      const h = implicitHydrogens(a.el, Math.round(half[i]), a.charge);
      if (h !== core[i]) differing.push({ smiles, atom: i, half: h, core: core[i], aromaticN: aromaticN.has(i) });
    });
    const placed: SkeletonAtom[] = atoms.map((a) => ({ ...a, x: 0, y: 0, z: 0 }));
    if (lacksHydrogens(placed, bonds, false) !== core.some((n) => n > 0)) wholeDiffers.push(smiles);
  }

  it("differs only on an aromatic nitrogen, which it leaves no H where the core counts one (a pyrrole's, an indole's)", () => {
    expect(differing.length).toBeGreaterThan(0);
    expect(differing.filter((d) => !(d.aromaticN && d.half === 0 && d.core === 1))).toEqual([]);
    expect(differing.map((d) => d.smiles)).toContain("c1cc[nH]c1");
  });

  it("so takes one molecule of the set for whole that the core's count would call a skeleton: tetrachloropyrrole, its N-H not there", () => {
    expect(wholeDiffers).toEqual(["Clc1c(Cl)c(Cl)[nH]c1Cl"]);
  });
});

describe("the valence a 3D molfile writes against the core's count", () => {
  it("writes a pyrrole's nitrogen, its H not there, valence three: its aromatic bonds as one and a half each, where the core sums two", () => {
    const { atoms, bonds } = asIn3d("c1cc[nH]c1");
    const file = writeMolfile3d(atoms.map((a, i) => ({ ...a, x: i, y: 0, z: 0, noImplicitH: true })), bonds, { version: "V2000" });
    const atomLines = file.split("\n").slice(4, 4 + atoms.length);
    const n = atoms.findIndex((a) => a.el === "N");
    expect(Number(atomLines[n].slice(48, 51))).toBe(3);
    expect(hydrogenCounts(atoms, bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })))[n]).toBe(1);
  });
});
