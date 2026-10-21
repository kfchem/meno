import { describe, expect, it } from "vitest";
import { identityText } from "../../../../lib/chem/identity";
import { laidOutChecked } from "../../../../lib/layout/many";
import { fromSmiles } from "../../../../lib/layout/testdata/fromSmiles";
import { layOutMany } from "./layOut";

describe("many structures laid out off the drawing's thread", () => {
  it("hands each back in the order given, read back against itself, saying how far it has got", async () => {
    const inputs = ["C[C@H](N)C(=O)O", "C/C=C/c1ccccc1", "C[N+](C)(C)CC(=O)[O-]", "C1CC[C@H]2CCCC[C@H]2C1"].map(fromSmiles);
    const told: number[] = [];
    const laid = await layOutMany(inputs, (n) => told.push(n));
    expect(laid).toHaveLength(inputs.length);
    laid.forEach((l, i) => {
      expect(l.notAsGiven).toEqual([]);
      // (the drawing for the structure in its place: the same as laying that one out alone)
      expect(l.layout!.x).toEqual(laidOutChecked(inputs[i]).layout!.x);
    });
    expect(told[told.length - 1]).toBe(inputs.length);
    expect(new Set(inputs.map(identityText)).size).toBe(inputs.length);
  });

  it("keeps a structure the engine cannot lay out in its place, saying so", async () => {
    // (a bond to an atom that is not there)
    const bad = { atoms: [{ el: "C", hs: 3 }], bonds: [{ a: 0, b: 5, order: 1 }] };
    const laid = await layOutMany([fromSmiles("CCO"), bad, fromSmiles("CCN")]);
    expect(laid).toHaveLength(3);
    expect(laid[0].notAsGiven).toEqual([]);
    expect(laid[2].notAsGiven).toEqual([]);
    expect(laid[1].notAsGiven.length).toBeGreaterThan(0);
  });
});
