/**
 * Structures drawn for the identity's known answers against another
 * canonicaliser (identityOf.test.ts, the RDKit fixture beside this file):
 * each drawn by Meno's own engine from a SMILES - its 2D coordinates and
 * the wedges the engine draws - and written as Meno writes a molfile. Each
 * case is named; cases that are one structure share a `same`.
 */
import { readSmiles } from "../../../../../lib/chem/smiles";
import { layout2D } from "../../../../../lib/layout/engine";
import { fromSmiles } from "../../../../../lib/layout/testdata/fromSmiles";
import { emptyWorkspaceDocument, relayout } from "../../document";
import type { Model } from "../../store/types";
import { relayoutFrom } from "../engineLayout";

export type IdentityCase = { name: string; smiles: string; same: string };

export const IDENTITY_CASES: readonly IdentityCase[] = [
  // (a plain H drawn or not: one structure)
  { name: "methanol", smiles: "CO", same: "methanol" },
  { name: "methanol, its H drawn", smiles: "[H]C([H])([H])O[H]", same: "methanol" },
  { name: "chlorobenzene", smiles: "Clc1ccccc1", same: "chlorobenzene" },
  { name: "chlorobenzene, an H drawn beside the Cl", smiles: "Clc1ccccc1[H]", same: "chlorobenzene" },
  // (Kekule structures of one ring: one structure)
  { name: "toluene", smiles: "CC1=CC=CC=C1", same: "toluene" },
  { name: "toluene, the other Kekule structure", smiles: "CC1C=CC=CC=1", same: "toluene" },
  // (a stereocentre: its mirror image another; its H drawn, the same centre)
  { name: "(R)-bromochlorofluoromethane", smiles: "F[C@@H](Cl)Br", same: "R-CHFClBr" },
  { name: "(S)-bromochlorofluoromethane", smiles: "F[C@H](Cl)Br", same: "S-CHFClBr" },
  { name: "(R)-bromochlorofluoromethane, its H drawn", smiles: "F[C@@]([H])(Cl)Br", same: "R-CHFClBr" },
  { name: "(S)-alanine", smiles: "C[C@H](N)C(=O)O", same: "S-alanine" },
  { name: "(R)-alanine", smiles: "C[C@@H](N)C(=O)O", same: "R-alanine" },
  // (E and Z: two; the H that sets the side drawn, the same)
  { name: "(E)-1,2-difluoroethene", smiles: "F/C=C/F", same: "E-difluoroethene" },
  { name: "(Z)-1,2-difluoroethene", smiles: "F/C=C\\F", same: "Z-difluoroethene" },
  { name: "(Z)-1,2-difluoroethene, its H drawn", smiles: "[H]/C(F)=C(/F)[H]", same: "Z-difluoroethene" },
  { name: "(E)-but-2-ene", smiles: "C/C=C/C", same: "E-butene" },
  { name: "(Z)-but-2-ene", smiles: "C/C=C\\C", same: "Z-butene" },
  // (no configuration where two H are on one end)
  { name: "fluoroethene", smiles: "C=CF", same: "fluoroethene" },
  { name: "fluoroethene, both H of its CH2 drawn", smiles: "[H]C([H])=CF", same: "fluoroethene" },
  // (tautomers: two)
  { name: "4-hydroxypyridine", smiles: "Oc1ccncc1", same: "4-hydroxypyridine" },
  { name: "4-pyridone", smiles: "O=C1C=CNC=C1", same: "4-pyridone" },
  // (an isotope: kept apart)
  { name: "methane", smiles: "C", same: "methane" },
  { name: "deuteriomethane", smiles: "[2H]C", same: "CH3D" },
  { name: "tritiomethane", smiles: "[3H]C", same: "CH3T" },
  { name: "methane-13C", smiles: "[13CH4]", same: "13CH4" },
  // (H2: kept)
  { name: "hydrogen", smiles: "[H][H]", same: "H2" },
  // (bond-shift isomers: one structure by Meno's rule, two by RDKit's - listed by name in the test)
  { name: "1,2-dimethylcyclooctatetraene, across a double bond", smiles: "CC1=C(C)C=CC=CC=C1", same: "dimethyl-COT" },
  { name: "1,2-dimethylcyclooctatetraene, across a single bond", smiles: "CC1=CC=CC=CC=C1C", same: "dimethyl-COT" },
];

/**
 * A SMILES drawn as Meno's engine draws it, as a drawing on the page: its
 * atoms (ids from 1, in the SMILES's order), each with its charge and mass
 * number, its bonds Kekulé, laid out and wedged by the engine - the same
 * path Clean-up takes (`relayoutFrom`), given the SMILES's configurations
 * in place of a drawing's.
 */
export function drawnFromSmiles(smiles: string): Model {
  const s = readSmiles(smiles);
  const input = fromSmiles(smiles);
  const model: Model = {
    atoms: s.atoms.map((a, i) => ({ id: i + 1, el: a.el, x: 0, y: 0, r: 0.9, ...(a.charge ? { charge: a.charge } : {}), ...(a.isotope ? { isotope: a.isotope } : {}) })) as Model["atoms"],
    bonds: input.bonds.map((b, k) => ({ id: 1000 + k, a: b.a + 1, b: b.b + 1, order: b.order as 1 | 2 | 3 })),
  };
  const job = { input, ids: model.atoms.map((a) => a.id), folded: new Map<number, number[]>() };
  const change = relayoutFrom(model, model, job, layout2D(input));
  return relayout({ ...emptyWorkspaceDocument(), model, nextId: 2000 }, change).model;
}
