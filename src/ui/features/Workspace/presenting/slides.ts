/**
 * Slides on the page, worked out (docs/PRESENTING.md): how a slide is made
 * round what it is to show, which one is in view, the line that joins one
 * to the next, the view that shows one, and what a key does while a talk
 * is given. Pure, so that each rule can be tested on its own.
 *
 * The page's units, y up; a slide by its middle and its size.
 */
import type { Slide } from "../store/types";
import type { View } from "./zoomPath";

type Pt = { x: number; y: number };
type Box = { x0: number; y0: number; x1: number; y1: number };

/** A slide's proportions: a wide screen's, as most are now, or the older standard. */
export const WIDE = 16 / 9;
export const STANDARD = 4 / 3;
/** How much room a slide made round something leaves about it, as a share of its width. */
export const SLIDE_MARGIN = 0.06;
/** A slide made of the view is this much of it, about its middle. */
export const OF_VIEW = 0.84;

/** Whether a slide has the older standard's proportions (4:3) rather than a wide screen's. */
export const isStandard = (s: Pick<Slide, "w" | "h">): boolean => Math.abs(s.w / s.h - STANDARD) < 0.02;

/** A slide's box, by its corners. */
export const boxOf = (s: Pick<Slide, "x" | "y" | "w" | "h">): Box => ({ x0: s.x - s.w / 2, y0: s.y - s.h / 2, x1: s.x + s.w / 2, y1: s.y + s.h / 2 });

/** A slide round a box, of the proportions asked for: the box in its middle, room left about it. */
export function slideAround(b: Box, aspect = WIDE): Omit<Slide, "id"> {
  const bw = Math.max(b.x1 - b.x0, 1e-6);
  const bh = Math.max(b.y1 - b.y0, 1e-6);
  // (as wide as the box needs, at the proportions, then the room about it)
  const inner = Math.max(bw, bh * aspect);
  const w = inner / (1 - 2 * SLIDE_MARGIN);
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, w, h: w / aspect };
}

/** A slide of what is seen: the largest of its proportions within the view's box, a little in from its edges, about its middle. */
export function slideOfView(view: Box, aspect = WIDE, at?: Pt): Omit<Slide, "id"> {
  const vw = view.x1 - view.x0;
  const vh = view.y1 - view.y0;
  const w = Math.min(vw, vh * aspect) * OF_VIEW;
  return { x: at?.x ?? (view.x0 + view.x1) / 2, y: at?.y ?? (view.y0 + view.y1) / 2, w, h: w / aspect };
}

/** The same slide with the other proportions, as wide, about the same middle. */
export function reshaped(s: Slide, aspect: number): Slide {
  return { ...s, h: s.w / aspect };
}

/**
 * The view that shows a slide whole on a canvas `width` by `height` pixels,
 * as large as it fits there: where the camera looks, and its zoom (pixels a
 * unit of the page).
 */
export function slideFit(s: Pick<Slide, "x" | "y" | "w" | "h">, width: number, height: number): { x: number; y: number; zoom: number } {
  return { x: s.x, y: s.y, zoom: Math.min(width / s.w, height / s.h) };
}

/**
 * Where a talk ends, as slides software ends one: at the last slide shown,
 * in the middle of the canvas the talk found - `width` by `height` pixels,
 * `cover` of them on the right under the column as it opens again - as much
 * of it as a slide made of the view is. The camera's goal while the column
 * is still shut: the view goes half the column as it opens (FollowCover).
 */
export function talkEnd(s: Pick<Slide, "x" | "y" | "w" | "h">, width: number, height: number, cover = 0): { x: number; y: number; zoom: number } {
  return { x: s.x, y: s.y, zoom: OF_VIEW * Math.min(Math.max(1, width - cover) / s.w, height / s.h) };
}

/** A camera's view as a way between views takes it: its middle, and how wide a canvas `width` pixels wide sees at its zoom. */
export const viewOf = (v: { x: number; y: number; zoom: number }, width: number): View => ({ x: v.x, y: v.y, w: width / v.zoom });

/** And back: the zoom that sees a view's width across `width` pixels. */
export const zoomOf = (v: View, width: number): number => width / v.w;

/**
 * The slide a talk starts from when it starts from what is seen: the one
 * that is most nearly what the view shows - as much of the one as of the
 * other in common - or, where none is in view, the nearest; -1 with none.
 */
