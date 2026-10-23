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
  // (bulky groups beside a wedged centre: its wedge kept narrow at it, so neither lost nor moved to the group)
  { name: "a stereocentre's R1, bulky groups", template: "F[C@H](*)Cl", lists: "R1: tBu\nCF3\nCMe2OH", products: ["F[C@H](C(C)(C)C)Cl", "F[C@H](C(F)(F)F)Cl", "F[C@H](C(C)(C)O)Cl"] },
  // (a double bond's side: kept as drawn; none where R1 = H makes its end CH2)
  { name: "a double bond's R1", template: "F/C=C/*", lists: "R1: Me\nCl\nH", products: ["F/C=C/C", "F/C=C/Cl", "FC=C"] },
  // (a deuterium is no hydrogen; a charged group as drawn)
  { name: "a methyl's R1", template: "*C", lists: "R1: H\n*[2H]\n*[N+](C)(C)C", products: ["C", "[2H]C", "C[N+](C)(C)C"] },
  // (groups Meno knows by name, each written out)
  { name: "phenyl R1, named groups", template: "*c1ccccc1", lists: "R1: CO2Me\nAc\nCF3\nCN\nNMe2", products: ["COC(=O)c1ccccc1", "CC(=O)c1ccccc1", "FC(F)(F)c1ccccc1", "N#Cc1ccccc1", "CN(C)c1ccccc1"] },
];

/** A substituent swap's known answer: its template, the positions chosen by atom id (the SMILES's atoms from 1), its groups and how they combine, and each combination's compound by its number. */
export type SubstituentCase = { name: string; template: string; positions: number[]; groups: string; combine: "one" | "together"; products: string[] };

export const SUBSTITUENT_CASES: readonly SubstituentCase[] = [
  // (a ring CH: groups as labels, an element, a SMILES - a label and a SMILES of one group the same, set aside)
  { name: "substituents: a ring CH", template: "c1ccccc1", positions: [1], groups: "Me\nCl\nOMe\n*OC", combine: "one", products: ["Cc1ccccc1", "Clc1ccccc1", "COc1ccccc1", "COc1ccccc1"] },
  // (two CHs alike by symmetry, one at a time: each group at the second the same as at the first)
  { name: "substituents: two alike, one at a time", template: "Cc1ccc(C)cc1", positions: [3, 8], groups: "Cl\nF", combine: "one", products: ["Cc1c(Cl)cc(C)cc1", "Cc1c(F)cc(C)cc1", "Cc1ccc(C)cc1Cl", "Cc1ccc(C)cc1F"] },
  // (together, H leaving a position as drawn: the parent first)
  { name: "substituents: two alike, together", template: "Cc1ccc(C)cc1", positions: [3, 8], groups: "H\nMe", combine: "together", products: ["Cc1ccc(C)cc1", "Cc1ccc(C)cc1C", "Cc1c(C)cc(C)cc1", "Cc1c(C)cc(C)cc1C"] },
  // (a wedged centre's undrawn H: the group where the H was, the arrangement kept)
  { name: "substituents: a wedged centre's undrawn H", template: "F[C@H](Cl)Br", positions: [2], groups: "Me\nEt", combine: "one", products: ["F[C@](C)(Cl)Br", "F[C@](CC)(Cl)Br"] },
  // (a drawn H: replaced in place, its bond and wedge kept)
  { name: "substituents: a drawn H", template: "F[C@]([H])(Cl)Br", positions: [3], groups: "Me\nOMe", combine: "one", products: ["F[C@](C)(Cl)Br", "F[C@](OC)(Cl)Br"] },
  // (a CH2 beside a stereocentre: the centre it makes left open)
  { name: "substituents: a CH2 beside a stereocentre", template: "C[C@H](F)CC", positions: [4], groups: "Cl", combine: "one", products: ["C[C@H](F)C(C)Cl"] },
];

/**
 * The substituents' differential against RDKit: stereo-rich templates, each
 * atom with an undrawn hydrogen a position in turn, one at a time, with
 * each of the groups - the compound for each made by RDKit itself, the
 * group put in place of one of that atom's hydrogens (scripts/identity/rdkit.py
 * `substituted`), its configurations kept. Written by no hand, so every
 * position is held to it, the awkward ones too.
 */
export const SUBSTITUENT_DIFFERENTIAL: { templates: readonly string[]; groups: readonly { typed: string; smiles: string }[] } = {
  templates: [
    "CC(C)[C@H](N)C(=O)O",
    "N[C@H](C(=O)O)[C@@H](C)O",
    "CC[C@H](C)[C@@H](C)O",
    "C[C@H]1CC[C@@H](C)CC1",
    "OC[C@H]1OC(O)C[C@@H]1O",
    "C[C@@H](O)c1ccccc1",
    "F/C=C/C",
  ],
  groups: [
    { typed: "Me", smiles: "C" },
    { typed: "OMe", smiles: "OC" },
    { typed: "Cl", smiles: "Cl" },
  ],
};

/** A template drawn by Meno's engine from a SMILES, each "*" an R atom, numbered in order - or as `numbers` gives them. */
export function template(smiles: string, numbers?: number[][]): Model {
  const m = drawnFromSmiles(smiles);
  let k = 0;
  return { ...m, atoms: m.atoms.map((a) => (a.el === "*" ? { ...a, el: "R#", rgroups: numbers?.[k++] ?? [++k] } : a)) };
}
