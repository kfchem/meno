/**
 * Meno's units table (docs/WORKFLOWS-FOUNDATION.md, *Values and their
 * types*): every unit a number Meno keeps may carry, its dimension, and how
 * it converts to the others of that dimension. A number is converted only
 * where it is read, and only within a dimension; across dimensions, never.
 *
 * The constants are CODATA 2018's (NIST, "Fundamental Physical Constants",
 * 2018 values), with the SI's exact defining constants of 2019 - the
 * Avogadro and Boltzmann constants, the elementary charge - and the
 * thermochemical calorie, 4.184 J exactly. Each conversion is worked out
 * from them here, so that every unit agrees with every other.
 */

/** The hartree, in joules (CODATA 2018). */
export const HARTREE_J = 4.3597447222071e-18;
/** The Avogadro constant, per mole (exact, SI 2019). */
export const AVOGADRO = 6.02214076e23;
/** The Boltzmann constant, in joules per kelvin (exact, SI 2019). */
export const BOLTZMANN_J = 1.380649e-23;
/** The electronvolt, in joules (exact, SI 2019). */
export const ELECTRONVOLT_J = 1.602176634e-19;
/** The thermochemical calorie, in joules (exact). */
export const CALORIE_J = 4.184;
/** The hartree as a wavenumber, in reciprocal centimetres (CODATA 2018: the hartree-inverse metre relationship, 2.1947463136320e7 m⁻¹). */
export const HARTREE_PER_CM = 219474.6313632;
/** The Bohr radius, in ångströms (CODATA 2018). */
export const BOHR_ANGSTROM = 0.529177210903;

/** The gas constant in hartrees per kelvin: the Boltzmann constant over the hartree. */
export const GAS_CONSTANT_HARTREE = BOLTZMANN_J / HARTREE_J;
/** Room temperature, as a standard state has it (K). */
export const ROOM_TEMPERATURE = 298.15;

/** What a unit measures. A number converts only to a unit of its own dimension. */
export type Dimension = "energy" | "temperature" | "length" | "angle" | "molar mass" | "area";

/**
 * The units Meno knows. Energies per molecule (Eh, eV, cm⁻¹) and per mole
 * (kcal/mol, kJ/mol) are one dimension, as chemists use them: a mole's
 * worth of a molecule's energy.
 */
export type Unit = "Eh" | "kcal/mol" | "kJ/mol" | "eV" | "cm-1" | "K" | "°C" | "Å" | "bohr" | "nm" | "pm" | "°" | "g/mol" | "Å2";

type UnitInfo = {
  dimension: Dimension;
  /** How many of the dimension's base unit one of it is (Eh, K, Å). */
  scale: number;
  /** Added after scaling to reach the base unit (°C to K). */
  offset?: number;
  /** As it is written for a chemist. */
  label: string;
};

export const UNITS: Readonly<Record<Unit, UnitInfo>> = {
  Eh: { dimension: "energy", scale: 1, label: "Eh" },
  "kcal/mol": { dimension: "energy", scale: (CALORIE_J * 1000) / (HARTREE_J * AVOGADRO), label: "kcal/mol" },
  "kJ/mol": { dimension: "energy", scale: 1000 / (HARTREE_J * AVOGADRO), label: "kJ/mol" },
  eV: { dimension: "energy", scale: ELECTRONVOLT_J / HARTREE_J, label: "eV" },
  "cm-1": { dimension: "energy", scale: 1 / HARTREE_PER_CM, label: "cm⁻¹" },
  K: { dimension: "temperature", scale: 1, label: "K" },
  "°C": { dimension: "temperature", scale: 1, offset: 273.15, label: "°C" },
  "Å": { dimension: "length", scale: 1, label: "Å" },
  bohr: { dimension: "length", scale: BOHR_ANGSTROM, label: "bohr" },
  nm: { dimension: "length", scale: 10, label: "nm" },
  pm: { dimension: "length", scale: 0.01, label: "pm" },
  "°": { dimension: "angle", scale: 1, label: "°" },
  // (a molecule's mass per mole, and a surface's area: a descriptor's - molecular weight, polar surface area)
  "g/mol": { dimension: "molar mass", scale: 1, label: "g/mol" },
  "Å2": { dimension: "area", scale: 1, label: "Å²" },
};

/** Whether a text names one of Meno's units. */
export function isUnit(u: string): u is Unit {
  return Object.prototype.hasOwnProperty.call(UNITS, u);
}

/** Whether two units measure the same thing, and so convert. */
export function sameDimension(a: Unit, b: Unit): boolean {
  return UNITS[a].dimension === UNITS[b].dimension;
}

/** A number in `from` as one in `to`, of the same dimension; across dimensions, an error, never a guess. */
export function convert(value: number, from: Unit, to: Unit): number {
  if (from === to) return value;
  const f = UNITS[from];
  const t = UNITS[to];
  if (f.dimension !== t.dimension) throw new Error(`${f.label} is ${f.dimension} and ${t.label} is ${t.dimension}: they do not convert`);
  const base = value * f.scale + (f.offset ?? 0);
  return (base - (t.offset ?? 0)) / t.scale;
}

/** How many of `to` one `from` is - a factor, for units with no offset (energies, lengths). */
export function factor(from: Unit, to: Unit): number {
  if (UNITS[from].offset || UNITS[to].offset) throw new Error(`${UNITS[from].label} to ${UNITS[to].label} is no factor`);
  return convert(1, from, to);
}
