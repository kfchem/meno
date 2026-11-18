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

describe("a secondary phosphine's P: a centre with its H among its three, as without one (the maintainer's ruling, 2026-11-06)", () => {
  type Input = Parameters<typeof identity>[0];
  /** Methyl(R)phosphine with its H carried, not an atom (as a drawing of two bonds has it): P's neighbours C1, then R, its H last. */
  const carried = (r: "methyl" | "ethyl", volume?: 1 | -1): Input => ({
    atoms: [
      { el: "C", hs: 3 },
      { el: "P", hs: 1, ...(volume ? { tetra: { neighbours: [0, 2, -1], volume } } : {}) },
      { el: "C", hs: r === "methyl" ? 3 : 2 },
      ...(r === "ethyl" ? [{ el: "C", hs: 3 }] : []),
    ],
    bonds: [
      { a: 0, b: 1, order: 1 },
      { a: 1, b: 2, order: 1 },
      ...(r === "ethyl" ? [{ a: 2, b: 3, order: 1 }] : []),
    ],
  }) as unknown as Input;
  const text = (g: Input) => identity(g).text;

  it("its H carried: its two hands two identities, neither the one with none given; two alike groups on it, it sets nothing", () => {
    expect(new Set([text(carried("ethyl", 1)), text(carried("ethyl", -1)), text(carried("ethyl"))]).size).toBe(3);
    expect(new Set([text(carried("methyl", 1)), text(carried("methyl", -1)), text(carried("methyl"))]).size).toBe(1);
  });

  it("its H drawn as an atom: its hands two, each one of the carried ones; two alike groups, one with none given", () => {
    const drawn = [id("C[P@]([H])CC"), id("C[P@@]([H])CC")];
    expect(new Set(drawn).size).toBe(2);
    expect(new Set([...drawn, text(carried("ethyl", 1)), text(carried("ethyl", -1))]).size).toBe(2);
    expect(id("C[P@]([H])C")).toBe(id("CPC"));
    expect(id("C[P@@]([H])C")).toBe(id("CPC"));
  });
});
