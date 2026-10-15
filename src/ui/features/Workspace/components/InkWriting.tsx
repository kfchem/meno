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
 * A stroke begun on a PDF's page is that page's, kept in its points, and
 * goes wherever the page goes; the eraser rubs out what is written there as
 * well. While a talk is given, a pen writes over the slide - nothing of it
 * the document's - and what it wrote goes as the slide does.
 *
 * The press is the writing's alone: nothing else on the page sees it. The
 * other buttons and the wheel still move and zoom the view. The page takes
 * no pen or touch gesture of the system's own (`touch-action`), which would
 * take a stroke back as it is written; a touch while a pen writes - the
 * hand resting on the screen - is no press at all; and a stroke taken back
 * all the same goes on if the pen comes down again at once
 * (utils/strokeTaking).
 */
import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useEditorStore } from "../store";
import type { InkLook } from "../store/types";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { INK_WIDTHS_PT, inkWidth, pressureFelt, strokeHit, strokesBounds, thinned, type InkStroke } from "../../../../lib/chem/ink";
import { shownSheet } from "../../../../lib/pdf/layout";
import { pageAt } from "../utils/page";
import { pageUnder, pointsOnPage, toPagePoint } from "../utils/pdfInk";
import { stageOf } from "../presenting/stage";
import { DOUBLE_CLICK_MS } from "../constants";
import { RESUME_MS, StrokeTaking } from "../utils/strokeTaking";
import { useDrawnLayout } from "./drawnLayoutContext";

/** How long after one stroke the next may come and join it, in ms. */
const JOIN_MS = 1500;
/** How far a press rubs out round it, on the screen, in pixels; and how near two points of a stroke may be before one goes, in pixels. */
const ERASE_PX = 8;
const LEAST_PX = 0.6;
const POINT_FALLBACK = NOMINAL_BOND_LENGTH / 14.4;

type Pt = { x: number; y: number };
type Box = { x0: number; y0: number; x1: number; y1: number };

/** The stroke written last: its piece - on the page, or on a PDF's page, by its place there - when it ended, its look and the box round its piece (in a PDF's points, on one) - what the next may join. Each workspace's own: one written in another tab joins nothing here. */
type Last = { on: { id: number } | { pdf: number; page: number; piece: number }; t: number; look: InkLook; box: Box };

