/**
 * The least and the most of many numbers, and the box round many points,
 * found by going through them. Spread into `Math.min` or `Math.max`, each
 * number is an argument of its own, and a call takes only so many: WebKit
 * (the app's page) 65,536, V8 about twice that. A drawing, a selection or a
 * trajectory past that threw - all atoms selected and deleted, a frame's
 * energies drawn - so whatever can be that many goes through these.
 *
 * As `Math.min` and `Math.max`: none, Infinity or -Infinity; any NaN, NaN.
 */
export function least(xs: Iterable<number>): number {
  let m = Infinity;
  for (const x of xs) {
    if (Number.isNaN(x)) return NaN;
    if (x < m) m = x;
  }
  return m;
}

export function most(xs: Iterable<number>): number {
  let m = -Infinity;
  for (const x of xs) {
    if (Number.isNaN(x)) return NaN;
    if (x > m) m = x;
  }
  return m;
}

export type Bounds = { x0: number; y0: number; x1: number; y1: number };

/** The box round points - its least and most x and y - or null, where there are none. */
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

/** The middle of the box round points, or null where there are none. */
export function middleOfPoints(points: Iterable<{ x: number; y: number }>): { x: number; y: number } | null {
  const b = boundsOf(points);
  return b ? { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 } : null;
}
