import { describe, expect, it } from "vitest";
import * as core from "./perception/hydrogens";
import { canTakeBond, chargeText, implicitHydrogens, mostBonds, valenceOrder, valencesAt } from "./molecule";

describe("chargeText", () => {
  it("writes a charge as a formula does, with a minus sign", () => {
    expect(chargeText(1)).toBe("+");
    expect(chargeText(-1)).toBe("−");
    expect(chargeText(2)).toBe("2+");
    expect(chargeText(-3)).toBe("3−");
    expect(chargeText(0)).toBe("");
  });
});

describe("hydrogens and valence, under molecule's names", () => {
  it("are the core's own (perception/hydrogens): one count, re-exported", () => {
    const ours = [implicitHydrogens, valencesAt, mostBonds, canTakeBond, valenceOrder];
    const cores = [core.implicitHydrogens, core.valencesAt, core.mostBonds, core.canTakeBond, core.valenceOrder];
    ours.forEach((f, i) => expect(f).toBe(cores[i]));
  });
});
