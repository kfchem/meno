import { describe, expect, it } from "vitest";
import { canTakeBond, chargeText, implicitHydrogens, mostBonds } from "./molecule";

describe("implicitHydrogens", () => {
  it("moves the valence with the charge the way the electrons go", () => {
    expect(implicitHydrogens("N", 0, 1)).toBe(4); // NH4+
    expect(implicitHydrogens("N", 4, 1)).toBe(0); // a quaternary ammonium
    expect(implicitHydrogens("N", 3, 1)).toBe(1); // a protonated amine
    expect(implicitHydrogens("O", 1, -1)).toBe(0); // an alkoxide, a carboxylate's O
    expect(implicitHydrogens("O", 1, 1)).toBe(2); // R-OH2+
    expect(implicitHydrogens("N", 1, -1)).toBe(1); // RNH-
    expect(implicitHydrogens("C", 3, 1)).toBe(0); // a carbocation
    expect(implicitHydrogens("C", 2, 1)).toBe(1);
    expect(implicitHydrogens("C", 3, -1)).toBe(0); // a carbanion
    expect(implicitHydrogens("B", 0, -1)).toBe(4); // BH4-
    expect(implicitHydrogens("Cl", 0, -1)).toBe(0); // chloride
  });

  it("gives an unpaired electron a bond's place, and a carbene's pair two", () => {
    expect(implicitHydrogens("C", 3, 0, "doublet")).toBe(0); // a tertiary radical
    expect(implicitHydrogens("C", 1, 0, "doublet")).toBe(2); // CH2•
    expect(implicitHydrogens("C", 2, 0, "singlet")).toBe(0);
    expect(implicitHydrogens("C", 0, 0, "triplet")).toBe(2); // CH2:
  });

  it("gives none to what it has no valence for", () => {
    expect(implicitHydrogens("Fe", 0, 2)).toBe(0);
    expect(implicitHydrogens("Na", 0, 1)).toBe(0);
    expect(implicitHydrogens("R", 1)).toBe(0);
  });
});

describe("chargeText", () => {
  it("writes a charge as a formula does, with a minus sign", () => {
    expect(chargeText(1)).toBe("+");
    expect(chargeText(-1)).toBe("−");
    expect(chargeText(2)).toBe("2+");
    expect(chargeText(-3)).toBe("3−");
    expect(chargeText(0)).toBe("");
  });
});

describe("canTakeBond", () => {
  it("is where the valence is not yet met, as charge and unpaired electron leave it", () => {
    expect(canTakeBond("C", 3)).toBe(true);
    expect(canTakeBond("C", 4)).toBe(false);
    expect(canTakeBond("O", 2)).toBe(false);
    expect(canTakeBond("O", 2, 1)).toBe(true);
    expect(canTakeBond("O", 1, -1)).toBe(false);
    expect(canTakeBond("N", 3)).toBe(false);
    expect(canTakeBond("H", 0)).toBe(true);
    expect(canTakeBond("H", 1)).toBe(false);
    expect(canTakeBond("Pd", 4)).toBe(true);
  });
});

describe("mostBonds", () => {
  it("is an element's valence, a heavier one's highest, as its charge and an unpaired electron leave it; none for a metal", () => {
    expect([mostBonds("C"), mostBonds("O"), mostBonds("N", 1), mostBonds("O", -1), mostBonds("B", -1)]).toEqual([4, 2, 4, 1, 4]);
    expect([mostBonds("S"), mostBonds("P"), mostBonds("I"), mostBonds("Si")]).toEqual([6, 5, 7, 4]);
    expect([mostBonds("C", 0, "doublet"), mostBonds("C", 0, "singlet"), mostBonds("C", 1)]).toEqual([3, 2, 3]);
    expect(mostBonds("Pd")).toBeNull();
  });
});
