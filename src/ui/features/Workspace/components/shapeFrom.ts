import type { EditorStore } from "../store";
import { DOUBLE_CLICK_MS, MOV_PX } from "../constants";
import { drawnShape, type ShapeKind } from "../../../../lib/chem/shapes";

type Pt = { x: number; y: number };

/**
 * A shape drawn from a point of empty space, begun by a press on its icon
 * in Quick Add, from where Quick Add was opened (docs/PRESENTING.md,
 * *Shapes*): led by a drag from that press, or, the button let go where it
 * was, traced with the button up until a click ends it, as a chain is.
 * Shift keeps a box square or round, a line to steps of 15 degrees. What
 * is drawn is put on the page and selected; Escape lets it go either way,
 * and so does a shape drawn too small to be one.
 */
export function shapeFrom(
  store: EditorStore,
  press: { pointerId: number; clientX: number; clientY: number },
  start: Pt,
  kind: ShapeKind,
  /** Where a point in the window is on the page; null off the canvas. */
  toPage: (clientX: number, clientY: number) => Pt | null,
): void {
  const sx = press.clientX;
  const sy = press.clientY;
  let started = false;
  let tracing = false;
  let last: { x: number; y: number; shift: boolean } | null = null;
  // (the drag is the shape's, not the view's)
  store.getState().beginPanHold(press.pointerId);
  const draft = () => {
    if (!last) return;
    const p = toPage(last.x, last.y);
    if (p) store.getState().setShapeDraft({ kind, from: start, to: p, even: last.shift });
  };
  const swallow = (ev: Event) => {
    ev.stopPropagation();
    ev.preventDefault();
  };
  const stop = () => {
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointerdown", onDown, true);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("keyup", onKey, true);
  };
  const finish = (keep: boolean) => {
    stop();
    const st = store.getState();
    const d = st.shapeDraft;
    st.setShapeDraft(null);
    st.suppressDoubleClick(DOUBLE_CLICK_MS);
    // (too small to be drawn on purpose: as far as a click moves, no further)
    if (!keep || !d || !last || Math.hypot(last.x - sx, last.y - sy) < MOV_PX) return;
    const g = drawnShape(d.kind, d.from, d.to, d.even);
    const id = st.addShape({ kind: d.kind, ...g });
    if (id == null) return;
    st.clearSel();
    st.selectShapes([id]);
  };
  const onMove = (ev: PointerEvent) => {
    if (tracing && ev.buttons !== 0) return;
    last = { x: ev.clientX, y: ev.clientY, shift: ev.shiftKey };
    if (!started) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < MOV_PX) return;
      started = true;
    }
    draft();
  };
  const onUp = (ev: PointerEvent) => {
    if (tracing) return;
    store.getState().endPanHold(ev.pointerId);
    if (started) {
      last = { x: ev.clientX, y: ev.clientY, shift: ev.shiftKey };
      draft();
      finish(true);
      return;
    }
    // (let go where it was pressed: traced with the button up, from here)
    tracing = true;
    started = true;
    window.addEventListener("pointerdown", onDown, true);
  };
  const onDown = (ev: PointerEvent) => {
    swallow(ev);
    if (ev.button === 0) {
      last = { x: ev.clientX, y: ev.clientY, shift: ev.shiftKey };
      draft();
      finish(true);
    } else finish(false);
    // (the click, and the menu, that end the press are the shape's too)
    for (const type of ["click", "contextmenu", "pointerup"]) window.addEventListener(type, swallow, { capture: true, once: true });
    window.setTimeout(() => {
      for (const type of ["click", "contextmenu", "pointerup"]) window.removeEventListener(type, swallow, { capture: true });
    }, 400);
  };
  // (Shift pressed or let go as it is drawn: square or not at once; Escape lets it go)
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === "Escape" && ev.type === "keydown") {
      swallow(ev);
      store.getState().endPanHold(press.pointerId);
      finish(false);
      return;
    }
    if (ev.key === "Shift" && last) {
      last = { ...last, shift: ev.type === "keydown" };
      draft();
    }
  };
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("keyup", onKey, true);
}
