/**
 * Lists as long as a drawing's atoms, handled without spreading them into
 * one call: a call takes only as many arguments as its thread's stack has
 * room for, and a worker's in WebKit has room for fewer than 50 000, so
 * `atoms.push(...mine)` or `Math.min(...xs)` over a large drawing throws
 * there (and on any thread, past some hundreds of thousands).
 */

/** The least of `values`, as `Math.min` gives it: Infinity where there are none, NaN where one is. */
export function least(values: Iterable<number>): number {
  let out = Infinity;
  for (const v of values) out = Math.min(out, v);
  return out;
}

/** The greatest of `values`, as `Math.max` gives it: -Infinity where there are none, NaN where one is. */
export function greatest(values: Iterable<number>): number {
  let out = -Infinity;
  for (const v of values) out = Math.max(out, v);
  return out;
}

/** `items` put at the end of `into`, in order, as `into.push(...items)` would: `into`, longer. */
export function pushAll<T>(into: T[], items: Iterable<T>): T[] {
  for (const item of items) into.push(item);
  return into;
}

export type Bounds = { x0: number; y0: number; x1: number; y1: number };

/** The box round `points` - their least and greatest x and y - or null, where there are none. */
export function boundsOf(points: Iterable<{ x: number; y: number }>): Bounds | null {
  let b: Bounds | null = null;
  for (const p of points) {
    if (!b) b = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    else {
      if (p.x < b.x0) b.x0 = p.x;
      if (p.x > b.x1) b.x1 = p.x;
      if (p.y < b.y0) b.y0 = p.y;
      if (p.y > b.y1) b.y1 = p.y;
    }
  }
  return b;
}

/** The middle of the box round `points`, or null where there are none. */
export function middleOfPoints(points: Iterable<{ x: number; y: number }>): { x: number; y: number } | null {
  const b = boundsOf(points);
  return b ? { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 } : null;
}
