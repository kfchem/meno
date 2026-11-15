import { describe, expect, it } from "vitest";
import { standardStateBy, standardStateTerm } from "./standardState";

describe("the standard-state term, 1 atm to 1 mol/L", () => {
  it("is R T ln(R T c°/p°): 1.894 kcal/mol at 298.15 K, by hand", () => {
    // (R T = 8.314462618 × 298.15 = 2478.957 J/mol; R T c°/p° = 2478.957 × 1000 / 101325 = 24.4654;
    //  ln 24.4654 = 3.19726; 2478.957 × 3.19726 = 7925.9 J/mol = 1.89434 kcal/mol)
    expect(standardStateTerm(298.15)).toBeCloseTo(1.89434, 4);
    // (and it grows with T: at 373.15 K, R T = 3102.53 J/mol, ln 30.6196 = 3.42162 - 2.5372 kcal/mol)
    expect(standardStateTerm(373.15)).toBeCloseTo(2.5372, 3);
  });

  it("is none at a temperature that is not one", () => {
    expect([standardStateTerm(0), standardStateTerm(-10), standardStateTerm(Number.NaN)]).toEqual([null, null, null]);
  });

  it("says what worked it out: the formula, its constants and the temperature", () => {
    expect(standardStateBy(298.15).treatment).toBe("standard state 1 atm to 1 mol/L at 298.15 K: R T ln(R T c°/p°), R = 8.314462618 J/(mol K), p° = 101325 Pa, c° = 1 mol/L");
  });
});
