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

/** A rectangle on the canvas, in pixels from its top left. */
export type OnScreen = { left: number; top: number; width: number; height: number };

/**
 * Where a slide lies on a canvas `width` by `height` pixels as a talk shows
 * it (slides `slideFit`): as large as it fits below `top` - a Mac's notch -
 * in the middle of what is left. The frame of the screen it is shown in:
 * black about it.
 */
export function frameOnScreen(s: { w: number; h: number }, width: number, height: number, top = 0): OnScreen {
  const room = Math.max(1, height - top);
  const zoom = Math.min(width / s.w, room / s.h);
  const fw = s.w * zoom;
  const fh = s.h * zoom;
  return { left: (width - fw) / 2, top: top + (room - fh) / 2, width: fw, height: fh };
}

/** A rectangle `t` of the way from `a` to `b`. */
export function rectBetween(a: OnScreen, b: OnScreen, t: number): OnScreen {
  const at = (p: number, q: number) => p + (q - p) * t;
  return { left: at(a.left, b.left), top: at(a.top, b.top), width: at(a.width, b.width), height: at(a.height, b.height) };
}
