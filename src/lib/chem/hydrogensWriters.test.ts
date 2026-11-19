/**
 * The writers against the core's one hydrogen count (foundation part 12, the order's: what is written to a file first). A skeleton's test
 * (./skeleton) sums an aromatic bond as one and a half; the core (perception/hydrogens `hydrogenCounts`) takes it by its Kekule order.
 * This holds them side by side over every atom of a thousand analogues and their cores (lib/layout/testdata/analogues) and a set of
 * heteroaromatics, each read with no hydrogens given, as a molecule in 3D has them: they differ on an aromatic N-H's nitrogen and nowhere
 * else, which is part 12's fix of the skeleton's sum, to come (`halfOrderSums`). The valence a 3D molfile writes for an atom with no
 * hydrogens beyond its bonds (./molWriter) is the core's count: an aromatic bond by its Kekule order.
 */
import { describe, expect, it } from "vitest";
import { analogues, CORE_SMILES } from "../layout/testdata/analogues";
import { readSmiles } from "./smiles";
import { halfOrderHydrogens, lacksHydrogens, type SkeletonAtom } from "./skeleton";
import { writeMolfile3d } from "./molWriter";
import { hydrogenCounts } from "./perception/hydrogens";

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
    const half = halfOrderHydrogens(atoms.map((a) => ({ ...a, x: 0, y: 0, z: 0 })), bonds);
    const core = hydrogenCounts(atoms, bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })));
    atoms.forEach((_, i) => {
      const h = half[i];
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

describe("the valence a 3D molfile writes, by the core's count", () => {
  /** The valence written on each atom of `smiles` read as a molecule in 3D, each atom taking no hydrogens beyond its bonds, and the H atoms given where asked. */
  const written = (smiles: string) => {
    const { atoms, bonds } = asIn3d(smiles);
    const file = writeMolfile3d(atoms.map((a, i) => ({ ...a, x: i, y: 0, z: 0, noImplicitH: true })), bonds, { version: "V2000" });
    return { atoms, vvv: file.split("\n").slice(4, 4 + atoms.length).map((l) => Number(l.slice(48, 51))) };
  };

  it("writes a pyrrole's nitrogen without its H as two: its bonds by their Kekule orders, never three, one and a half each", () => {
    const { atoms, vvv } = written("c1cc[nH]c1");
    const n = atoms.findIndex((a) => a.el === "N");
    expect(vvv[n]).toBe(2);
    expect(vvv.filter((_, i) => i !== n)).toEqual([3, 3, 3, 3]);
  });

  it("writes it with its H as three, its usual valence - not four", () => {
    const { atoms, vvv } = written("c1ccn([H])c1");
    const n = atoms.findIndex((a) => a.el === "N");
    expect(vvv[n]).toBe(3);
  });

  it("writes indole's, imidazole's and the purine's nitrogens as the Kekule structure has them, pyridine's as three", () => {
    for (const smiles of ["c1ccc2[nH]ccc2c1", "c1c[nH]cn1", "c1ncc2nc[nH]c2n1", "c1ccncc1"]) {
      const { atoms, vvv } = written(smiles);
      const { bonds } = asIn3d(smiles);
      const hs = hydrogenCounts(atoms, bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })));
      // (each N's valence and the H the core gives it make its usual three: what is written says what is there)
      atoms.forEach((a, i) => {
        if (a.el === "N") expect([smiles, i, vvv[i] + hs[i]]).toEqual([smiles, i, 3]);
      });
    }
  });
});

describe("a skeleton's aromatic S and P take no higher valence's H (the chemistry check's ruling)", () => {
  it("thiophene's, thiazole's and thiadiazole's S, and phosphinine's P: none", () => {
    for (const [smiles, el] of [["c1ccsc1", "S"], ["c1cscn1", "S"], ["c1nncs1", "S"], ["c1ccpcc1", "P"]] as const) {
      const { atoms, bonds } = asIn3d(smiles);
      const half = halfOrderHydrogens(atoms.map((a) => ({ ...a, x: 0, y: 0, z: 0 })), bonds);
      expect(half[atoms.findIndex((a) => a.el === el)], smiles).toBe(0);
    }
  });
});

describe("a skeleton's P or S on a metal takes no higher valence's H (found in review)", () => {
  it("Ni(PF3)4 and an Fe4S4 core, their orders given: no hydrogens lacking; free PF3 and SF4 as before", () => {
    const at = (el: string) => ({ el, x: 0, y: 0, z: 0 });
    // (Ni(PF3)4: the Ni, then each P with its three F)
    const ni = { atoms: [at("Ni")], bonds: [] as { a1: number; a2: number; order: number }[] };
    for (let k = 0; k < 4; k++) {
      const p = ni.atoms.push(at("P")) - 1;
      ni.bonds.push({ a1: 0, a2: p, order: 1 });
      for (let f = 0; f < 3; f++) ni.bonds.push({ a1: p, a2: ni.atoms.push(at("F")) - 1, order: 1 });
    }
    expect(lacksHydrogens(ni.atoms, ni.bonds, false)).toBe(false);
    // (an Fe4S4 cube: each S on three Fe)
    const cube = { atoms: [...["Fe", "Fe", "Fe", "Fe"], ...["S", "S", "S", "S"]].map(at), bonds: [] as { a1: number; a2: number; order: number }[] };
    for (let s = 4; s < 8; s++) for (let fe = 0; fe < 4; fe++) if (fe !== s - 4) cube.bonds.push({ a1: fe, a2: s, order: 1 });
    expect(lacksHydrogens(cube.atoms, cube.bonds, false)).toBe(false);
    // (free PF3 and SF4: whole, as before)
    expect(lacksHydrogens([at("P"), at("F"), at("F"), at("F")], [1, 2, 3].map((f) => ({ a1: 0, a2: f, order: 1 })), false)).toBe(false);
    expect(lacksHydrogens([at("S"), at("F"), at("F"), at("F"), at("F")], [1, 2, 3, 4].map((f) => ({ a1: 0, a2: f, order: 1 })), false)).toBe(false);
  });
});
