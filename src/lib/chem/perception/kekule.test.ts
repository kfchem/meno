/**
 * Kekule orders in the core (foundation part 12a): the file moved from lib/chem/kekulize unchanged, which re-exports it; its known answers
 * stay beside that name (kekulize.test.ts, kekuleMetalBound.test.ts) and pass through it. Here, that the names are one, and a ring by hand.
 */
import { describe, expect, it } from "vitest";
import * as kekulize from "../kekulize";
import { AROMATIC_BOND, aromaticRefusal, kekuleOrders, kekulized, outsideRingRefusal, valenceOrders } from "./kekule";
import { hydrogenCounts } from "./hydrogens";

describe("Kekule orders, the core's", () => {
  it("are what lib/chem/kekulize exports under its names", () => {
    expect([kekulize.kekuleOrders, kekulize.kekulized, kekulize.valenceOrders, kekulize.aromaticRefusal, kekulize.AROMATIC_BOND]).toEqual([kekuleOrders, kekulized, valenceOrders, aromaticRefusal, AROMATIC_BOND]);
    expect(kekulize.kekuleOrders).toBe(kekuleOrders);
  });

  it("give a benzene ring three double bonds, alternating, and leave a bond that is not aromatic its order", () => {
    const atoms = Array.from({ length: 7 }, () => ({ el: "C" }));
    const ring = Array.from({ length: 6 }, (_, i) => ({ a: i, b: (i + 1) % 6, order: AROMATIC_BOND }));
    const orders = valenceOrders(atoms, [...ring, { a: 0, b: 6, order: 1 }]);
    expect(orders.slice(0, 6).filter((o) => o === 2)).toHaveLength(3);
    expect(orders.slice(0, 6).every((o, i) => o !== orders[(i + 1) % 6])).toBe(true);
    expect(orders[6]).toBe(1);
  });
});

