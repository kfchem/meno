/**
 * Kekule orders in the core (foundation part 12a): the file moved from lib/chem/kekulize unchanged, which re-exports it; its known answers
 * stay beside that name (kekulize.test.ts, kekuleMetalBound.test.ts) and pass through it. Here, that the names are one, and a ring by hand.
 */
import { describe, expect, it } from "vitest";
import * as kekulize from "../kekulize";
import { AROMATIC_BOND, aromaticRefusal, kekuleOrders, kekulized, valenceOrders } from "./kekule";

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
