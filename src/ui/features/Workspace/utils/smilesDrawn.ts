import { readSmiles } from "../../../../lib/chem/smiles";
import { layout2D } from "../../../../lib/layout/engine";
import { smilesInput } from "../../../../lib/layout/smilesInput";
import { emptyWorkspaceDocument, relayout } from "../document";
import type { Model } from "../store/types";
import { relayoutFrom } from "../chem/engineLayout";

/**
 * A SMILES drawn as Meno's engine draws it, as a drawing on the page: its
 * atoms (ids from 1, in the SMILES's order), each with its charge and mass
 * number, its bonds Kekulé, laid out and wedged by the engine - the same
 * path Clean-up takes (`relayoutFrom`), given the SMILES's configurations
 * in place of a drawing's. Read by Meno's own reader (lib/chem/smiles): it
 * throws where the SMILES is not one it reads.
 */
export function drawnFromSmiles(smiles: string): Model {
  const s = readSmiles(smiles);
  const input = smilesInput(smiles);
  const model: Model = {
    atoms: s.atoms.map((a, i) => ({ id: i + 1, el: a.el, x: 0, y: 0, r: 0.9, ...(a.charge ? { charge: a.charge } : {}), ...(a.isotope ? { isotope: a.isotope } : {}) })) as Model["atoms"],
    bonds: input.bonds.map((b, k) => ({ id: 1000 + k, a: b.a + 1, b: b.b + 1, order: b.order as 1 | 2 | 3 })),
  };
  const job = { input, ids: model.atoms.map((a) => a.id), folded: new Map<number, number[]>() };
  const change = relayoutFrom(model, model, job, layout2D(input));
  return relayout({ ...emptyWorkspaceDocument(), model, nextId: 2000 }, change).model;
}
