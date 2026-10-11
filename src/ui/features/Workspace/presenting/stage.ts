import type { EditorStore } from "../store";

/**
 * What a talk is given on, over the canvas (PresentLayer): the surface that
 * takes the pointer while it is given, the veil over the page about the
 * slide shown - its four bands - the screen made black or white, and the
 * slide's number. The canvas's part of the talk (Presenter) moves them each
 * frame, as the view goes.
 */
export type Stage = {
  layer: HTMLDivElement | null;
  veil: HTMLDivElement | null;
  bands: (HTMLDivElement | null)[];
  screen: HTMLDivElement | null;
  count: HTMLDivElement | null;
};

const stages = new WeakMap<EditorStore, Stage>();

/** The stage of a workspace's talks: the same one for as long as its store is. */
export function stageOf(store: EditorStore): Stage {
  let s = stages.get(store);
  if (!s) {
    s = { layer: null, veil: null, bands: [null, null, null, null], screen: null, count: null };
    stages.set(store, s);
  }
  return s;
}

/**
 * The four bands of the veil about a slide that lies at `r` on a canvas
 * `width` by `height` pixels: above it, below it, and either side of it
 * between - each its left, top, width and height, in pixels, none less
 * than nothing.
 */
export function bandsAbout(r: { left: number; top: number; width: number; height: number }, width: number, height: number): [number, number, number, number][] {
  const top = Math.max(0, Math.min(height, r.top));
  const bottom = Math.max(top, Math.min(height, r.top + r.height));
  const left = Math.max(0, Math.min(width, r.left));
  const right = Math.max(left, Math.min(width, r.left + r.width));
  return [
    [0, 0, width, top],
    [0, bottom, width, height - bottom],
    [0, top, left, bottom - top],
    [right, top, width - right, bottom - top],
  ];
}
