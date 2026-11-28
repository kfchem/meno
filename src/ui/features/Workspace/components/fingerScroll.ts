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
 * pointer is followed here. A mouse, a pen and the wheel are not touched.
 *
 * A second finger put down with the first pinches, where the body can be
 * made larger or smaller (`pinch` - a PDF): spread, it zooms in, closed,
 * out, the point midway between them held there, and moved together they
 * carry it with them. Lifting either goes on as the other's drag, from
 * where it is. Where there is no zoom (a text, a Markdown text), and for a
 * third finger, a second is not followed.
 */
import { glideSpeed, recentMoves, type Move } from "../../../../lib/input/glide";
import type { Pt } from "../../../../lib/input/pinch";

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

/**
 * Two fingers pinching a body: where it is as they come down (`begin`), and
 * what shows it as they have pinched it since, from there - from `a0` and
 * `b0` to `a1` and `b1`, in the window's CSS pixels.
 */
export type Pinched<V> = {
  begin: () => V;
  to: (begun: V, fingers: { a0: Pt; b0: Pt; a1: Pt; b1: Pt }) => void;
};

/** What a body moved by a finger asks for: what moves it by px (positive: further down, further right), what a finger's press without a move does there, and what two fingers' pinch does. */
export type FingerScrolled<V = unknown> = {
  scrollBy: (dx: number, dy: number) => void;
  press?: (down: PointerEvent, up: PointerEvent) => void;
  pinch?: Pinched<V>;
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
export function fingerScroll<V>(el: Followed, { scrollBy, press, pinch }: FingerScrolled<V>, frames: Frames = windowFrames): () => void {
  const touchWas = el.style.touchAction;
  el.style.touchAction = "none";
  // (one finger: where it came down, where it was last moved by, where it is now)
  let finger: { id: number; down: PointerEvent; x: number; y: number; now: Pt; dragging: boolean; mx: Move[]; my: Move[] } | null = null;
  // (two fingers: each where it came down and where it is now, and where the body was as the second came down)
  type Held = { id: number; down: PointerEvent; at: Pt; now: Pt };
  let two: { a: Held; b: Held; begun: V } | null = null;
  const hold = (id: number) => {
    try {
      el.setPointerCapture?.(id);
    } catch {
      // (let go already)
    }
  };
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
    if (!isFinger(e) || two) return;
    const f = finger;
    if (f && pinch && e.pointerId !== f.id) {
      // (a second finger: a pinch, from where both are - the first's press, or drag, ends here)
      finger = null;
      const at = { x: e.clientX, y: e.clientY };
      two = { a: { id: f.id, down: f.down, at: f.now, now: f.now }, b: { id: e.pointerId, down: e, at, now: at }, begun: pinch.begin() };
      hold(f.id);
      hold(e.pointerId);
      return;
    }
    if (f || !e.isPrimary) return;
    finger = { id: e.pointerId, down: e, x: e.clientX, y: e.clientY, now: { x: e.clientX, y: e.clientY }, dragging: false, mx: [], my: [] };
  };
  /** The finger left of two, lifted or cancelled: a drag from where it is now, as if it had been one all along. */
  const leftOf = (gone: number) => {
    const t = two;
    if (!t) return false;
    const left = t.a.id === gone ? t.b : t.b.id === gone ? t.a : null;
    if (!left) return false;
    two = null;
    finger = { id: left.id, down: left.down, x: left.now.x, y: left.now.y, now: left.now, dragging: true, mx: [], my: [] };
    return true;
  };
  const onMove = (e: PointerEvent) => {
    const t = two;
    if (t) {
      const held = t.a.id === e.pointerId ? t.a : t.b.id === e.pointerId ? t.b : null;
      if (!held || !pinch) return;
      held.now = { x: e.clientX, y: e.clientY };
      pinch.to(t.begun, { a0: t.a.at, b0: t.b.at, a1: t.a.now, b1: t.b.now });
      return;
    }
    const f = finger;
    if (!f || e.pointerId !== f.id) return;
    f.now = { x: e.clientX, y: e.clientY };
    if (!f.dragging) {
      if (Math.hypot(e.clientX - f.down.clientX, e.clientY - f.down.clientY) < FINGER_STILL_PX) return;
      f.dragging = true;
      // (held, should it go out over the column's edge)
      hold(e.pointerId);
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
    if (leftOf(e.pointerId)) return;
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
    if (leftOf(e.pointerId)) return;
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
    finger = null;
    two = null;
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onCancel);
    el.removeEventListener("wheel", onWheel);
    el.style.touchAction = touchWas;
  };
}
