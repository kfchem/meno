/**
 * What the one setting that shows R and S (stereocentres) and E and Z
 * (double bonds) is called, in the menu on empty space and in Settings ›
 * Chemistry alike: by both, since it shows both (the maintainer,
 * 2026-10-13 - E and Z showing under "Show R and S" looked like a bug).
 */
export const STEREO_LABELS = {
  show: "Show R/S and E/Z",
  hide: "Hide R/S and E/Z",
  /** Said where what shows them could not be set up. */
  failed: "R/S and E/Z cannot be shown",
} as const;
