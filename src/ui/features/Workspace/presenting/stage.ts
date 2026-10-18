import type { EditorStore } from "../store";

/**
 * What a talk is given on, over the canvas (PresentLayer): the surface that
 * takes the pointer while it is given, the veil over the page about the
 * slides - black but for its two windows, the slide shown and, on the way
 * from one to the next, the slide left - the screen made black or white,
 * and the slide's number. The canvas's part of the talk (Presenter) moves
 * them each frame, as the view goes.
 */
export type Stage = {
  layer: HTMLDivElement | null;
  veil: HTMLDivElement | null;
  windows: (SVGRectElement | null)[];
  screen: HTMLDivElement | null;
  count: HTMLDivElement | null;
};

const stages = new WeakMap<EditorStore, Stage>();

/** The stage of a workspace's talks: the same one for as long as its store is. */
export function stageOf(store: EditorStore): Stage {
  let s = stages.get(store);
  if (!s) {
    s = { layer: null, veil: null, windows: [null, null], screen: null, count: null };
    stages.set(store, s);
  }
  return s;
}

/** A rectangle on the canvas, in pixels from its top left. */
export type OnScreen = { left: number; top: number; width: number; height: number };

/**
 * Where a slide - its middle and size, in the page's units - lies on a
 * canvas `width` by `height` pixels, the view's middle at (`x`, `y`) and
 * `zoom` pixels to the unit: the window the veil leaves for it.
 */
export function slideOnScreen(s: { x: number; y: number; w: number; h: number }, view: { x: number; y: number; zoom: number }, width: number, height: number): OnScreen {
  const z = view.zoom;
  return { left: width / 2 + (s.x - s.w / 2 - view.x) * z, top: height / 2 - (s.y + s.h / 2 - view.y) * z, width: s.w * z, height: s.h * z };
}
