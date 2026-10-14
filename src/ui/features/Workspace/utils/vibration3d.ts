/**
 * A molecule in 3D moving in one of its vibrations, as a calculation gave
 * them (lib/calc): how far each atom is from rest at a moment of it -
 * pure, over the molecule's own places. (Its frequency is written as
 * every wavenumber is, lib/calc/results `valueText`.)
 */
import { WORLD_PER_ANGSTROM } from "./molecule3d";

/** How far the atom that moves most goes from rest, in ångströms: enough to see the motion, too little to distort the molecule. */
export const VIBRATION_PEAK = 0.3;
/** One period of the motion on the screen, in seconds, whatever the vibration's own frequency. */
export const VIBRATION_PERIOD = 1.2;

/**
 * Each atom's offset from rest (world units, x, y, z of each) in a
 * vibration whose displacements are `d` (any length, x, y, z of each atom):
 * scaled so that the atom that moves most goes `VIBRATION_PEAK` at `swing`
 * 1 - `swing` running from -1 to 1 through the period, and to 0 as the
 * motion is eased out.
 */
export function vibrationOffsets(d: ArrayLike<number>, swing: number, out: Float32Array = new Float32Array(d.length)): Float32Array {
  let most = 0;
  for (let i = 0; i + 2 < d.length; i += 3) most = Math.max(most, Math.hypot(d[i], d[i + 1], d[i + 2]));
  const k = most > 0 ? (swing * VIBRATION_PEAK * WORLD_PER_ANGSTROM) / most : 0;
  for (let i = 0; i < d.length; i++) out[i] = d[i] * k;
  return out;
}
