/**
 * The order to draw a see-through surface's triangles in: from the
 * farthest to the nearest as seen, so that each blends over what lies
 * behind it - an orbital's two phases one mesh, a lobe seen through
 * another. Sorted by their middles, in as many steps as there are
 * triangles (a count, not a comparison): fast enough to sort again every
 * frame a molecule turns.
 */

/** Points' indices into `positions` (three numbers a point, three points a triangle), farthest triangle first, along the way `dir` looks; into `out`, which is given back. */
export function backToFront(
  positions: Float32Array,
  dir: readonly [number, number, number],
  out: Uint32Array = new Uint32Array(positions.length / 3),
  scratch?: { keys: Float32Array; counts: Uint32Array },
): Uint32Array {
  const tris = Math.floor(positions.length / 9);
  if (!tris) return out;
  const [dx, dy, dz] = dir;
  const keys = scratch && scratch.keys.length >= tris ? scratch.keys : new Float32Array(tris);
  let lo = Infinity;
  let hi = -Infinity;
  for (let t = 0; t < tris; t++) {
    const p = 9 * t;
    // (how far along the way its middle is, times three)
    const k =
      (positions[p] + positions[p + 3] + positions[p + 6]) * dx +
      (positions[p + 1] + positions[p + 4] + positions[p + 7]) * dy +
      (positions[p + 2] + positions[p + 5] + positions[p + 8]) * dz;
    keys[t] = k;
    // (as kept, in single precision)
    if (keys[t] < lo) lo = keys[t];
    if (keys[t] > hi) hi = keys[t];
  }
  // into as many steps of depth as there are triangles, the farthest first
  const steps = Math.max(1, Math.min(tris, 1 << 16));
  const counts = scratch && scratch.counts.length >= steps + 1 ? scratch.counts : new Uint32Array(steps + 1);
  counts.fill(0, 0, steps + 1);
  const scale = hi > lo ? (steps - 1) / (hi - lo) : 0;
  const stepOf = (k: number) => Math.min(steps - 1, Math.max(0, Math.floor((hi - k) * scale)));
  for (let t = 0; t < tris; t++) counts[stepOf(keys[t]) + 1]++;
  for (let s = 1; s <= steps; s++) counts[s] += counts[s - 1];
  for (let t = 0; t < tris; t++) {
    const at = 3 * counts[stepOf(keys[t])]++;
    out[at] = 3 * t;
    out[at + 1] = 3 * t + 1;
    out[at + 2] = 3 * t + 2;
  }
  return out;
}
