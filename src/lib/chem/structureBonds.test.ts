import { describe, expect, it } from "vitest";
import { movedBond } from "./structureBonds";

describe("a structure's bond moved into another", () => {
  const bond = { a1: 0, a2: 1, order: 2, cisTrans: { refs: [-1, 2] as [number, number], cis: false }, endpoints: [2, 3] };

  it("moves its atoms, its pi system's and its cis or trans's refs - a ref to the atom outside where that is given", () => {
    expect(movedBond(bond, (i) => i + 10, 4)).toEqual({ a1: 10, a2: 11, order: 2, endpoints: [12, 13], cisTrans: { refs: [4, 12], cis: false } });
  });

  it("drops its cis or trans, and only that, where a ref has no place: the atom outside not given, or a ref gone", () => {
    expect(movedBond(bond, (i) => i + 10)).toEqual({ a1: 10, a2: 11, order: 2, endpoints: [12, 13] });
    const inside = { a1: 0, a2: 1, order: 2, cisTrans: { refs: [3, 2] as [number, number], cis: true } };
    expect(movedBond(inside, (i) => (i === 3 ? undefined : i))).toEqual({ a1: 0, a2: 1, order: 2 });
  });
});
