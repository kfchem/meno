import { describe, expect, it } from "vitest";
import { boltzmann } from "./boltzmann";
import { convert, factor, GAS_CONSTANT_HARTREE, isUnit, ROOM_TEMPERATURE, sameDimension } from "./units";

describe("Meno's units table", () => {
  it("converts a hartree as CODATA 2018 gives it", () => {
    // (NIST, CODATA 2018: 1 Eh = 627.509474 kcal/mol = 2625.499639 kJ/mol = 27.211386246 eV = 219474.6313632 cm-1)
    expect(factor("Eh", "kcal/mol")).toBeCloseTo(627.5094740631, 7);
    expect(factor("Eh", "kJ/mol")).toBeCloseTo(2625.4996394799, 6);
    expect(factor("Eh", "eV")).toBeCloseTo(27.211386245988, 9);
    expect(factor("Eh", "cm-1")).toBeCloseTo(219474.6313632, 4);
    // (and the gas constant: R = 8.314462618 J/(mol K), as the hartree per mole)
    expect(GAS_CONSTANT_HARTREE * 2625499.6394799).toBeCloseTo(8.314462618, 8);
  });

  it("converts back and forth to where it began, every unit of a dimension with every other", () => {
    const energies = ["Eh", "kcal/mol", "kJ/mol", "eV", "cm-1"] as const;
    for (const a of energies) for (const b of energies) expect(convert(convert(1.2345, a, b), b, a)).toBeCloseTo(1.2345, 10);
    expect(convert(25, "°C", "K")).toBeCloseTo(298.15, 10);
    expect(convert(ROOM_TEMPERATURE, "K", "°C")).toBeCloseTo(25, 10);
    expect(convert(1, "bohr", "Å")).toBeCloseTo(0.529177210903, 12);
    expect(convert(0.15, "nm", "pm")).toBeCloseTo(150, 10);
  });

  it("never converts across dimensions, nor gives a temperature in degrees Celsius as a factor", () => {
    expect(sameDimension("Eh", "cm-1")).toBe(true);
    expect(sameDimension("Eh", "K")).toBe(false);
    expect(() => convert(1, "Eh", "K")).toThrow(/do not convert/);
    expect(() => factor("°C", "K")).toThrow();
    expect(isUnit("kcal/mol")).toBe(true);
    expect(isUnit("kcal")).toBe(false);
  });
});

describe("Meno's one Boltzmann distribution", () => {
  const kcal = (k: number) => convert(k, "kcal/mol", "Eh");

  it("gives two conformers 0.4527 kcal/mol apart at 298.15 K about 68 % and 32 %", () => {
    const [a, b] = boltzmann([0, kcal(0.4527)], 298.15);
    expect(a + b).toBeCloseTo(1, 12);
    expect(b).toBeCloseTo(0.318, 3);
  });

  it("weighs each by its degeneracy where one is given for each, and by none where the list is of another length", () => {
    const counted = boltzmann([0, kcal(0.4527)], 298.15, [1, 2]);
    // (the second counted twice: 0.682 against 2 x 0.318)
    expect(counted[0]).toBeCloseTo(0.518, 3);
    expect(boltzmann([0, kcal(0.4527)], 298.15, [2])).toEqual(boltzmann([0, kcal(0.4527)], 298.15));
  });

  it("is the same wherever it is asked, at any temperature, far from its lowest", () => {
    expect(boltzmann([], 298.15)).toEqual([]);
    expect(boltzmann([-1000, -1000], 298.15)).toEqual([0.5, 0.5]);
    const hot = boltzmann([0, kcal(1)], 1000);
    const cold = boltzmann([0, kcal(1)], 100);
    expect(hot[1]).toBeGreaterThan(cold[1]);
  });
});
