/**
 * The way a talk's view goes from one slide to the next: zooming and moving
 * at once, along the path that asks least of the eye, as van Wijk and Nuij
 * worked it out (J. J. van Wijk and W. A. A. Nuij, "Smooth and efficient
 * zooming and panning", IEEE Symposium on Information Visualization, 2003) -
 * out a little, across and in again, the farther apart the two are the
 * farther out, so that both stay in sight on the way. Written from the
 * paper's equations.
 *
 * A view is where its middle is and how wide it is, in the page's units.
 */
export type View = { x: number; y: number; w: number };

/** A way from one view to another: how long it is, in the paper's own measure, and the view a share `t` of the way along it (0 to 1). */
export type ZoomPath = { length: number; at: (t: number) => View };

/**
 * How much the path zooms out rather than moves across (the paper's rho):
 * the paper found values near 1.4 easiest to follow; sqrt(2) here.
 */
export const RHO = Math.SQRT2;

/** The way from `a` to `b`. */
export function zoomPath(a: View, b: View, rho = RHO): ZoomPath {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const w0 = Math.max(a.w, 1e-9);
  const w1 = Math.max(b.w, 1e-9);
  // (going nowhere across, or hardly: a zoom alone, by ratio)
  if (d < 1e-6 * Math.max(w0, w1)) {
    const length = Math.abs(Math.log(w1 / w0)) / rho;
    return {
      length,
      at: (t) => {
        const s = clamp01(t);
        return { x: a.x + dx * s, y: a.y + dy * s, w: w0 * Math.pow(w1 / w0, s) };
      },
    };
  }
  const rho2 = rho * rho;
  const rho4 = rho2 * rho2;
  const b0 = (w1 * w1 - w0 * w0 + rho4 * d * d) / (2 * w0 * rho2 * d);
  const b1 = (w1 * w1 - w0 * w0 - rho4 * d * d) / (2 * w1 * rho2 * d);
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
  const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  const length = (r1 - r0) / rho;
  const c0 = Math.cosh(r0);
  const s0 = Math.sinh(r0);
  return {
    length,
    at: (t) => {
      const s = clamp01(t) * length;
      // (how far along the line between the two middles, and how wide)
      const u = (w0 / rho2) * (c0 * Math.tanh(rho * s + r0) - s0);
      const w = (w0 * c0) / Math.cosh(rho * s + r0);
      return { x: a.x + (u * dx) / d, y: a.y + (u * dy) / d, w: t >= 1 ? w1 : w };
    },
  };
}

/**
 * How long a way takes, in milliseconds: longer the longer it is, but
 * never a wait - from 0.6 s for a slide beside the last to 1.4 s at most.
 */
export function flightMs(path: Pick<ZoomPath, "length">): number {
  return Math.min(1400, Math.max(600, 300 + 520 * path.length));
}

/** Gentle out of the start and into the end, as a view sent somewhere goes (cubic, in and out). */
export function easeInOut(u: number): number {
  const t = clamp01(u);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}
