/**
 * Meno's one Boltzmann distribution (docs/WORKFLOWS-FOUNDATION.md, PR 1):
 * what the 3D view's shares and the *Populations* step both take, so that a
 * set's shares are the same wherever they are shown or worked out.
 */
import { GAS_CONSTANT_HARTREE } from "./units";

/**
 * Boltzmann populations at `kelvin`, from energies in hartrees: each weighed
 * by its degeneracy - the forms of it alike, each as likely - where one is
 * given for each; a list of another length is no degeneracies at all, never
 * read in part. The shares add up to one.
 */
export function boltzmann(energies: readonly number[], kelvin: number, degeneracies?: readonly number[]): number[] {
  if (!energies.length) return [];
  let lowest = energies[0];
  for (const e of energies) if (e < lowest) lowest = e;
  const counted = degeneracies?.length === energies.length ? degeneracies : undefined;
  const w = energies.map((e, i) => (counted ? counted[i] : 1) * Math.exp(-(e - lowest) / (GAS_CONSTANT_HARTREE * kelvin)));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / sum);
}
