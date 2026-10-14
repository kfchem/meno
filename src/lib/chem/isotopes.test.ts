import { describe, expect, it } from "vitest";
import { isotopeMass } from "./isotopes";

describe("an isotope's mass (NIST)", () => {
  it("is NIST's measured relative atomic mass, hydrogen's D and T among hydrogen's", () => {
    expect(isotopeMass("H", 1)).toBe(1.00782503223);
    expect(isotopeMass("H", 2)).toBe(2.01410177812);
    expect(isotopeMass("H", 3)).toBe(3.0160492779);
    expect(isotopeMass("C", 13)).toBe(13.00335483507);
    expect(isotopeMass("O", 18)).toBe(17.99915961286);
    expect(isotopeMass("Cl", 37)).toBe(36.965902602);
  });

  it("is none for a nuclide not known, or known only by estimate", () => {
    expect(isotopeMass("O", 99)).toBeUndefined();
    expect(isotopeMass("D", 2)).toBeUndefined();
    // (hydrogen-7, which NIST gives as estimated - "7.0527(11#)")
    expect(isotopeMass("H", 7)).toBeUndefined();
  });
});
