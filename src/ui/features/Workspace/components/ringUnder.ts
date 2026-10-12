/** A ring's middle, its circle's radius, and the key it is turned on by. */
export type RingCentre = { x: number; y: number; r: number; key?: string };

/**
 * The ring whose circle the pointer at `at` (in the canvas's pixels) shows,
 * and a press there turns on or off: the nearest whose middle lies within
 * `reach` pixels of it on the screen (`onScreen`) - and none while an atom
 * or a bond is under the pointer (`onPart`). A press on one is that atom's
 * or bond's: zoomed out, a ring's atoms, and those next to it, lie within
 * `reach` of its middle.
 */
export function ringUnder(
  centres: readonly RingCentre[],
  at: { x: number; y: number },
  onScreen: (c: RingCentre) => { x: number; y: number },
  onPart: boolean,
  reach = 40,
): RingCentre | null {
  if (onPart) return null;
  let found: RingCentre | null = null;
  let least = Infinity;
  for (const c of centres) {
    const p = onScreen(c);
    const d = Math.hypot(at.x - p.x, at.y - p.y);
    if (d < reach && d < least) {
      found = c;
      least = d;
    }
  }
  return found;
}
