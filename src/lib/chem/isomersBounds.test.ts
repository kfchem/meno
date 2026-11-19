// Held beside isomers.test.ts: a bridge of four atoms is no cage (its bridgeheads are counted, in,in-or-out,out against in,out), and the most ways written is inclusive.
import { describe, expect, it } from "vitest";
import { smilesInput } from "../layout/smilesInput";
import type { IdentityInput } from "./identity";
import { isomersOf } from "./isomers";

const input = (smiles: string) => smilesInput(smiles) as unknown as IdentityInput;
const counted = (smiles: string) => {
  const r = isomersOf(input(smiles));
  if (!("isomers" in r)) throw new Error(`not counted: ${JSON.stringify(r)}`);
  return r.isomers.length;
};

describe("isomersOf: where a cage ends and where the count stops", () => {
  it.each([
    ["bicyclo[4.4.1]undecane: bridges of four atoms are no cage", "C12CCCCC(CCCC1)C2", 2],
    ["its 1-methyl and 1-hydroxy forms", "CC12CCCCC(CCCC1)C2", 2],
    ["bicyclo[4.1.1]octane: one bridge of four atoms", "C1CCC2CC(C1)C2", 2],
    ["bicyclo[4.4.1]undecane written another way", "C1CCC2CCCCC(C1)C2", 2],
  ])("%s: %s counts %i", (_what, smiles, want) => {
    expect(counted(smiles)).toBe(want);
  });

  it("writes as many ways as it is allowed: butan-2-ol's two with a most of two, none with a most of one", () => {
    const r = isomersOf(input("CC(O)CC"), 2);
    expect("isomers" in r && r.isomers.length).toBe(2);
    expect(isomersOf(input("CC(O)CC"), 1)).toEqual({ tooMany: 2 });
  });
});
