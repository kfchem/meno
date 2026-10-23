/**
 * Enumerate's known answers against another canonicaliser
 * (enumerate.rdkit.test.ts, the RDKit fixture beside this file): templates
 * drawn by Meno's own engine from a SMILES, each "*" an R atom, enumerated
 * with lists; and, for each combination by its number, the compound it is
 * written by hand as a SMILES of its own - never made by Meno - so that
 * RDKit reading Meno's product and that SMILES gives the same structure.
 */
import type { Model } from "../../store/types";
import { drawnFromSmiles } from "../../chem/testdata/identityCases";

export type EnumerationCase = { name: string; template: string; lists: string; products: string[] };

export const ENUMERATION_CASES: readonly EnumerationCase[] = [
  // (groups read as labels, as elements, as SMILES; a label and a SMILES of one group: the same, set aside)
  { name: "phenyl R1", template: "*c1ccccc1", lists: "R1: Me\nCl\n*OC\nOMe\nH", products: ["Cc1ccccc1", "Clc1ccccc1", "COc1ccccc1", "COc1ccccc1", "c1ccccc1"] },
  // (two R groups across a symmetric ring: R1 = Cl, R2 = Me the same as R1 = Me, R2 = Cl)
  { name: "para R1 and R2", template: "*c1ccc(*)cc1", lists: "R1: Me\nCl\nR2: Me\nCl", products: ["Cc1ccc(C)cc1", "Cc1ccc(Cl)cc1", "Clc1ccc(C)cc1", "Clc1ccc(Cl)cc1"] },
  // (a stereocentre drawn with a wedge: kept as drawn whatever goes in; none where R1 = H leaves two H)
  { name: "a stereocentre's R1", template: "F[C@H](*)Cl", lists: "R1: Me\nEt\nBr\nH", products: ["F[C@H](C)Cl", "F[C@H](CC)Cl", "F[C@H](Br)Cl", "FCCl"] },
  // (a double bond's side: kept as drawn; none where R1 = H makes its end CH2)
  { name: "a double bond's R1", template: "F/C=C/*", lists: "R1: Me\nCl\nH", products: ["F/C=C/C", "F/C=C/Cl", "FC=C"] },
  // (a deuterium is no hydrogen; a charged group as drawn)
  { name: "a methyl's R1", template: "*C", lists: "R1: H\n*[2H]\n*[N+](C)(C)C", products: ["C", "[2H]C", "C[N+](C)(C)C"] },
  // (groups Meno knows by name, each written out)
  { name: "phenyl R1, named groups", template: "*c1ccccc1", lists: "R1: CO2Me\nAc\nCF3\nCN\nNMe2", products: ["COC(=O)c1ccccc1", "CC(=O)c1ccccc1", "FC(F)(F)c1ccccc1", "N#Cc1ccccc1", "CN(C)c1ccccc1"] },
];

/** A template drawn by Meno's engine from a SMILES, each "*" an R atom, numbered in order - or as `numbers` gives them. */
export function template(smiles: string, numbers?: number[][]): Model {
  const m = drawnFromSmiles(smiles);
  let k = 0;
  return { ...m, atoms: m.atoms.map((a) => (a.el === "*" ? { ...a, el: "R#", rgroups: numbers?.[k++] ?? [++k] } : a)) };
}
