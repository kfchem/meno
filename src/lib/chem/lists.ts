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
