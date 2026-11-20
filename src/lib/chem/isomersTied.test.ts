/**
 * Beside isomers.test.ts (its `count` style): what it leaves unheld of the ties - real cages given as they are, and turned at one
 * bridgehead (the in,out way round, no count, said); a small fused bicycle given cis and given trans; a tied cage's count by every
 * way of writing its atoms. The cages are real molecules - the structures `configuration/corpus` and `flatEpibatidine.test` hold -
 * and the bicycle's cis is worked out from its SMILES (both hydrogens on one face).
 */
import { describe, expect, it } from "vitest";
import { smilesInput } from "../layout/smilesInput";
import type { IdentityInput } from "./identity";
import { isomersOf, NOT_COUNTED_TIED } from "./isomers";

const answer = (smiles: string): number | string => {
  const r = isomersOf(smilesInput(smiles) as unknown as IdentityInput);
  if ("tooMany" in r) return `tooMany ${r.tooMany}`;
  if ("notCounted" in r) return r.notCounted;
  return r.isomers.length;
};
/** `smiles` with its `k`th chirality mark turned over. */
const turned = (smiles: string, k: number) => {
  let i = -1;
  return smiles.replace(/@@?/g, (m) => (++i === k ? (m === "@" ? "@@" : "@") : m));
};

describe("a cage given as it is, a bridgehead turned, and a small fused bicycle given cis and trans", () => {
  it.each([
    ["(1R,4R)-camphor", "CC1(C)[C@@H]2CC[C@@]1(C)C(=O)C2", [0, 1]],
    ["(1S,4S)-camphor", "CC1(C)[C@H]2CC[C@]1(C)C(=O)C2", [0, 1]],
    ["endo-norborneol", "O[C@@H]1C[C@@H]2CC[C@H]1C2", [1, 2]],
    ["cocaine", "COC(=O)[C@H]1[C@@H](OC(=O)c2ccccc2)C[C@@H]2CC[C@H]1N2C", [2, 3]],
    ["morphine", "CN1CC[C@]23c4c5ccc(O)c4O[C@H]2[C@@H](O)C=C[C@H]3[C@H]1C5", [0, 1, 2, 3, 4]],
  ])("%s is counted as given (one), and turned at either bridgehead it is the in,out way round: no count, said", (_name, smiles, marks) => {
    expect(answer(smiles)).toBe(1);
    // (the marks given are all of the structure's centres to turn, one at a time: those that are not a bridgehead - norborneol's carbinol, cocaine's esters - leave a real structure)
    expect(marks.filter((k) => answer(turned(smiles, k)) === NOT_COUNTED_TIED).length).toBeGreaterThanOrEqual(2);
  });

  it("bicyclo[3.1.0]hexane: its two hydrogens on one face (cis), counted; on opposite faces (trans), the impossible way round", () => {
    expect(answer("C1C[C@@H]2C[C@@H]2C1")).toBe(1);
    expect(answer("C1C[C@H]2C[C@H]2C1")).toBe(1);
    expect(answer("C1C[C@H]2C[C@@H]2C1")).toBe(NOT_COUNTED_TIED);
    expect(answer("C1C[C@@H]2C[C@H]2C1")).toBe(NOT_COUNTED_TIED);
  });

  it("a larger fused bicycle given trans is a structure: bicyclo[4.4.0] (decalin) trans and cis both counted", () => {
    expect(answer("C1CC[C@H]2CCCC[C@@H]2C1")).toBe(1);
    expect(answer("C1CC[C@H]2CCCC[C@H]2C1")).toBe(1);
  });
});
