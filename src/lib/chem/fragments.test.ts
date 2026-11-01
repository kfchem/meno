import { describe, expect, it } from "vitest";
import { fragmentsOf } from "./fragments";

const bonds = (...pairs: [number, number][]) => pairs.map(([a1, a2]) => ({ a1, a2 }));

describe("an entry's fragments", () => {
  it("are one where its bonds join every atom", () => {
    // (water: O 0, H 1, H 2)
    expect(fragmentsOf(3, bonds([0, 1], [0, 2]))).toEqual([[0, 1, 2]]);
  });

  it("are the molecules its bonds make, each its atoms in order, in the order of their first atom", () => {
    // (two waters, the second's atoms listed before the first's last H)
    expect(fragmentsOf(6, bonds([0, 1], [3, 4], [3, 5], [0, 2]))).toEqual([
      [0, 1, 2],
      [3, 4, 5],
    ]);
    // (interleaved: a bond's order in the list changes nothing)
    expect(fragmentsOf(6, bonds([5, 3], [1, 4], [0, 2], [4, 3]))).toEqual([
      [0, 2],
      [1, 3, 4, 5],
    ]);
  });

  it("keep a salt's ions apart where no bond joins them", () => {
    // (sodium acetate as drawn apart: CH3 C(=O) O-, then Na+)
    expect(fragmentsOf(5, bonds([0, 1], [1, 2], [1, 3]))).toEqual([[0, 1, 2, 3], [4]]);
  });

  it("join a metal and its ligands by their coordination bonds, as by any bond", () => {
    // (a metal 0 with two ammines, N 1 and N 2, each with one H drawn)
    expect(fragmentsOf(5, bonds([1, 0], [2, 0], [1, 3], [2, 4]))).toEqual([[0, 1, 2, 3, 4]]);
  });

  it("give an atom no bond reaches a fragment of its own, and none for no atoms", () => {
    expect(fragmentsOf(1, [])).toEqual([[0]]);
    expect(fragmentsOf(3, [])).toEqual([[0], [1], [2]]);
    expect(fragmentsOf(0, [])).toEqual([]);
  });

  it("join nothing by a bond that names an atom not there", () => {
    expect(fragmentsOf(2, bonds([0, 5], [-1, 1], [0, 0.5 as number]))).toEqual([[0], [1]]);
  });
});
