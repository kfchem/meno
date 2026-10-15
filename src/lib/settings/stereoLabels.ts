/**
 * What is said where what shows R and S (stereocentres) and E and Z (double
 * bonds) could not be set up - by both, since it shows both (the maintainer,
 * 2026-10-13: E and Z showing under "R and S" looked like a bug). What shows
 * them is asked for on an atom, a bond, a molecule or a selection, each
 * naming what it shows (utils/stereoShown).
 */
export const STEREO_LABELS = {
  /** Said where what shows them could not be set up. */
  failed: "R/S and E/Z cannot be shown",
} as const;
