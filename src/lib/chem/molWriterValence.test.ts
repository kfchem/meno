import { describe, expect, it } from "vitest";
import { analogues, CORE_SMILES } from "../layout/testdata/analogues";
import { readSmiles } from "./smiles";
import { writeMolfile3d } from "./molWriter";
import { hydrogenCounts } from "./perception/hydrogens";

/**
 * The valence a 3D molfile writes (lib/chem/molWriter `writeMolfile3d`), over a whole corpus, not nitrogen alone: for a molecule in 3D
 * whose atoms take no hydrogens beyond their bonds, a neutral atom's written valence plus the hydrogens the core gives it
 * (perception/hydrogens `hydrogenCounts`) is the element's usual valence - each carbon of a fused ring (three aromatic bonds: 4, not
 * 5), an N-substituted pyrrole's nitrogen (3, not 4), a thiophene's S and a furan's O (2, not 3) as much as a pyrrole's N-H (found in
 * review).
 */
const HETERO = [
  "c1ccccc1", "c1ccncc1", "c1cc[nH]c1", "c1ccoc1", "c1ccsc1", "c1c[nH]cn1", "c1ccc2[nH]ccc2c1", "c1ccc2ccccc2c1",
  "Clc1c(Cl)c(Cl)[nH]c1Cl", "Clc1c(Cl)c(Cl)n(C)c1Cl", "c1nc2[nH]cnc2c(=O)[nH]1", "O=c1cc[nH]cc1", "c1cc[se]c1", "c1ccc2occc2c1", "c1ccc2sccc2c1",
];
const USUAL: Record<string, number> = { C: 4, N: 3, O: 2, S: 2, Se: 2 };
const CORPUS = [...new Set([...HETERO, ...CORE_SMILES, ...analogues().map((a) => a.smiles)])];

describe("the valence a 3D molfile writes, with the core's hydrogens, is the usual valence", () => {
  it("holds for every neutral C, N and O, and for S and Se not hypervalent, over the corpus", () => {
    const wrong: string[] = [];
    let checked = 0;
    for (const smiles of CORPUS) {
      const s = readSmiles(smiles);
      const atoms = s.atoms.map((a, i) => ({ el: a.el, charge: a.charge ?? 0, x: i, y: 0, z: 0, noImplicitH: true }));
      const bonds = s.bonds.map((b) => ({ a1: b.a1, a2: b.a2, order: b.order }));
      const vvv = writeMolfile3d(atoms, bonds, { version: "V2000" }).split("\n").slice(4, 4 + atoms.length).map((l) => Number(l.slice(48, 51)));
      const hs = hydrogenCounts(atoms, bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })));
      atoms.forEach((a, i) => {
        const usual = USUAL[a.el];
        // (S and Se may be over their usual valence, hypervalent; C, N and O, neutral, never)
        if (usual == null || a.charge !== 0 || (vvv[i] > usual && (a.el === "S" || a.el === "Se"))) return;
        checked++;
        if (vvv[i] + hs[i] !== usual) wrong.push(`${smiles} atom ${i} ${a.el}: written ${vvv[i]} + ${hs[i]} H`);
      });
    }
    expect(checked).toBeGreaterThan(1000);
    expect(wrong.slice(0, 5)).toEqual([]);
    expect(wrong.length).toBe(0);
  });
});
