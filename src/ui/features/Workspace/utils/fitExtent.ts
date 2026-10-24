/**
 * What Fit to content takes in past what the page's things are drawn as
 * (components/FitToContent2D): a workflow's wires, where one bends out past
 * the sets and cards it joins - a step's result going back to one to its
 * left loops out on both sides - and the chips drawn over the page in HTML,
 * a molecule's frames chip wider than the set it is in. A chip grows and
 * shrinks with the page (utils/pageScale, `--page`), so the page holds it at
 * one size, whatever the zoom: measured once on the screen, its place on the
 * page stands for the fit that follows. A molecule's notes are drawn as the
 * page is only between two scales (`NOTES_SCALE`), so how much of the page
 * they take depends on the zoom the fit comes to (`notesOnPage`).
 */
import type { Wire, WorkflowSet, WorkflowStep } from "../store/types";
import { NOTES_SCALE, pageScale } from "./pageScale";
import { inputsOf } from "../workflow/kinds";
import { setGives, stepTakes, wireCurve } from "../workflow/look";

/** A box on the page, in world units: y up. */
export type PageBox = { x0: number; y0: number; x1: number; y1: number };

/** The box `a` and `b` take up together; either, where the other is none. */
export function joined(a: PageBox | null, b: PageBox | null): PageBox | null {
  if (!a) return b;
  if (!b) return a;
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

/** How many points along a wire are taken: its curve is smooth, and its furthest point lies between two of them by a hair at most. */
const ALONG = 32;

/** The box `wires` take up, each from its set's right side to its step's input, along the curve it is drawn as (workflow/look `wireCurve`); none, where none joins two parts it names. */
export function wiresExtent(sets: readonly Pick<WorkflowSet, "id" | "x0" | "x1" | "y0" | "y1">[], steps: readonly Pick<WorkflowStep, "id" | "x" | "y" | "kind">[], wires: readonly Wire[]): PageBox | null {
  let box: PageBox | null = null;
  for (const w of wires) {
    const b = sets.find((x) => x.id === w.from.set);
    const s = steps.find((x) => x.id === w.to.step);
    if (!b || !s) continue;
    const k = Math.max(0, inputsOf(s.kind).findIndex((p) => p.id === w.to.port));
    for (const p of wireCurve(setGives(b), stepTakes(s, k), ALONG)) box = joined(box, { x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  }
  return box;
}

/** A box on the screen, in CSS pixels from the window's top left (as `getBoundingClientRect` gives one). */
export type ScreenBox = { left: number; top: number; right: number; bottom: number };

/**
 * The box `boxes` on the screen take up on the page, the view as it stands:
 * the camera's middle (`x`, `y`, world units) at the middle of `canvas`, at
 * `zoom` screen pixels to a world unit. Empty ones - not shown - left out;
 * none, where none is left.
 */
export function screenToPage(boxes: readonly ScreenBox[], view: { x: number; y: number; zoom: number }, canvas: { left: number; top: number; width: number; height: number }): PageBox | null {
  const mx = canvas.left + canvas.width / 2;
  const my = canvas.top + canvas.height / 2;
  let box: PageBox | null = null;
  for (const r of boxes) {
    if (!(r.right > r.left && r.bottom > r.top)) continue;
    box = joined(box, {
      x0: view.x + (r.left - mx) / view.zoom,
      x1: view.x + (r.right - mx) / view.zoom,
      // (the screen's y down, the page's up)
      y0: view.y - (r.bottom - my) / view.zoom,
      y1: view.y - (r.top - my) / view.zoom,
    });
  }
  return box;
}

const notesScale = (zoom: number) => Math.min(NOTES_SCALE.most, Math.max(NOTES_SCALE.least, pageScale(zoom)));

/** A molecule's notes as they stand on the screen now: their box, and the gap between its foot and the point they stand over (screen pixels, at any scale). */
export type NotesSeen = { box: ScreenBox; gap: number };

/**
 * The box a molecule's notes, `notes` as they stand on the screen in the
 * view as it is (`screenToPage`), would take up on the page at `zoom`: each
 * over the same point of the page, its gap the same on the screen, and as
 * large as it is drawn there (`NOTES_SCALE`).
 */
export function notesOnPage(notes: readonly NotesSeen[], view: { x: number; y: number; zoom: number }, canvas: { left: number; top: number; width: number; height: number }, zoom: number): PageBox | null {
  const mx = canvas.left + canvas.width / 2;
  const my = canvas.top + canvas.height / 2;
  const grown = notesScale(zoom) / notesScale(view.zoom);
  let box: PageBox | null = null;
  for (const { box: r, gap } of notes) {
    if (!(r.right > r.left && r.bottom > r.top)) continue;
    // (the point they stand over: under their foot's middle, the gap down)
    const ax = view.x + ((r.left + r.right) / 2 - mx) / view.zoom;
    const ay = view.y - (r.bottom + gap - my) / view.zoom;
    const half = ((r.right - r.left) * grown) / 2 / zoom;
    box = joined(box, { x0: ax - half, x1: ax + half, y0: ay + gap / zoom, y1: ay + (gap + (r.bottom - r.top) * grown) / zoom });
  }
  return box;
}
