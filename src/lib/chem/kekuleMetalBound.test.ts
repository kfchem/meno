import { describe, expect, it } from "vitest";
import { readSmiles } from "./smiles";
import { kekuleOrders } from "./kekulize";
import { implicitHydrogens } from "./molecule";

/** The orders and each atom's H of `smiles`, its aromatic bonds written out (smilesInput's way). */
function kekule(smiles: string) {
  const s = readSmiles(smiles);
  const orders = kekuleOrders(s.atoms, s.bonds);
  const sum = s.atoms.map(() => 0);
  s.bonds.forEach((b, i) => {
    sum[b.a1] += orders[i];
    sum[b.a2] += orders[i];
  });
  return { s, orders, hs: s.atoms.map((a, i) => a.hs ?? implicitHydrogens(a.el, sum[i], a.charge ?? 0)) };
}

describe("an aromatic ring bound to a metal by its N", () => {
  it("stays a pyridine, an isoquinoline: a double bond at its N, one H on each ring carbon of two ring bonds - not a dihydropyridine with a CH2", () => {
    for (const smiles of ["Cl[Pt](Cl)(n1ccccc1)n1ccccc1", "Cl[Pt](Cl)(N)n1ccccc1", "Cl[Pd](Cl)(n1ccc2ccccc2c1)n1ccc2ccccc2c1"]) {
      const { s, orders, hs } = kekule(smiles);
      s.atoms.forEach((a, i) => {
        // (an aromatic carbon's H: one where it has two ring bonds, none at a fusion - never two, a CH2)
        const own = s.bonds.filter((b) => b.a1 === i || b.a2 === i).length;
        if (a.el === "C" && s.bonds.some((b) => (b.a1 === i || b.a2 === i) && b.order === 4)) expect(hs[i], `${smiles} C${i}`).toBe(3 - own);
      });
      // (each ring N bound to its metal: a double bond in its ring)
      for (const [i, a] of s.atoms.entries()) {
        if (a.el !== "N" || !s.bonds.some((b) => (b.a1 === i || b.a2 === i) && b.order === 4)) continue;
        const toMetal = s.bonds.some((b) => (b.a1 === i || b.a2 === i) && ["Pt", "Pd"].includes(s.atoms[b.a1 === i ? b.a2 : b.a1].el));
        if (toMetal) expect(s.bonds.some((b, k) => (b.a1 === i || b.a2 === i) && orders[k] === 2), `${smiles} N${i}`).toBe(true);
      }
    }
  });

  it("leaves a ring bound by none as it was: pyridine, pyridinium, pyrrole", () => {
    expect(kekule("n1ccccc1").orders.filter((o) => o === 2)).toHaveLength(3);
    expect(kekule("C[n+]1ccccc1").orders.filter((o) => o === 2)).toHaveLength(3);
    expect(kekule("[nH]1cccc1").orders.filter((o) => o === 2)).toHaveLength(2);
  });
});