describe("aromatic bonds outside any ring", () => {
  /** A graph from elements ("O-" charged) and bonds [a, b, order]. */
  const g = (els: string[], bonds: [number, number, number][]) => ({
    atoms: els.map((t) => ({ el: t.replace(/[+-]$/, ""), ...(t.endsWith("-") ? { charge: -1 } : t.endsWith("+") ? { charge: 1 } : {}) })),
    bonds: bonds.map(([a, b, order]) => ({ a, b, order })),
  });
  const kek = (x: ReturnType<typeof g>) => x.bonds.map((b) => ({ a1: b.a, a2: b.b, order: b.order }));

  it("give a carboxyl written C(:O):O one C=O and one C-O, the other O its H: acetic acid, C2H4O2, not ethane-1,1-diol", () => {
    const acid = g(["C", "C", "O", "O"], [[0, 1, 1], [1, 2, AROMATIC_BOND], [1, 3, AROMATIC_BOND]]);
    const orders = valenceOrders(acid.atoms, acid.bonds);
    expect(orders[0]).toBe(1);
    expect([orders[1], orders[2]].sort()).toEqual([1, 2]);
    const hs = hydrogenCounts(acid.atoms, acid.bonds);
    expect(hs[0] + hs[1] + hs[2] + hs[3]).toBe(4);
    expect([hs[0], hs[1], hs[2] + hs[3]]).toEqual([3, 0, 1]);
    expect(outsideRingRefusal(acid.atoms, kek(acid))).toBeNull();
  });

  it("give an acetate, its charge on an O, its C=O to the other O and no H on either", () => {
    const acetate = g(["C", "C", "O", "O-"], [[0, 1, 1], [1, 2, AROMATIC_BOND], [1, 3, AROMATIC_BOND]]);
    expect(valenceOrders(acetate.atoms, acetate.bonds)).toEqual([1, 2, 1]);
    expect(hydrogenCounts(acetate.atoms, acetate.bonds)).toEqual([3, 0, 0, 0]);
  });

  it("give a nitro written N(:O):O with its charges N+(=O)O-: nitromethane, CH3NO2", () => {
    const nitro = g(["C", "N+", "O", "O-"], [[0, 1, 1], [1, 2, AROMATIC_BOND], [1, 3, AROMATIC_BOND]]);
    expect(valenceOrders(nitro.atoms, nitro.bonds)).toEqual([1, 2, 1]);
    expect(hydrogenCounts(nitro.atoms, nitro.bonds)).toEqual([3, 0, 0, 0]);
    expect(outsideRingRefusal(nitro.atoms, kek(nitro))).toBeNull();
  });

  it("refuse a nitro written N(:O):O with no charges, in words: no form closes it, and no H fills it", () => {
    const nitro = g(["C", "N", "O", "O"], [[0, 1, 1], [1, 2, AROMATIC_BOND], [1, 3, AROMATIC_BOND]]);
    expect(outsideRingRefusal(nitro.atoms, kek(nitro))).toBe("its bonds marked aromatic outside a ring (atoms 2, 3 and 4) have no form with single and double bonds: is a charge missing?");
  });

  it("refuse a centre that needs more than one double bond - CO2 written O:C:O, a sulfone: never filled with an H; phosphoric acid read", () => {
    const co2 = g(["O", "C", "O"], [[0, 1, AROMATIC_BOND], [1, 2, AROMATIC_BOND]]);
    expect(outsideRingRefusal(co2.atoms, kek(co2))).toBe("its bonds marked aromatic outside a ring (atoms 1, 2 and 3) have no form with single and double bonds: is a charge missing?");
    const sulfone = g(["C", "S", "O", "O", "C"], [[0, 1, 1], [1, 2, AROMATIC_BOND], [1, 3, AROMATIC_BOND], [1, 4, 1]]);
    expect(outsideRingRefusal(sulfone.atoms, kek(sulfone))).not.toBeNull();
    // (a phosphoric acid's P, of five: one P=O closes it, the other O an OH - phosphoric acid itself, read)
    const phosphate = g(["O", "P", "O", "O", "O"], [[0, 1, 1], [1, 2, AROMATIC_BOND], [1, 3, AROMATIC_BOND], [1, 4, 1]]);
    expect(outsideRingRefusal(phosphate.atoms, kek(phosphate))).toBeNull();
  });

  it("leave a ring's aromatic bonds as they were: benzene, pyridine, pyrrole - and a ring with a carboxyl written so beside it", () => {
    const ring = (els: string[]) => els.map((_, i) => [i, (i + 1) % els.length, AROMATIC_BOND] as [number, number, number]);
    const benzene = g(["C", "C", "C", "C", "C", "C"], ring(["C", "C", "C", "C", "C", "C"]));
    expect(valenceOrders(benzene.atoms, benzene.bonds).filter((o) => o === 2)).toHaveLength(3);
    const pyrrole = g(["N", "C", "C", "C", "C"], ring(["N", "C", "C", "C", "C"]));
    expect(hydrogenCounts(pyrrole.atoms, pyrrole.bonds)).toEqual([1, 1, 1, 1, 1]);
    expect(outsideRingRefusal(pyrrole.atoms, kek(pyrrole))).toBeNull();
    // (benzoic acid, its ring and its carboxyl both written aromatic: the ring's three double bonds, the carboxyl's one)
    const benzoic = g(["C", "C", "C", "C", "C", "C", "C", "O", "O"], [...ring(["C", "C", "C", "C", "C", "C"]), [0, 6, 1], [6, 7, AROMATIC_BOND], [6, 8, AROMATIC_BOND]]);
    const o = valenceOrders(benzoic.atoms, benzoic.bonds);
    expect(o.slice(0, 6).filter((x) => x === 2)).toHaveLength(3);
    expect([o[7], o[8]].sort()).toEqual([1, 2]);
    expect(hydrogenCounts(benzoic.atoms, benzoic.bonds).slice(7).reduce((s, n) => s + n, 0)).toBe(1);
  });
});
