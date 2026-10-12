import type { EditorStore } from "../store";
import { DOUBLE_CLICK_MS, MOV_PX } from "../constants";
import { drawnShape } from "../../../../lib/chem/shapes";

type Pt = { x: number; y: number };

/**
 * An arrow drawn from Quick Add (docs/EDITOR-2D.md, *Arrows*), begun by a
 * press on its icon, from where Quick Add was opened: led by a drag from
 * that press to where its point goes - Shift keeping it to steps of 15
 * degrees, as a shape's line is (lib/chem/shapes `drawnShape`) - and put on
 * the page as one step. A press let go where it was puts one as long as an
 * arrow is made, pointing right; Escape lets it go.
 */
export function arrowFrom(
  store: EditorStore,
  press: { pointerId: number; clientX: number; clientY: number },
  start: Pt,
  /** Where a point in the window is on the page; null off the canvas. */
  toPage: (clientX: number, clientY: number) => Pt | null,
): void {
  const sx = press.clientX;
  const sy = press.clientY;
  let started = false;
  let last: { x: number; y: number; shift: boolean } | null = null;
  // (the drag is the arrow's, not the view's)
  store.getState().beginPanHold(press.pointerId);
  const pointTo = (): Pt | null => {
    if (!last) return null;
    const p = toPage(last.x, last.y);
    if (!p) return null;
    const g = drawnShape("line", start, p, last.shift);
    return { x: g.x1, y: g.y1 };
  };
  const draft = () => {
    const to = pointTo();
    if (to) store.getState().setArrowDraft({ from: start, to });
  };
  const stop = () => {
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("keyup", onKey, true);
  };
  const onMove = (ev: PointerEvent) => {
    last = { x: ev.clientX, y: ev.clientY, shift: ev.shiftKey };
    if (!started) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < MOV_PX) return;
      started = true;
    }
    draft();
  };
  const onUp = (ev: PointerEvent) => {
    stop();
    const st = store.getState();
    st.endPanHold(ev.pointerId);
    st.setArrowDraft(null);
    st.suppressDoubleClick(DOUBLE_CLICK_MS);
    if (!started) {
      // (a click: one as an arrow is made, where Quick Add was)
      st.addArrow(start.x, start.y);
      return;
    }
    last = { x: ev.clientX, y: ev.clientY, shift: ev.shiftKey };
    const to = pointTo();
    if (to && Math.hypot(to.x - start.x, to.y - start.y) > 0) st.addArrowBetween(start, to);
  };
  // (Shift pressed or let go as it is drawn: in steps at once; Escape lets it go)
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === "Escape" && ev.type === "keydown") {
      ev.stopPropagation();
      ev.preventDefault();
      stop();
      const st = store.getState();
      st.endPanHold(press.pointerId);
      st.setArrowDraft(null);
      return;
    }
    if (ev.key === "Shift" && last) {
      last = { ...last, shift: ev.type === "keydown" };
      if (started) draft();
    }
  };
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("keyup", onKey, true);
}
