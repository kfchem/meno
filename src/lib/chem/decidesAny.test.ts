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
const { decidesAny, decidingOf, decidingWaited, isomersOf } = await import("./isomers");

const input = (smiles: string) => smilesInput(smiles) as unknown as IdentityInput;

describe("whether any open place decides the compound", () => {
  // (one stereoisomer: the substituted carbon's two paths round the ring, or its two ethyls, are alike)
  it.each(["CC1CCCCC1", "CC1CCCCCCCCCCC1", "CC1(C)CCCCC1", "CCC(C)(O)CC"])("no for %s", (smiles) => {
    expect(decidesAny(input(smiles))).toBe(false);
  });
  // (more than one stereoisomer: a centre with four unlike groups, like or unlike pairs, cis or trans on a ring, an allene's axis)
  const asking = [
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
  ];
  it.each(asking)("yes for %s", (smiles) => {
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

  // (every drawing above, and the ten centres: the places found by witnesses are those the whole count finds, always)
  it.each(["CC1CCCCC1", "CC1CCCCCCCCCCC1", "CC1(C)CCCCC1", "CCC(C)(O)CC", "C[C@H](O)CC", ...asking, "CC(O)C(O)C(O)C(O)C(O)C(O)C(O)C(O)C(O)C(O)C"])(
    "finds the same deciding places as the whole count for %s",
    (smiles) => {
      const whole = isomersOf(input(smiles));
      if (!("deciding" in whole)) throw new Error("not counted");
      expect(decidingOf(input(smiles))).toEqual(whole.deciding);
    },
  );

  it("finds every place of ten open centres in a row from 11 identities: the first way and each turned alone", () => {
    written = 0;
    const found = decidingOf(input("CC(O)C(O)C(O)C(O)C(O)C(O)C(O)C(O)C(O)C(O)C"));
    expect(found?.atoms).toHaveLength(10);
    expect(written).toBe(11);
  });

  it("tells a place that never decides among real centres, going on through the ways for it alone", async () => {
    // (3,3-diethylpentane-2,4-diol: C2 and C4 alike, R,R / S,S and meso - 3 stereoisomers; C3 holds two ethyls, never a centre)
    const smiles = "CC(O)C(CC)(CC)C(O)C";
    const whole = isomersOf(input(smiles));
    if (!("deciding" in whole)) throw new Error("not counted");
    expect(whole.isomers).toHaveLength(3);
    expect(whole.deciding.atoms).toEqual([1, 8]);
    written = 0;
    expect(decidingOf(input(smiles))).toEqual(whole.deciding);
    // (three open places, all eight ways written for C3, which has no witness)
    expect(written).toBe(8);
    let pauses = 0;
    expect(await decidingWaited(input(smiles), async () => void pauses++)).toEqual(whole.deciding);
    expect(pauses).toBe(0);
  });

  it("gives the caller's thread back after every 32 identities while it goes through the ways", async () => {
    // (4,4-diethylheptane-2,3,5,6-tetrol: five open places, C4 holding two ethyls never a centre; the four others, the two ends alike,
    //  (2^4 + 2^2) / 2 = 10 stereoisomers; C4 without a witness after all 32 ways)
    const smiles = "CC(O)C(O)C(CC)(CC)C(O)C(O)C";
    const whole = isomersOf(input(smiles));
    if (!("deciding" in whole)) throw new Error("not counted");
    expect(whole.isomers).toHaveLength(10);
    expect(whole.deciding.atoms).toEqual([1, 3, 10, 12]);
    let pauses = 0;
    written = 0;
    expect(await decidingWaited(input(smiles), async () => void pauses++)).toEqual(whole.deciding);
    expect(written).toBe(32);
    expect(pauses).toBe(1);
  });
});
