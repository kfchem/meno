/**
 * Beside isomers.test.ts (its `count` style): what it leaves unheld of the joined sets - two sets of tied bridgeheads in two ring
 * systems are two places and counted as such (two norbornane units on one ether: each four, the pair of identical units ten); and a
 * structure that is not counted for two sets in one ring system is said so by the same sentence however its centres are given.
 */
import { describe, expect, it } from "vitest";
import { smilesInput } from "../layout/smilesInput";
import type { IdentityInput } from "./identity";
import { isomersOf, NOT_COUNTED_JOINED } from "./isomers";

const answer = (smiles: string): number | string => {
  const r = isomersOf(smilesInput(smiles) as unknown as IdentityInput);
  if ("tooMany" in r) return `tooMany ${r.tooMany}`;
  if ("notCounted" in r) return r.notCounted;
  return r.isomers.length;
};

describe("sets of tied bridgeheads in separate ring systems", () => {
  it("are counted each as one place: a norbornan-2-yl ether is ten (two units of four stereoisomers, alike, a pair of either order once), not refused as joined", () => {
    expect(answer("OC1CC2CCC1C2")).toBe(4);
    expect(answer("O(C1CC2CCC1C2)C1CC2CCC1C2")).toBe(10);
  });

  it("a norbornan-2-ol and a 2-methylnorbornane, two parts of one structure: four and four, in no one ring system: sixteen", () => {
    expect(answer("OC1CC2CCC1C2.CC1CC2CCC1C2")).toBe(16);
  });
});

describe("two sets in one ring system", () => {
  it("are not counted by the one sentence, the centres open or given: homoadamantane drawn open and with its four bridgeheads marked every way", () => {
    expect(answer("C1CC2CC3CC1CC(C2)C3")).toBe(NOT_COUNTED_JOINED);
    for (let mask = 0; mask < 16; mask++) {
      let k = 0;
      const marked = "C1C[C?H]2C[C?H]3C[C?H]1C[C?H](C2)C3".replace(/\?/g, () => ((mask >> k++) & 1 ? "@@" : "@"));
      expect(answer(marked), marked).toBe(NOT_COUNTED_JOINED);
    }
  });
});
