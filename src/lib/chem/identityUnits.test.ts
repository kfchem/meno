/**
 * Which configurations given set something (lib/chem/identity `unitsOf`, foundation part 13): turned over, another identity.
 * What the CIP labels by (a label only on a unit).
 */
import { describe, expect, it } from "vitest";
import { smilesInput } from "../layout/smilesInput";
import { cipInput } from "./cip/testdata/cipFrom";
import { unitsOf, type IdentityInput } from "./identity";

const input = (smiles: string) => smilesInput(smiles) as unknown as IdentityInput;

describe("which configurations given set something", () => {
  it("a centre of four unlike groups does; a wedge at an isopropyl's CH does not", () => {
    // (3-methylbutan-2-ol, its C3 wedged: C0 C1 C2 C3 O4 C5)
    const unit = unitsOf(input("C[C@H](C)[C@@H](O)C"));
    expect(unit({ kind: "centre", at: 3 })).toBe(true);
    expect(unit({ kind: "centre", at: 1 })).toBe(false);
  });

  it("a meso form's centre turned alone makes a hand: it sets something", () => {
    const unit = unitsOf(input("C[C@@H](O)[C@@H](O)C"));
    expect(unit({ kind: "centre", at: 1 })).toBe(true);
    expect(unit({ kind: "centre", at: 3 })).toBe(true);
  });

  it("a double bond's cis or trans does where each end has two unlike groups; a CH=C(CH3)2's does not", () => {
    const but = input("C/C=C/C");
    const k = but.bonds.findIndex((b) => b.stereo);
    expect(unitsOf(but)({ kind: "bond", at: k })).toBe(true);
    const prenyl = input("OC/C=C(/C)C");
    const j = prenyl.bonds.findIndex((b) => b.stereo);
    expect(unitsOf(prenyl)({ kind: "bond", at: j })).toBe(false);
  });

  it("where nothing is given there, nothing is set", () => {
    const g = input("CC(O)CC");
    expect(unitsOf(g)({ kind: "centre", at: 1 })).toBe(false);
    expect(unitsOf(g)({ kind: "bond", at: 0 })).toBe(false);
    expect(unitsOf(g)({ kind: "axis", at: 0 })).toBe(false);
    expect(unitsOf(g)({ kind: "cumulated", at: 0 })).toBe(false);
  });

  it("an allene's axis and a butatriene's cis or trans set something", () => {
    const allene = cipInput("CC=[C@]=CC");
    const cumulene = cipInput("C/C=C=C=C/C");
    expect(allene.axes).toHaveLength(1);
    expect(cumulene.cumulated).toHaveLength(1);
    expect(unitsOf(allene)({ kind: "axis", at: 0 })).toBe(true);
    expect(unitsOf(cumulene)({ kind: "cumulated", at: 0 })).toBe(true);
  });
});
