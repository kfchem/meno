import { describe, expect, it } from "vitest";
import { openDoubleBonds } from "./drawn";
import { smilesInput } from "./smilesInput";

const open = (smiles: string) => openDoubleBonds(smilesInput(smiles));

describe("an odd run's end of two alike groups leaves it as it is, at either end of it", () => {
  // (CC=C=C=C(C)C, the alike end the run's higher-numbered, is in openDoubles.test.ts; here it is the lower, and both)
  for (const s of ["CC(C)=C=C=CC", "CC(C)=C=C=C(C)C", "CC(C)=C=C=C=C=CC", "C(C)(C)=C=C=CC"]) {
    it(s, () => {
      expect(open(s)).toEqual({ straight: [], either: [] });
    });
  }
  it("and the same run with unlike groups at that end is opened (the test above is not vacuous)", () => {
    const o = open("CCC(C)=C=C=CC");
    expect(o.straight.length + o.either.length).toBeGreaterThan(0);
  });
});
