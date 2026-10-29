/**
 * How wide a frames chip is drawn (components/Frames3D), in its own
 * pixels, as it opens to its details and as how it was made opens in them
 * (theme/opening). Shut, it is as wide as `shut`: what it says, eased as
 * that changes. Opened, it is as wide as the widest of what it opens to:
 * `open` (a set's bars and slider), and its `details`, widened by how far
 * how it was made has `madeGrown` to `made`. It goes from one to the other
 * as far as it has `grown`, so on shutting nothing narrows until its lines
 * have gone, and opening, it is at its width as they come in.
 */
export function chipWidthOf(p: {
  shut: number;
  open: number;
  details: number;
  made: number;
  grown: number;
  madeGrown: number;
}): number {
  const details = p.details + p.madeGrown * Math.max(0, p.made - p.details);
  return p.shut + p.grown * Math.max(0, Math.max(p.open, details) - p.shut);
}

/**
 * How far right a frames chip is drawn of where it is centred, in its own
 * pixels: half of what how it was made has widened it by, so that it
 * widens to the right only as that opens, and its left edge - and how it
 * was made's toggle, at its left, just pressed - stays under the pointer
 * (CC, 2026-10-29: a control just pressed never moves out from under it).
 * Back to none as that shuts.
 */
export function chipShiftOf(p: Parameters<typeof chipWidthOf>[0]): number {
  return (chipWidthOf(p) - chipWidthOf({ ...p, madeGrown: 0 })) / 2;
}