export default function InkWriting() {
  const store = useEditorStore();
  const { camera, gl, invalidate } = useThree();
  const { opts } = useDrawnLayout();
  const pointPx = opts.pointPx ?? POINT_FALLBACK;
  const em = opts.fontPx;
  const lastRef = useRef<Last | null>(null);

  // (the pointer over the page, while the card is open: one to write with)
  useEffect(() => {
    const dom = gl.domElement;
    // (no pan or zoom of the system's own from a pen or a touch: it would take the stroke back, with a pointercancel, as it is written)
    dom.style.touchAction = "none";
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

    // (the stroke being written, if any: one the system took back may be gone on with)
    let writing: { taking: StrokeTaking; resume: () => void } | null = null;
    const onDown = (ev: PointerEvent) => {
      const st = store.getState();
      const pen = ev.pointerType === "pen";
      if (writing) {
        // (the pen down again just after the system took its stroke back, or a hand resting on the screen as a pen writes)
        const resumed = writing.taking.resumes(ev);
        if (resumed || (writing.taking.pen && ev.pointerType === "touch")) {
          ev.stopImmediatePropagation();
          ev.preventDefault();
          if (resumed) writing.resume();
          return;
        }
      }
      // (a talk: a pen on the surface it is given on, only)
      const talk = st.presenting != null;
      if (talk ? !pen || ev.target !== stageOf(store).layer : ev.target !== dom) return;
      const mode = talk ? null : st.inkMode;
      if (!pen && !(mode && ev.button === 0)) return;
      // (a pen's eraser end, or its button, rubs out; so does the card's eraser)
      const rubs = (pen && (ev.button === 5 || (ev.buttons & 32) !== 0 || ev.button === 2)) || mode?.tool === "eraser";
      ev.stopImmediatePropagation();
      ev.preventDefault();
      if (!talk) st.clearSel();
      if (rubs) erase(ev, talk);
      else write(ev, pen, talk);
    };

    const write = (down: PointerEvent, pen: boolean, talk: boolean) => {
      const mode = talk ? null : store.getState().inkMode;
      const look: InkLook = mode && mode.tool !== "eraser" ? { pen: mode.tool, width: mode.width, ...(mode.color ? { color: mode.color } : {}) } : { pen: "pen", width: 1 };
      // (begun on a PDF's page: that page's)
      const on = talk ? null : pageUnder(store.getState().pdfs, toPage(down.clientX, down.clientY));
      const taking = new StrokeTaking(down, toPage, pen);
      const points = taking.points;
      let frame: number | null = null;
      let held: number | null = null;
      const show = () => {
        frame = null;
        store.getState().setInkDraft({ look, stroke: { points: points.slice(), ...(pen && pressureFelt(points) ? { pressure: true as const } : {}) } });
        invalidate();
      };
      show();
      const onMove = (e: PointerEvent) => {
        if (!taking.move(e)) return;
        if (frame == null) frame = window.requestAnimationFrame(show);
      };
      const onUp = (e: PointerEvent) => {
        if (taking.up(e)) end(e.timeStamp);
      };
      // (taken back by the system: kept a moment for the pen to go on with, then ended where it was)
      const onCancel = (e: PointerEvent) => {
        if (!taking.cancel(e)) return;
        held = window.setTimeout(() => end(e.timeStamp + RESUME_MS), RESUME_MS);
      };
      const resume = () => {
        if (held != null) window.clearTimeout(held);
        held = null;
      };
      writing = { taking, resume };
      const end = (at: number) => {
        if (writing?.taking === taking) writing = null;
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);
        window.removeEventListener("pointercancel", onCancel, true);
        if (frame != null) window.cancelAnimationFrame(frame);
        const st = store.getState();
        st.setInkDraft(null);
        st.suppressDoubleClick(DOUBLE_CLICK_MS);
        const thin = thinned(points, LEAST_PX * pixel());
        // (a pen that tells no pressure written as a mouse writes: even, its ends tapered)
        const stroke: InkStroke = { points: on ? pointsOnPage(on.sheet, on.pt, thin) : thin, ...(pen && pressureFelt(points) ? { pressure: true as const } : {}) };
        if (talk) {
          st.writeTalkStroke(look, stroke);
          invalidate();
          return;
        }
        // (its width and an em in the units it is kept in: a PDF's points, or the page's)
        const width = on ? INK_WIDTHS_PT[look.pen][look.width] : inkWidth(look, pointPx);
        const nearBy = on ? em / pointPx : em;
        const box = strokesBounds([stroke], width / 2);
        if (!box) return;
        // (joining the piece before it: in the same pen, on the same page, soon after, and near it)
        const near = 6 * width + nearBy;
        const last = lastRef.current;
        const sameOn = (a: Last["on"]) => (on ? "pdf" in a && a.pdf === on.pdf && a.page === on.page : "id" in a);
        const joins =
          last && sameOn(last.on) && at - last.t < JOIN_MS && last.look.pen === look.pen && last.look.width === look.width && (last.look.color ?? null) === (look.color ?? null) && box.x0 <= last.box.x1 + near && box.x1 >= last.box.x0 - near && box.y0 <= last.box.y1 + near && box.y1 >= last.box.y0 - near;
        if (on) {
          const prev = joins && last && "pdf" in last.on ? last.on.piece : null;
          const piece = st.writePdfStroke(on.pdf, on.page, look, stroke, prev);
          if (piece == null) return;
          const kept = store.getState().pdfs.find((p) => p.id === on.pdf)?.inks?.[piece];
          lastRef.current = { on: { pdf: on.pdf, page: on.page, piece }, t: at, look, box: (kept && strokesBounds(kept.strokes, width / 2)) ?? box };
        } else {
          const prev = joins && last && "id" in last.on ? last.on.id : null;
          const id = st.writeStroke(look, stroke, prev);
          if (id == null) return;
          const kept = store.getState().inks.find((k) => k.id === id);
          lastRef.current = { on: { id }, t: at, look, box: (kept && strokesBounds(kept.strokes, width / 2)) ?? box };
        }
        invalidate();
      };
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
      window.addEventListener("pointercancel", onCancel, true);
    };

    const erase = (down: PointerEvent, talk: boolean) => {
      const gesture = `erase-${down.timeStamp}`;
      const rub = (e: PointerEvent) => {
        const st = store.getState();
        const p = toPage(e.clientX, e.clientY);
        const reach = ERASE_PX * pixel();
        if (talk) {
          st.eraseTalkStrokes(st.talkInk.flatMap((k, i) => (strokeHit(k.stroke, p, reach, inkWidth(k.look, pointPx)) ? [i] : [])));
          invalidate();
          return;
        }
        const cuts = st.inks.flatMap((k) => k.strokes.flatMap((s, index) => (strokeHit(s, p, reach, inkWidth(k, pointPx)) ? [{ id: k.id, index }] : [])));
        if (cuts.length) st.eraseStrokes(cuts, gesture);
        // (and what is written on PDFs' pages there, in their points)
        const onPdfs = st.pdfs.flatMap((pdf) =>
          pdf.icon
            ? []
            : (pdf.inks ?? []).flatMap((k, piece) => {
                const sheet = shownSheet(pdf, k.page);
                if (!sheet) return [];
                const unit = sheet.w / pdf.pages[k.page][0];
                const q = toPagePoint(sheet, pdf.pages[k.page], p);
                return k.strokes.flatMap((s, index) => (strokeHit(s, q, reach / unit, INK_WIDTHS_PT[k.pen][k.width]) ? [{ pdf: pdf.id, piece, index }] : []));
              }),
        );
        if (onPdfs.length) st.erasePdfStrokes(onPdfs, gesture);
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
