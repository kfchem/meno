/**
 * What a structure leaves open (chem/openStereo `openStereo`: a paste's note, a step's open places, the circles) is found by witnesses,
 * never by the whole count: every identity written is counted through the identity module.
 */
import { expect, it, vi } from "vitest";
import type { IdentityInput } from "../../../../lib/chem/identity";
import type { ChemClient } from "../../../../lib/roles/client";

let written = 0;
vi.mock("../../../../lib/chem/identity", async (original) => {
  const real = await original<typeof import("../../../../lib/chem/identity")>();
  return { ...real, identity: (g: IdentityInput) => (written++, real.identity(g)) };
});
const { openStereo } = await import("./openStereo");
const { blockOf } = await import("./make3d");
const { drawnFromSmiles } = await import("./testdata/identityCases");

it("finds the ten open centres of dodecane-2,3,4,5,6,7,8,9,10,11-decol from 11 identities, not the 1024 of the whole count", async () => {
  const block = blockOf(drawnFromSmiles("CC(O)C(O)C(O)C(O)C(O)C(O)C(O)C(O)C(O)C(O)C") as never);
  written = 0;
  const open = await openStereo({} as ChemClient, [block.molblock]);
  expect(open.left.atoms).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19]);
  expect(written).toBe(11);
});
