import { implicitHydrogens } from "../../chem/molecule";
import { kekuleOrders } from "../../chem/kekulize";
import { readSmiles } from "../../chem/smiles";
import type { LayoutInput } from "../perceive";

/** A molecule as its SMILES gives it: its bonds Kekulé, each atom's H, each centre's configuration. */
export function fromSmiles(smiles: string): LayoutInput {
  const s = readSmiles(smiles);
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
  };
}
