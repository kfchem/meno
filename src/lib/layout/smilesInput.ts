import { implicitHydrogens } from "../chem/molecule";
import { aromaticRefusal, kekuleOrders } from "../chem/kekulize";
import { typedRingRefused } from "../chem/smilesWhy";
import { readSmiles } from "../chem/smiles";
import type { LayoutInput } from "./perceive";

/**
 * A molecule as its SMILES gives it, for the layout engine: its bonds
 * Kekulé, each atom's H, each centre's configuration. Throws where it does
 * not read - its aromatic rings too, where they cannot be given single and
 * double bonds as written (lib/chem/kekulize `aromaticRefusal`), in
 * smilesWhy's words.
 */
export function smilesInput(smiles: string): LayoutInput {
  const s = readSmiles(smiles);
  const refused = aromaticRefusal(s.atoms, s.bonds);
  if (refused) throw new Error(`This SMILES could not be read: ${typedRingRefused(refused)}`);
  const orders = kekuleOrders(s.atoms, s.bonds);
  const sum = s.atoms.map(() => 0);
  s.bonds.forEach((b, i) => {
    sum[b.a1] += orders[i];
    sum[b.a2] += orders[i];
  });
  return {
    atoms: s.atoms.map((a, i) => ({
      el: a.el,
      hs: a.hs ?? implicitHydrogens(a.el, sum[i], a.charge ?? 0),
      ...(a.charge ? { charge: a.charge } : {}),
      ...(a.tetra ? { tetra: a.tetra } : {}),
    })),
    bonds: s.bonds.map((b, i) => ({ a: b.a1, b: b.a2, order: orders[i], ...(b.cisTrans ? { stereo: b.cisTrans } : {}) })),
    ...(s.axes ? { axes: s.axes } : {}),
    ...(s.cumulated ? { cumulated: s.cumulated } : {}),
  };
}
