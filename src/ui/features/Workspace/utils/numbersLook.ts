/**
 * TEMPORARY - TO BE REMOVED BEFORE MERGE: a switch between the two ways
 * atom numbers are drawn on molecules in 3D (utils/atomNumbers), flat over
 * the ball or printed on it, for the maintainer to compare them by hand.
 * Once one is chosen, this file and its menu items go, and the shader
 * keeps only that one.
 */

let look = 0;
const told = new Set<() => void>();

/** How atom numbers are drawn now: 0 flat over the ball, 1 printed on it. */
export function numbersLook(): number {
  return look;
}

export function setNumbersLook(to: number): void {
  if (to === look) return;
  look = to;
  for (const f of told) f();
}

/** Told whenever the way changes; what it gives back stops it. */
export function onNumbersLook(f: () => void): () => void {
  told.add(f);
  return () => told.delete(f);
}
