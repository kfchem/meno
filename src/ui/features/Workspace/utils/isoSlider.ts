/**
 * A surface's isovalue slider (components/CalcList3D): the values it goes
 * between, by their logarithms - an orbital's and a density's, and as far
 * round the surface's own first value as it may want.
 */
/** An orbital's and a density's: the values a surface's slider goes between at least; and its steps. */
const ISO_LEAST = 1e-4;
const ISO_MOST = 0.5;
export const ISO_STEPS = 1000;
/**
 * The values a surface's slider goes between, for one drawn at `start` at
 * first: an orbital's and a density's, and as far round its own as it may
 * want - NCI's reduced gradient, drawn at 0.3 or 0.5, raised as far as 2.
 */
export function isoBounds(start?: number): { least: number; most: number } {
  const s = start != null && Number.isFinite(start) && start > 0 ? start : undefined;
  return { least: Math.min(ISO_LEAST, s != null ? s / 50 : ISO_LEAST), most: Math.max(ISO_MOST, s != null ? s * 4 : ISO_MOST) };
}
/** A value's step on the slider, and a step's value: by their logarithms. */
export const sliderOf = (iso: number, b = isoBounds()) => Math.round((ISO_STEPS * Math.log(iso / b.least)) / Math.log(b.most / b.least));
export const isoOf = (step: number, b = isoBounds()) => b.least * Math.pow(b.most / b.least, step / ISO_STEPS);
