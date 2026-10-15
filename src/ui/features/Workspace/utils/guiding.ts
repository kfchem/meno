import type { EditorStore } from "../store";
import { IS_MAC } from "../../../../lib/doc/shortcuts";
import { styleOf, type DrawingStyle } from "../../../../lib/chem/style";
import { GUIDE_HOLD_PX, GUIDE_PX, guided, nearOf, sidesLike, sizedLike, widthLike, type Box, type GuideMarks } from "../presenting/guides";
import { besidesBoxes, selectedBox } from "./extent";

type Pt = { x: number; y: number };
/** The keys held at a step of a move: Ctrl (⌘ on a Mac) holds the guides off; Shift keeps the move across or up and down. */
export type Held = { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean };

/** How many boxes' sides round what moves the guides look as far as, and a little more, in pixels. */
const NEAR_SIDES = 3;
const NEAR_PX = 200;

/** The style the canvas is drawn in: the document's own, or the app's. */
function styleNow(store: EditorStore): DrawingStyle {
  return styleOf(store.getState().docStyle);
}

/** How long a pixel of the screen is on the page, about `at`. */
function pixelOn(toWorld: (cx: number, cy: number) => Pt, at: Pt): number {
  const a = toWorld(at.x, at.y);
  const b = toWorld(at.x + 1, at.y);
  return Math.hypot(b.x - a.x, b.y - a.y) || 1;
}

/** Whether the keys held keep the guides off: Ctrl, or ⌘ on a Mac. */
const off = (k: Held) => (IS_MAC ? k.metaKey : k.ctrlKey);

/** The guides shown, or none: none again is no change (the move's steps come at every frame). */
function showGuides(store: EditorStore, guides: GuideMarks | null): void {
  if (guides || store.getState().guides) store.getState().setGuides(guides);
}

/**
 * A move of what is selected, guided by what is near (presenting/guides,
 * docs/PRESENTING.md, *Guides*): begun as the move begins - `from`, the
 * press, on the screen - it says, at each step, how far it goes for a move
 * of (`dx`, `dy`), and shows what lines up; `end` takes the guides away.
 * Shift keeps the move to the way it goes most; Ctrl (⌘) holds them off.
 */
export function guideMove(store: EditorStore, toWorld: (cx: number, cy: number) => Pt, from: Pt): { step: (dx: number, dy: number, keys: Held) => Pt; end: () => void } {
  const st = store.getState();
  const style = styleNow(store);
  const px = pixelOn(toWorld, from);
  const moving = selectedBox(st, style, 1 / px, undefined, true);
  const others = moving ? nearOf(moving, besidesBoxes(st, style), NEAR_SIDES * Math.max(moving.x1 - moving.x0, moving.y1 - moving.y0) + NEAR_PX * px) : [];
  // (an axis it is snapped on is held to a longer distance than takes it: no flicker as it passes the edge)
  let heldX = false;
  let heldY = false;
  const step = (dx: number, dy: number, keys: Held): Pt => {
    // (Shift: across, or up and down, the way it has gone most)
    const axis = keys.shiftKey ? (Math.abs(dx) >= Math.abs(dy) ? "x" : "y") : undefined;
    const kx = axis === "y" ? 0 : dx;
    const ky = axis === "x" ? 0 : dy;
    if (!moving || !others.length || off(keys)) {
      heldX = heldY = false;
      showGuides(store, null);
      return { x: kx, y: ky };
    }
    const hold = GUIDE_HOLD_PX * px;
    const g = guided(moving, kx, ky, others, GUIDE_PX * px, axis, { ...(heldX ? { x: hold } : {}), ...(heldY ? { y: hold } : {}) });
    heldX = g.dx !== kx;
    heldY = g.dy !== ky;
    showGuides(store, g.lines.length || g.marks.length ? { lines: g.lines, marks: g.marks } : null);
    return { x: g.dx, y: g.dy };
  };
  return { step, end: () => showGuides(store, null) };
}

/**
 * A box made larger or smaller, its proportions kept, guided by what is
 * near: at each step, the share of its size it was (`f`) - that of a
 * width or a height near it, where one is - and what shows it. `keep`
 * says where the box is at a share.
 */
export function guideScale(store: EditorStore, toWorld: (cx: number, cy: number) => Pt, at: Pt, was: Box): { step: (f: number, keys: Held, keep: (f: number) => Box) => number; end: () => void } {
  const style = styleNow(store);
  const px = pixelOn(toWorld, at);
  const others = besidesBoxes(store.getState(), style);
  const step = (f: number, keys: Held, keep: (f: number) => Box): number => {
    if (off(keys)) {
      showGuides(store, null);
      return f;
    }
    const s = sizedLike(was, f, nearOf(keep(f), others, NEAR_SIDES * Math.max(was.x1 - was.x0, was.y1 - was.y0) * f + NEAR_PX * px), GUIDE_PX * px, keep);
    showGuides(store, s.marks.length ? { lines: s.lines, marks: s.marks } : null);
    return s.f;
  };
  return { step, end: () => showGuides(store, null) };
}

/** Words (`caption`) made wider or narrower, guided by what is near: at each step, the width they come to - another's, near it - and what shows it. */
export function guideWidth(store: EditorStore, toWorld: (cx: number, cy: number) => Pt, at: Pt, caption: number): { step: (now: Box, keys: Held) => number | null; end: () => void } {
  const style = styleNow(store);
  const px = pixelOn(toWorld, at);
  const others = besidesBoxes(store.getState(), style, undefined, { caption });
  const step = (now: Box, keys: Held): number | null => {
    if (off(keys)) {
      showGuides(store, null);
      return null;
    }
    const w = widthLike(now, nearOf(now, others, NEAR_SIDES * (now.x1 - now.x0) + NEAR_PX * px), GUIDE_PX * px);
    showGuides(store, w.marks.length ? { lines: [], marks: w.marks } : null);
    return w.size;
  };
  return { step, end: () => showGuides(store, null) };
}

/**
 * A box made larger or smaller by a side or a corner, its proportions free
 * - a shape's - guided by what is near: at each step, where it comes to as
 * each side moved takes the width or height of something near it, and
 * what shows it.
 */
export function guideSides(store: EditorStore, toWorld: (cx: number, cy: number) => Pt, at: Pt): { step: (now: Box, moving: { x?: "x0" | "x1"; y?: "y0" | "y1" }, keys: Held) => Box; end: () => void } {
  const style = styleNow(store);
  const px = pixelOn(toWorld, at);
  const others = besidesBoxes(store.getState(), style);
  const step = (now: Box, moving: { x?: "x0" | "x1"; y?: "y0" | "y1" }, keys: Held): Box => {
    if (off(keys)) {
      showGuides(store, null);
      return now;
    }
    const s = sidesLike(now, moving, nearOf(now, others, NEAR_SIDES * Math.max(now.x1 - now.x0, now.y1 - now.y0) + NEAR_PX * px), GUIDE_PX * px);
    showGuides(store, s.marks.length ? { lines: [], marks: s.marks } : null);
    return s.box;
  };
  return { step, end: () => showGuides(store, null) };
}
