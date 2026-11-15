/**
 * The standard-state term (docs/WORKFLOWS-FOUNDATION.md, case F, step 42):
 * what a free energy worked out for a gas at 1 atm gains taken to a
 * solution at 1 mol/L, at temperature T -
 *
 *   ΔG° = R T ln(R T c° / p°)
 *
 * with R = 8.314462618 J/(mol K) (CODATA 2018, exact), p° = 101325 Pa
 * (1 atm) and c° = 1 mol/L = 1000 mol/m³: the free energy of compressing
 * one mole of an ideal gas from the volume it takes at 1 atm, R T / p°, to
 * 1 L. At 298.15 K it is 7.926 kJ/mol, 1.894 kcal/mol.
 */
import type { By } from "../entry";

/** The molar gas constant, J/(mol K): CODATA 2018, exact. */
export const R_GAS = 8.314462618;
/** One standard atmosphere, Pa. */
export const ATM_PA = 101325;
/** One mole per litre, in mol/m³. */
export const MOL_PER_L = 1000;
/** Joules in a thermochemical kilocalorie. */
const J_PER_KCAL = 4184;

/** The term at `kelvin`, in kcal/mol; none where the temperature is not one (not finite, or not above 0 K). */
export function standardStateTerm(kelvin: number): number | null {
  if (!Number.isFinite(kelvin) || kelvin <= 0) return null;
  const rt = R_GAS * kelvin;
  return (rt * Math.log((rt * MOL_PER_L) / ATM_PA)) / J_PER_KCAL;
}

/** What worked the term out, as a value's record says it: the formula and its constants, and the temperature. */
export function standardStateBy(kelvin: number): By {
  return { treatment: `standard state 1 atm to 1 mol/L at ${kelvin} K: R T ln(R T c°/p°), R = ${R_GAS} J/(mol K), p° = ${ATM_PA} Pa, c° = 1 mol/L` };
}
