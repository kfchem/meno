import { readSmiles } from "../../../../lib/chem/smiles";
import { implicitHydrogens } from "../../../../lib/chem/molecule";
import { layout2D } from "../../../../lib/layout/engine";
import { smilesInput } from "../../../../lib/layout/smilesInput";
import { emptyWorkspaceDocument, relayout } from "../document";
import type { Model } from "../store/types";
import { relayoutFrom } from "../chem/engineLayout";

/**
 * A SMILES drawn as Meno's engine draws it, as a drawing on the page: its
 * atoms (ids from 1, in the SMILES's order), each with its charge and mass
 * number, the H's it writes on an atom where they are not the atom's usual
 * ([NH3] or [OH2] on a metal, [BH3]: its valence, as a file sets one), its
 * bonds Kekulé, laid out and wedged by the engine - the same
 * path Clean-up takes (`relayoutFrom`), given the SMILES's configurations
 * in place of a drawing's. Read by Meno's own reader (lib/chem/smiles): it
 * throws where the SMILES is not one it reads.
 */
export function drawnFromSmiles(smiles: string): Model {
  const s = readSmiles(smiles);
  const input = smilesInput(smiles);
  const sum = s.atoms.map(() => 0);
  for (const b of input.bonds) {
    sum[b.a] += b.order;
    sum[b.b] += b.order;
  }
  const written = (i: number) => {
    const { el, hs, charge } = s.atoms[i];
    return hs == null || hs === implicitHydrogens(el, sum[i], charge ?? 0) ? {} : { valence: sum[i] + hs };
  };
  const model: Model = {
    atoms: s.atoms.map((a, i) => ({ id: i + 1, el: a.el, x: 0, y: 0, r: 0.9, ...(a.charge ? { charge: a.charge } : {}), ...(a.isotope ? { isotope: a.isotope } : {}), ...written(i) })) as Model["atoms"],
    bonds: input.bonds.map((b, k) => ({ id: 1000 + k, a: b.a + 1, b: b.b + 1, order: b.order as 1 | 2 | 3 })),
  };
  const job = { input, ids: model.atoms.map((a) => a.id), folded: new Map<number, number[]>() };
  const change = relayoutFrom(model, model, job, layout2D(input));
  return relayout({ ...emptyWorkspaceDocument(), model, nextId: 2000 }, change).model;
}
