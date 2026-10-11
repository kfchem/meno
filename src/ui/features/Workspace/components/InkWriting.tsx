/**
 * Writing by hand, as it comes (docs/PRESENTING.md, *Handwriting*): a pen
 * writes wherever it touches the page, always - its eraser end, or its
 * button, rubs out - and so does the mouse's button while the pen's card is
 * open (`inkMode`), in what the card says. What the pointer gives is
 * smoothed as it comes (lib/chem/ink `OneEuro`), as hard as the pen presses
 * where the system says so; the stroke is shown as it is written and kept,
 * one step, as the button comes up - on the piece of writing before it,
 * where that was written in the same pen within a second and a half and
 * near it. The eraser rubs out a stroke at a time, one step for a rub.
 *
 * The press is the writing's alone: nothing else on the page sees it. The
 * other buttons and the wheel still move and zoom the view.
 */
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { useEditorStore } from "../store";
import type { InkLook } from "../store/types";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { inkWidth, OneEuro, strokeHit, strokesBounds, thinned, type InkStroke } from "../../../../lib/chem/ink";
import { pageAt } from "../utils/page";
import { DOUBLE_CLICK_MS } from "../constants";
import { useDrawnLayout } from "./drawnLayoutContext";

/** How long after one stroke the next may come and join it, in ms. */
const JOIN_MS = 1500;
/** How far a press rubs out round it, on the screen, in pixels; and how near two points of a stroke may be before one goes, in pixels. */
const ERASE_PX = 8;
const LEAST_PX = 0.6;
const POINT_FALLBACK = NOMINAL_BOND_LENGTH / 14.4;

type Pt = { x: number; y: number };
type Box = { x0: number; y0: number; x1: number; y1: number };

/** The stroke written last: its piece, when it ended, its look and the box round its piece - what the next may join. */
let last: { id: number; t: number; look: InkLook; box: Box } | null = null;

export default function InkWriting() {
  const store = useEditorStore();
  const { camera, gl, invalidate } = useThree();
  const { opts } = useDrawnLayout();
  const pointPx = opts.pointPx ?? POINT_FALLBACK;
  const em = opts.fontPx;

  // (the pointer over the page, while the card is open: one to write with)
  useEffect(() => {
    const dom = gl.domElement;
    const sync = () => {
      dom.style.cursor = store.getState().inkMode ? "crosshair" : "";
    };
    sync();
    return store.subscribe((s, p) => {
      if (s.inkMode !== p.inkMode) sync();
    });
  }, [gl, store]);

  useEffect(() => {
    const dom = gl.domElement;
    const toPage = (cx: number, cy: number): Pt => {
      const r = dom.getBoundingClientRect();
      const p = pageAt(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1), camera);
      return { x: p.x, y: p.y };
    };
    const pixel = () => {
      const a = toPage(0, 0);
      const b = toPage(1, 0);
      return Math.hypot(b.x - a.x, b.y - a.y) || 1;
    };

    const onDown = (ev: PointerEvent) => {
      if (ev.target !== dom) return;
      const st = store.getState();
      if (st.presenting) return;
      const pen = ev.pointerType === "pen";
      const mode = st.inkMode;
      if (!pen && !(mode && ev.button === 0)) return;
      // (a pen's eraser end, or its button, rubs out; so does the card's eraser)
      const rubs = (pen && (ev.button === 5 || (ev.buttons & 32) !== 0 || ev.button === 2)) || mode?.tool === "eraser";
      ev.stopImmediatePropagation();
      ev.preventDefault();
      st.clearSel();
      if (rubs) erase(ev);
      else write(ev, pen);
    };

    const write = (down: PointerEvent, pen: boolean) => {
      const mode = store.getState().inkMode;
      const look: InkLook = mode && mode.tool !== "eraser" ? { pen: mode.tool, width: mode.width, ...(mode.color ? { color: mode.color } : {}) } : { pen: "pen", width: 1 };
      const fx = new OneEuro();
      const fy = new OneEuro();
      const points: number[] = [];
      const take = (e: PointerEvent) => {
        const t = e.timeStamp / 1000;
        const p = toPage(fx.next(e.clientX, t), fy.next(e.clientY, t));
        points.push(p.x, p.y, pen ? e.pressure : 0.5);
      };
      take(down);
      let frame: number | null = null;
      const show = () => {
        frame = null;
        store.getState().setInkDraft({ look, stroke: { points: points.slice(), ...(pen ? { pressure: true as const } : {}) } });
        invalidate();
      };
      show();
      const onMove = (e: PointerEvent) => {
        if (e.pointerId !== down.pointerId) return;
        for (const c of e.getCoalescedEvents?.() ?? [e]) take(c);
        if (frame == null) frame = window.requestAnimationFrame(show);
      };
      const onUp = (e: PointerEvent) => {
        if (e.pointerId !== down.pointerId) return;
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);
        window.removeEventListener("pointercancel", onUp, true);
        if (frame != null) window.cancelAnimationFrame(frame);
        const st = store.getState();
        st.setInkDraft(null);
        st.suppressDoubleClick(DOUBLE_CLICK_MS);
        const stroke: InkStroke = { points: thinned(points, LEAST_PX * pixel()), ...(pen ? { pressure: true as const } : {}) };
        const width = inkWidth(look, pointPx);
        const box = strokesBounds([stroke], width / 2);
        if (!box) return;
        // (joining the piece before it: in the same pen, soon after, and near it)
        const near = 6 * width + em;
        const join =
          last && e.timeStamp - last.t < JOIN_MS && last.look.pen === look.pen && last.look.width === look.width && (last.look.color ?? null) === (look.color ?? null) && box.x0 <= last.box.x1 + near && box.x1 >= last.box.x0 - near && box.y0 <= last.box.y1 + near && box.y1 >= last.box.y0 - near
            ? last.id
            : null;
        const id = st.writeStroke(look, stroke, join);
        if (id == null) return;
        const piece = store.getState().inks.find((k) => k.id === id);
        last = { id, t: e.timeStamp, look, box: (piece && strokesBounds(piece.strokes, width / 2)) ?? box };
        invalidate();
      };
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
      window.addEventListener("pointercancel", onUp, true);
    };

    const erase = (down: PointerEvent) => {
      const gesture = `erase-${down.timeStamp}`;
      const rub = (e: PointerEvent) => {
        const st = store.getState();
        const p = toPage(e.clientX, e.clientY);
        const reach = ERASE_PX * pixel();
        const cuts = st.inks.flatMap((k) => k.strokes.flatMap((s, index) => (strokeHit(s, p, reach, inkWidth(k, pointPx)) ? [{ id: k.id, index }] : [])));
        if (cuts.length) st.eraseStrokes(cuts, gesture);
      };
      rub(down);
      const onMove = (e: PointerEvent) => {
        if (e.pointerId !== down.pointerId) return;
        rub(e);
      };
      const onUp = (e: PointerEvent) => {
        if (e.pointerId !== down.pointerId) return;
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);
        window.removeEventListener("pointercancel", onUp, true);
        store.getState().suppressDoubleClick(DOUBLE_CLICK_MS);
      };
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
      window.addEventListener("pointercancel", onUp, true);
    };

    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [gl, camera, store, invalidate, pointPx, em]);

  return null;
}
