/**
 * Identity's fill in the core (./units, part 13's move): the same answers as before it moved, and what part 13's next step (U2: end
 * chalcogens on P, As, Sb, S, Se, Te) is to change, pinned here as it stands today and marked KNOWN WRONG, so that the fix must change it.
 */
import { describe, expect, it } from "vitest";
import { smilesInput } from "../../../layout/smilesInput";
import { filledIn as filledInIdentity, identity } from "../../identity";
import { CHELATE_RING as fromChelateRing } from "../../chelateRing";
import { CHELATE_RING, filledIn } from "./units";

const id = (smiles: string) => identity(smilesInput(smiles) as unknown as Parameters<typeof identity>[0]).text;

describe("identity's fill, moved into the core", () => {
  it("is the one identity imports and the one the chelate ring's number comes from", () => {
    expect(filledInIdentity).toBe(filledIn);
    expect(fromChelateRing).toBe(CHELATE_RING);
  });

  it("fills what sets nothing as before: propan-2-ol written with its CH either way, and not, is one", () => {
    expect(new Set([id("C[C@H](O)C"), id("C[C@@H](O)C"), id("CC(O)C")]).size).toBe(1);
  });
});

describe("what U2 is to change: end chalcogens on P, As, Sb, S, Se, Te (KNOWN WRONG today)", () => {
  it("KNOWN WRONG: a phosphate diester anion's P is a centre - written both ways, two identities (U2: no centre, one identity)", () => {
    expect(id("CCO[P@](=O)([O-])OC")).not.toBe(id("CCO[P@@](=O)([O-])OC"));
  });

  it("KNOWN WRONG: a phosphinic acid's P, its O-H against its =O, is a centre: written both ways, two identities (U2: none, one)", () => {
    expect(id("C[P@](=O)(O)c1ccccc1")).not.toBe(id("C[P@@](=O)(O)c1ccccc1"));
  });

  it("as today, to be told to the chemistry check before U2 changes it: a phosphine oxide drawn P=O and drawn P+-O-", () => {
    const double = id("CP(=O)(C)C");
    const charged = id("C[P+]([O-])(C)C");
    expect(double === charged ? "one identity" : "two identities").toBe("two identities");
  });
});
