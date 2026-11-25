/**
 * Whether any open place decides the compound (lib/chem/isomers `decidesAny`), against hand-derived answers, and how few identities it
 * writes to tell: every identity written is counted through the identity module.
 */
import { describe, expect, it, vi } from "vitest";
import { smilesInput } from "../layout/smilesInput";
import type { IdentityInput } from "./identity";

let written = 0;
vi.mock("./identity", async (original) => {
  const real = await original<typeof import("./identity")>();
  return { ...real, identity: (g: IdentityInput) => (written++, real.identity(g)) };
});
const { decidesAny, isomersOf } = await import("./isomers");

const input = (smiles: string) => smilesInput(smiles) as unknown as IdentityInput;

describe("whether any open place decides the compound", () => {
  // (one stereoisomer: the substituted carbon's two paths round the ring, or its two ethyls, are alike)
  it.each(["CC1CCCCC1", "CC1CCCCCCCCCCC1", "CC1(C)CCCCC1", "CCC(C)(O)CC"])("no for %s", (smiles) => {
    expect(decidesAny(input(smiles))).toBe(false);
  });
  // (more than one stereoisomer: a centre with four unlike groups, like or unlike pairs, cis or trans on a ring, an allene's axis)
  it.each([
    "CC(O)CC",
    "FC(Cl)Br",
    "CC(O)C(O)C",
    "OC(=O)C(O)C(O)C(=O)O",
    "CC(O)CC(O)C",
    "CC(Br)C(Br)CC",
    "CC(O)C(O)C(O)C",
    "CC1CCC(C)CC1",
    "CC1CCC(O)CC1",
    "CC1CCCCC1C",
    "CC1CCCC(C)C1",
    "CC1CC1C",
    "CC1C(C)C(C)C1C",
    "OC1C(O)C(O)C(O)C(O)C1O",
    "C[C@H](O)C(O)C",
    "C[C@H]1CCC(C)CC1",
    "CC(O)C1CCCCC1",
    "CC(C)C(O)CC",
    "CC1CCC(=CC(=O)O)CC1",
    "CC=C=CC",
  ])("yes for %s", (smiles) => {
    expect(decidesAny(input(smiles))).toBe(true);
  });
  it("no where nothing is open: butan-2-ol drawn with its wedge", () => {
    expect(decidesAny(input("C[C@H](O)CC"))).toBe(false);
  });

  it("tells a chain of ten open centres from two identities, where the whole count writes all 1024 ways", () => {
    // (dodecane-2,3,4,5,6,7,8,9,10,11-decol: ten carbinol centres in a row, C2 to C11; turning C2 alone gives another compound)
    const chain = "CC(O)C(O)C(O)C(O)C(O)C(O)C(O)C(O)C(O)C(O)C";
    written = 0;
    expect(decidesAny(input(chain))).toBe(true);
    expect(written).toBe(2);
    written = 0;
    isomersOf(input(chain));
    expect(written).toBe(1024);
  });
});
