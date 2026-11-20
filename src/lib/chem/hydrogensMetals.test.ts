// Held beside hydrogens.test.ts, hydrogensWriters.test.ts and contract.test.ts: a P or an S on a metal whichever end of the bond the metal is, a phosphorus trihalide on a metal left drawn, selenium on the ladder, the skeleton's S(IV), and protonation's count by the ladder.
import { describe, expect, it } from "vitest";
import { smilesInput } from "../layout/smilesInput";
import { contractGraph, contractions } from "./contract";
import { kekuleOrders } from "./kekulize";
import { readSmiles } from "./smiles";
import { hydrogenCounts } from "./perception/hydrogens";
import { hydrogensOf } from "./protonation";
import { lacksHydrogens } from "./skeleton";

const at = (el: string) => ({ el, x: 0, y: 0, z: 0 });

describe("the ladder, and where a metal stands in a bond", () => {
  it("gives a Se of three bonds its H, as an S of three: CH3Se(=O)H", () => {
    expect(hydrogenCounts([{ el: "Se" }, { el: "O" }, { el: "C" }], [{ a: 0, b: 1, order: 2 }, { a: 0, b: 2, order: 1 }])[0]).toBe(1);
  });

  it("gives protonation's P of four bonds and its S of three their H: the ladder, its sums its own", () => {
    expect([hydrogensOf({ el: "P" }, 4), hydrogensOf({ el: "S" }, 3), hydrogensOf({ el: "P" }, 3), hydrogensOf({ el: "S" }, 2)]).toEqual([1, 1, 0, 0]);
  });

  it("gives a P bonded to a metal no H, the metal the second atom of its bond as well as the first", () => {
    for (const smiles of ["CP(C)(C)[Pd](Cl)Cl", "Cl[Pd](Cl)P(C)(C)C", "C[S](C)[Pd]Cl"]) {
      const g = smilesInput(smiles) as unknown as { atoms: { el: string; hs?: number }[] };
      expect(g.atoms.filter((a) => a.el === "P" || a.el === "S").map((a) => a.hs), smiles).toEqual([0]);
    }
  });
});

describe("a skeleton's P and S, their orders given", () => {
  it("lacks the H of an S(IV) of three bonds: F-S(=O), and none where the S has four", () => {
    expect(lacksHydrogens([at("F"), at("S"), at("O")], [{ a1: 0, a2: 1, order: 1 }, { a1: 1, a2: 2, order: 2 }], false)).toBe(true);
    expect(lacksHydrogens([at("O"), at("S"), at("O")], [{ a1: 0, a2: 1, order: 2 }, { a1: 1, a2: 2, order: 2 }], false)).toBe(false);
  });

  it("lacks none where the P of PF3 is on a nickel, the nickel the second atom of its bond as well as the first", () => {
    const ni = { atoms: [at("P"), at("F"), at("F"), at("F"), at("Ni")], bonds: [{ a1: 0, a2: 1, order: 1 }, { a1: 0, a2: 2, order: 1 }, { a1: 0, a2: 3, order: 1 }, { a1: 0, a2: 4, order: 1 }] };
    expect(lacksHydrogens(ni.atoms, ni.bonds, false)).toBe(false);
    expect(lacksHydrogens(ni.atoms, ni.bonds.map((b) => ({ ...b, a1: b.a2, a2: b.a1 })), false)).toBe(false);
  });
});

describe("a contraction's count of the hydrogens of a P on a metal", () => {
  const written = (smiles: string) => {
    const r = readSmiles(smiles);
    const orders = kekuleOrders(r.atoms, r.bonds);
    return contractions(contractGraph(r.atoms, r.bonds.map((b, i) => ({ ...b, order: orders[i] })))).map((c) => c.label).sort();
  };
  it("writes no PHCl3 or PHF3 for a phosphorus trihalide on a metal: the P is P(III) with its three halogens, nothing to contract", () => {
    expect(written("Cl[Pd](Cl)(P(Cl)(Cl)Cl)P(Cl)(Cl)Cl")).toEqual([]);
    expect(written("Cl[Pd](Cl)(P(F)(F)F)P(F)(F)F")).toEqual([]);
    expect(written("F[Ni](P(F)(F)F)")).toEqual([]);
  });
});
