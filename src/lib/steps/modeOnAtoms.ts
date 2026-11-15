/**
 * *Mode on atoms* (docs/WORKFLOWS-FOUNDATION.md, *Meno's own nodes*,
 * Structures): what a saddle point's imaginary vibration does to the atoms
 * a reaction changes - written on the entry, for the chemist to filter on.
 * Meno never judges here what is a saddle point: every entry is kept.
 *
 * - **The vibration**: the one of lowest frequency, an imaginary one
 *   (`imaginaryVibration`: of several, the most negative, said).
 * - **Ranks**: every atom ranked by how far the vibration moves it - the
 *   length of its Cartesian displacement, as the program gives it, not
 *   mass-weighted - the one moving most first; atoms moving alike in the
 *   order of their numbers.
 * - **The window**: with N atoms listed (the reacting atoms: those of the
 *   bonds a reaction forms or breaks), the first N + `reach` ranks.
 * - **Outside**: the listed atoms ranked outside the window - their count,
 *   and which they are. A saddle point whose vibration moves its reacting
 *   atoms most has none; the chemist chooses how many to allow (a Filter
 *   on `mode.outside`).
 */
import type { Entry, Property } from "../entry";
import { imaginaryVibration, vibrationsOf } from "./vibrations";

/** The properties *Mode on atoms* writes, by names of Meno's own. */
export const MODE_WINDOW = "mode.window";
export const MODE_RANKS = "mode.ranks";
export const MODE_OUTSIDE = "mode.outside";
export const MODE_NAMES = [MODE_WINDOW, MODE_RANKS, MODE_OUTSIDE] as const;

/** Each atom's rank (from 1) by how far `mode` moves it, the one moving most first; alike, by its number. */
export function modeRanks(mode: readonly number[]): number[] {
  const n = mode.length / 3;
  const length = (i: number) => Math.hypot(mode[3 * i], mode[3 * i + 1], mode[3 * i + 2]);
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => length(b) - length(a) || a - b);
  const ranks = new Array<number>(n);
  order.forEach((atom, k) => (ranks[atom] = k + 1));
  return ranks;
}

/**
 * The listed atoms (from 0) in `mode`: each one's rank, the window (their
 * count and `reach` more ranks) and those outside it. Why not, where an
 * atom listed is not the vibration's, none is listed, or the reach is no
 * whole number from 0.
 */
export function modeOnAtoms(
  mode: readonly number[],
  atoms: readonly number[],
  reach: number,
): { window: number; ranks: { atom: number; rank: number }[]; outside: number[] } | { failed: string } {
  const n = mode.length / 3;
  const listed = [...new Set(atoms)].sort((a, b) => a - b);
  if (!listed.length) return { failed: "No atoms are listed." };
  const wrong = listed.find((a) => !Number.isInteger(a) || a < 0 || a >= n);
  if (wrong !== undefined) return { failed: `The vibration has no atom ${wrong + 1}: its atoms are 1 to ${n}.` };
  if (!Number.isInteger(reach) || reach < 0) return { failed: `The reach, ${reach}, is no whole number from 0.` };
  const all = modeRanks(mode);
  const window = listed.length + reach;
  const ranks = listed.map((atom) => ({ atom, rank: all[atom] }));
  return { window, ranks, outside: ranks.filter((r) => r.rank > window).map((r) => r.atom) };
}

/**
 * *Mode on atoms* on an entry: its lowest vibration's ranks of the listed
 * atoms (from 0), written on it - `mode.window`, `mode.ranks` (each atom by
 * its element and number from 1, with its rank: "C1 1, C5 2") and
 * `mode.outside`, the count outside the window - each naming the vibration
 * it is of. Where it cannot be worked out - no vibrations, no imaginary
 * one, an atom it has not - each is written failed, with why: the entry is
 * kept all the same, never set aside here.
 */
export function modeOnAtomsEntry(e: Entry, atoms: readonly number[], reach: number): { entry: Entry; said?: string; outside?: number[] } {
  const failed = (why: string) => ({
    entry: { ...e, properties: { ...e.properties, ...Object.fromEntries(MODE_NAMES.map((k) => [k, { value: "", unit: "none" as const, status: { failed: why } }])) } },
  });
  const v = vibrationsOf(e);
  if ("failed" in v) return failed(v.failed);
  const i = imaginaryVibration(v.frequencies);
  if ("failed" in i) return failed(i.failed);
  const r = modeOnAtoms(v.modes[i.index], atoms, reach);
  if ("failed" in r) return failed(r.failed);
  const at = e.properties.modes?.at;
  const by: Property["by"] = { step: "Mode on atoms", method: `vibration ${i.index + 1}, ${v.frequencies[i.index]} cm⁻¹` };
  const name = (a: number) => `${e.structure.atoms[a].el}${a + 1}`;
  const property = (value: number | string): Property => ({ value, unit: "none", ...(at ? { at } : {}), by, status: "computed" });
  return {
    entry: {
      ...e,
      properties: {
        ...e.properties,
        [MODE_WINDOW]: property(r.window),
        [MODE_RANKS]: property(r.ranks.map((x) => `${name(x.atom)} ${x.rank}`).join(", ")),
        [MODE_OUTSIDE]: property(r.outside.length),
      },
    },
    ...(i.said ? { said: i.said } : {}),
    outside: r.outside,
  };
}
