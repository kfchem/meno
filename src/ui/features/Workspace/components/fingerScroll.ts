/**
 * A finger on a touch screen over what is read in the column and moved by
 * Meno itself rather than by the web view - a PDF, a text, a Markdown text
 * (docs/PDF.md, *In the column*): dragged up or down, or across, it moves
 * what is under it with it, and let go while still moving, it goes on and
 * slows, as the canvas does under a finger (PanZoom2D). Put down and taken
 * up where it was, it is a press, as before.
 *
 * Those bodies have no box of the web view's to scroll - their pages and
 * lines are drawn on the canvas under them - so the web view's own pan of a
 * finger found nothing to move there (and took the pointer from them as it
 * tried). The body is therefore given `touch-action: none`, and the finger's
 * pointer is followed here. A mouse, a pen and the wheel are not touched;
 * nor is a second finger.
 */
import { glideSpeed, recentMoves, type Move } from "../../../../lib/input/glide";

/** How far a finger goes before it is a drag, not a press, in px - as a pointer's click (TextColumn). */
export const FINGER_STILL_PX = 4;
/**
 * A drag let go while still moving goes on: as fast as it went over the
 * last RECENT_MS, slowing by GLIDE_FRICTION a second, and stopped below
 * GLIDE_LEAST px a second - unless it was held still for HELD_MS before it
 * was let go, when it stays where it is (as on the canvas, PanZoom2D).
 */
const RECENT_MS = 64;
const HELD_MS = 80;
const GLIDE_FRICTION = 4;
export const GLIDE_LEAST = 20;

/** What a body moved by a finger asks for: what moves it by px (positive: further down, further right), and what a finger's press without a move does there. */
export type FingerScrolled = {
  scrollBy: (dx: number, dy: number) => void;
  press?: (down: PointerEvent, up: PointerEvent) => void;
};

/** The part of an element a finger is followed on. */
type Followed = Pick<HTMLElement, "addEventListener" | "removeEventListener"> & {
  style: { touchAction: string };
  setPointerCapture?: (id: number) => void;
};

/** Ways to ask for a frame and to give it up (the window's, unless given). */
type Frames = { ask: (f: (t: number) => void) => number; cancel: (h: number) => void };
const windowFrames: Frames = {
  ask: (f) => requestAnimationFrame(f),
  cancel: (h) => cancelAnimationFrame(h),
};

/** A finger followed on `el`, moving it by `scrollBy`; what to call to stop following it. */
export function fingerScroll(el: Followed, { scrollBy, press }: FingerScrolled, frames: Frames = windowFrames): () => void {
  const touchWas = el.style.touchAction;
  el.style.touchAction = "none";
  let finger: { id: number; down: PointerEvent; x: number; y: number; dragging: boolean; mx: Move[]; my: Move[] } | null = null;
  let glide: { vx: number; vy: number; t: number | null; frame: number } | null = null;
  const stopGlide = () => {
    if (glide) frames.cancel(glide.frame);
    glide = null;
  };
  const step = (t: number) => {
    if (!glide) return;
    const dt = glide.t === null ? 1 / 60 : Math.min(0.05, Math.max(0, (t - glide.t) / 1000));
    glide.t = t;
    const k = Math.exp(-GLIDE_FRICTION * dt);
    glide.vx *= k;
    glide.vy *= k;
    if (Math.hypot(glide.vx, glide.vy) < GLIDE_LEAST) {
      glide = null;
      return;
    }
    scrollBy(glide.vx * dt, glide.vy * dt);
    glide.frame = frames.ask(step);
  };
  const isFinger = (e: PointerEvent) => e.pointerType === "touch";
  const onDown = (e: PointerEvent) => {
    // (anything put down stops a glide)
    stopGlide();
    if (!isFinger(e) || !e.isPrimary) return;
    finger = { id: e.pointerId, down: e, x: e.clientX, y: e.clientY, dragging: false, mx: [], my: [] };
  };
  const onMove = (e: PointerEvent) => {
    const f = finger;
    if (!f || e.pointerId !== f.id) return;
    if (!f.dragging) {
      if (Math.hypot(e.clientX - f.down.clientX, e.clientY - f.down.clientY) < FINGER_STILL_PX) return;
      f.dragging = true;
      // (held, should it go out over the column's edge)
      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        // (let go already)
      }
    }
    const dx = f.x - e.clientX;
    const dy = f.y - e.clientY;
    f.x = e.clientX;
    f.y = e.clientY;
    f.mx = [...recentMoves(f.mx, e.timeStamp, RECENT_MS), { t: e.timeStamp, d: dx }];
    f.my = [...recentMoves(f.my, e.timeStamp, RECENT_MS), { t: e.timeStamp, d: dy }];
    if (dx || dy) scrollBy(dx, dy);
  };
  const onUp = (e: PointerEvent) => {
    const f = finger;
    if (!f || e.pointerId !== f.id) return;
    finger = null;
    if (!f.dragging) {
      press?.(f.down, e);
      return;
    }
    const vx = glideSpeed(recentMoves(f.mx, e.timeStamp, RECENT_MS), e.timeStamp, HELD_MS);
    const vy = glideSpeed(recentMoves(f.my, e.timeStamp, RECENT_MS), e.timeStamp, HELD_MS);
    if (Math.hypot(vx, vy) < GLIDE_LEAST) return;
    glide = { vx, vy, t: null, frame: 0 };
    glide.frame = frames.ask(step);
  };
  const onCancel = (e: PointerEvent) => {
    if (finger?.id === e.pointerId) finger = null;
  };
  // (the wheel takes over from a glide)
  const onWheel = () => stopGlide();
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onCancel);
  el.addEventListener("wheel", onWheel, { passive: true });
  return () => {
    stopGlide();
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onCancel);
    el.removeEventListener("wheel", onWheel);
    el.style.touchAction = touchWas;
  };
}
