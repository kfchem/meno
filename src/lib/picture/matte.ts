/**
 * A film on a transparent background (docs/RENDER.md, *A film on a
 * transparent background*): each frame of its film for the page holds its
 * picture - its colours multiplied by their alpha, on black - and beside it
 * its alpha, as grey, in the other half: "below" the picture, or to its
 * "right". These are where each half lies in the video's texture, its
 * coordinates running from the bottom left (a texture turned up, as a
 * film's is), and how far in from a half's edges it is read, so that a
 * pixel of one half never runs into the other.
 */

/** Where a film's alpha lies in each of its frames: below its picture, or to its right. */
export type Matte = "below" | "right";

/** The ways a film's alpha may lie. */
export const MATTES: readonly Matte[] = ["below", "right"];

/** Whether a value says where a film's alpha lies. */
export const isMatte = (v: unknown): v is Matte => v === "below" || v === "right";

/** A half of a frame in the texture: a point (u, v) of the film, each from 0 to 1, is read at (x + u * w, y + v * h). */
export type Half = { x: number; y: number; w: number; h: number };

/** Where a film's picture and its alpha lie in a frame `width` by `height` pixels, and how far in a half is read: half a pixel of it. */
export function matteHalves(matte: Matte, width: number, height: number): { colour: Half; alpha: Half; inset: [number, number] } {
  if (matte === "below") {
    // (the picture the upper half, the texture's coordinates running up)
    return { colour: { x: 0, y: 0.5, w: 1, h: 0.5 }, alpha: { x: 0, y: 0, w: 1, h: 0.5 }, inset: [0.5 / Math.max(1, width), 0.5 / Math.max(1, height / 2)] };
  }
  return { colour: { x: 0, y: 0, w: 0.5, h: 1 }, alpha: { x: 0.5, y: 0, w: 0.5, h: 1 }, inset: [0.5 / Math.max(1, width / 2), 0.5 / Math.max(1, height)] };
}

/** The point of the texture a point (u, v) of the film is read at, in `half`: kept `inset` in from its edges. */
export function inHalf(half: Half, inset: [number, number], u: number, v: number): [number, number] {
  const cu = Math.min(Math.max(u, inset[0]), 1 - inset[0]);
  const cv = Math.min(Math.max(v, inset[1]), 1 - inset[1]);
  return [half.x + cu * half.w, half.y + cv * half.h];
}

/**
 * A pixel of the film as the page lays it over what lies under it: its
 * picture's colour (already multiplied by its alpha) and its alpha, over
 * `under` - each from 0 to 1. What the page's blending does (one, one less
 * the alpha): the same as a PNG's colour, not multiplied, laid over it.
 */
export function over(colour: readonly number[], alpha: number, under: readonly number[]): number[] {
  return colour.map((c, i) => c + (1 - alpha) * under[i]);
}