export function slideInView(slides: readonly Pick<Slide, "x" | "y" | "w" | "h">[], view: Box): number {
  if (!slides.length) return -1;
  const area = (b: Box) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
  const va = area(view);
  let best = -1;
  let bestScore = 0;
  slides.forEach((s, i) => {
    const b = boxOf(s);
    const common = area({ x0: Math.max(b.x0, view.x0), y0: Math.max(b.y0, view.y0), x1: Math.min(b.x1, view.x1), y1: Math.min(b.y1, view.y1) });
    const score = common / Math.max(area(b), va, 1e-12);
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  if (best >= 0) return best;
  const mx = (view.x0 + view.x1) / 2;
  const my = (view.y0 + view.y1) / 2;
  let nearest = 0;
  slides.forEach((s, i) => {
    const n = slides[nearest];
    if (Math.hypot(s.x - mx, s.y - my) < Math.hypot(n.x - mx, n.y - my)) nearest = i;
  });
  return nearest;
}

/** Whether `inner` lies wholly within `outer`. */
export function holds(outer: Pick<Slide, "x" | "y" | "w" | "h">, inner: Pick<Slide, "x" | "y" | "w" | "h">): boolean {
  const a = boxOf(outer);
  const b = boxOf(inner);
  return b.x0 >= a.x0 && b.y0 >= a.y0 && b.x1 <= a.x1 && b.y1 <= a.y1;
}

/** Where the line from `from`, inside `b`, toward `to` leaves `b`. */
function leaving(from: Pt, to: Pt, b: Box): Pt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let t = 1;
  if (dx > 0) t = Math.min(t, (b.x1 - from.x) / dx);
  if (dx < 0) t = Math.min(t, (b.x0 - from.x) / dx);
  if (dy > 0) t = Math.min(t, (b.y1 - from.y) / dy);
  if (dy < 0) t = Math.min(t, (b.y0 - from.y) / dy);
  return { x: from.x + dx * t, y: from.y + dy * t };
}

/**
 * The line that joins a slide to the next, as the page shows it: between
 * their middles, from the edge of the one to the edge of the other - or,
 * one within the other, from the outer's number to the inner's, both at
 * their upper left corners. Null where there is nothing between them to
 * draw.
 */
export function joinOf(a: Pick<Slide, "x" | "y" | "w" | "h">, b: Pick<Slide, "x" | "y" | "w" | "h">): { from: Pt; to: Pt } | null {
  if (holds(a, b) || holds(b, a)) {
    const from = { x: a.x - a.w / 2, y: a.y + a.h / 2 };
    const to = { x: b.x - b.w / 2, y: b.y + b.h / 2 };
    return Math.hypot(to.x - from.x, to.y - from.y) > 1e-6 ? { from, to } : null;
  }
  const ca = { x: a.x, y: a.y };
  const cb = { x: b.x, y: b.y };
  const from = leaving(ca, cb, boxOf(a));
  const to = leaving(cb, ca, boxOf(b));
  // (overlapping, the edges cross: nothing between them)
  const ux = cb.x - ca.x;
  const uy = cb.y - ca.y;
  if ((to.x - from.x) * ux + (to.y - from.y) * uy <= 0) return null;
  return { from, to };
}

/** The box round the slides, or null with none. */
export function slidesBox(slides: readonly Pick<Slide, "x" | "y" | "w" | "h">[]): Box | null {
  if (!slides.length) return null;
  const bs = slides.map(boxOf);
  return { x0: Math.min(...bs.map((b) => b.x0)), y0: Math.min(...bs.map((b) => b.y0)), x1: Math.max(...bs.map((b) => b.x1)), y1: Math.max(...bs.map((b) => b.y1)) };
}

type KeyLike = { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean };

/** What a key does while a talk is given. */
export type PresentAct =
  | { go: "next" | "previous" | "first" | "last" }
  | { screen: "black" | "white" }
  | { digit: number }
  | { enter: true }
  | { end: true }
  | null;

/**
 * What a key does while a talk is given - the keys slides software has, and
 * those a clicker sends (most send Page Down and Page Up; some arrows, B or
 * a full stop, F5 and Escape):
 *
 * - on: Right, Down, Space, Page Down, N - and Enter, but after a number
 *   typed, Enter goes to that slide;
 * - back: Left, Up, Page Up, Backspace, P;
 * - Home and End: the first and the last;
 * - B or a full stop: a black screen, and back; W or a comma: a white one;
 * - Escape: the talk ends.
 *
 * With Ctrl, Cmd or Alt held, nothing.
 */
export function presentAct(e: KeyLike): PresentAct {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const k = e.key;
  if (k === "Escape") return { end: true };
  if (k === "Enter") return { enter: true };
  if (["ArrowRight", "ArrowDown", " ", "Spacebar", "PageDown", "n", "N"].includes(k)) return { go: "next" };
  if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace", "p", "P"].includes(k)) return { go: "previous" };
  if (k === "Home") return { go: "first" };
  if (k === "End") return { go: "last" };
  if (k === "b" || k === "B" || k === ".") return { screen: "black" };
  if (k === "w" || k === "W" || k === ",") return { screen: "white" };
  if (/^[0-9]$/.test(k)) return { digit: Number(k) };
  return null;
}
