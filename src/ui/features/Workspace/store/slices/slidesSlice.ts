import { gestureStep } from "../../../../../lib/doc/document";
import type { StoreApi } from "zustand";
import type { DocumentStore } from "../../../../../lib/doc";
import * as ops from "../../document";
import type { WorkspaceDocument } from "../../document";
import type { EditorState, Slide } from "../types";
import { inBox, molecules3dIn } from "../../utils/selection";
import { sheetMiddle } from "../../utils/textSheets";
import { pdfBounds } from "../../../../../lib/pdf/layout";
import { flowIn } from "../../workflow/parts";
import { boxOf } from "../../presenting/slides";
import { strokesBounds } from "../../../../../lib/chem/ink";
import { middleOf } from "../../../../../lib/chem/shapes";

type SetState = StoreApi<EditorState>["setState"];
type GetState = StoreApi<EditorState>["getState"];

/**
 * Slides on the page (docs/PRESENTING.md): edits to the document, so that
 * undo takes them back and Save keeps them; which are selected, which is
 * under the pointer and the talk being given from them, the view's.
 */
export function createSlidesSlice(doc: DocumentStore<WorkspaceDocument>, set: SetState, get: GetState) {
  return {
    setHoveredSlide: (id: number | null) => set((prev: EditorState) => (prev.hoveredSlide === id ? prev : { ...prev, hoveredSlide: id })),
    // (only those on the page, as pictures)
    selectSlides: (ids: Iterable<number>, add = false) =>
      set((prev: EditorState) => ({ ...prev, selSlides: new Set([...(add ? prev.selSlides : []), ...[...ids].filter((id) => prev.slides.some((x) => x.id === id))]) })),
    toggleSlideSel: (id: number) =>
      set((prev: EditorState) => {
        const selSlides = new Set(prev.selSlides);
        if (!selSlides.delete(id)) selSlides.add(id);
        return { ...prev, selSlides };
      }),
    addSlide: (slide: Omit<Slide, "id">) => {
      const id = doc.getState().nextSlideId ?? 1;
      return doc.edit("add slide", (d) => ops.addSlide(d, slide)) ? id : null;
    },
    updateSlide: (id: number, patch: Partial<Pick<Slide, "x" | "y" | "w" | "h">> & { around?: boolean }, gesture?: string) =>
      doc.edit(
        patch.around !== undefined ? "show the page about a slide" : patch.w !== undefined || patch.h !== undefined ? "resize slide" : "move slide",
        (d) => ops.updateSlide(d, id, patch),
        gesture ? gestureStep(`slide:${id}:${gesture}`) : {},
      ),
    // what is on a slide, selected - all of it whose middle lies in it, as a box selects; the slide, and the slides within it, with it
    selectOnSlide: (id: number) => {
      const st = get();
      const s = st.slides.find((x) => x.id === id);
      if (!s) return;
      const b = boxOf(s);
      const box = [
        { x: b.x0, y: b.y0 },
        { x: b.x1, y: b.y1 },
      ];
      const within = (p: { x: number; y: number }) => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1;
      st.clearSel();
      st.selectMolecules3d(molecules3dIn(st.molecules3d, "box", box));
      st.selectPictures(molecules3dIn(st.pictures.map((p) => ({ id: p.id, at: p })), "box", box));
      st.selectTexts(molecules3dIn(st.texts.flatMap((t) => (t.at ? [{ id: t.id, at: sheetMiddle(t.at, t.text, t.name) }] : [])), "box", box));
      // (and writing by hand on it, each piece by its middle, as a box takes it)
      st.selectInks(st.inks.filter((k) => {
        const m = strokesBounds(k.strokes, 0);
        return m != null && within({ x: (m.x0 + m.x1) / 2, y: (m.y0 + m.y1) / 2 });
      }).map((k) => k.id));
      st.selectPdfs(
        molecules3dIn(
          st.pdfs.map((p) => {
            const r = pdfBounds(p);
            return { id: p.id, at: { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 } };
          }),
          "box",
          box,
        ),
      );
      st.selectCaptions(st.captions.filter((c) => c.arrow == null && within(c)).map((c) => c.id));
      // (and the shapes whose middles lie in it)
      st.selectShapes(st.shapes.filter((x) => within(middleOf(x))).map((x) => x.id));
      st.selectFlow(flowIn(st, "box", box));
      // (the drawing's last: a molecule in 3D selected alone lets it go)
      st.setSel(inBox(st.model, box[0], box[1]));
      st.selectSlides([id, ...st.slides.filter((x) => x.id !== id && within(x) && within({ x: x.x - x.w / 2, y: x.y - x.h / 2 }) && within({ x: x.x + x.w / 2, y: x.y + x.h / 2 })).map((x) => x.id)]);
    },
    orderSlide: (id: number, to: number) => doc.edit("reorder slides", (d) => ops.orderSlide(d, id, to)),
    removeSlide: (id: number) => {
      if (doc.edit("delete slide", (d) => ops.removeSlides(d, [id])))
        set((prev: EditorState) => ({ ...prev, hoveredSlide: prev.hoveredSlide === id ? null : prev.hoveredSlide }));
    },
    // (a talk: begun at a slide, gone on to another, ended - the view's, never a step to undo)
    present: (from: number) => {
      const st = get();
      const n = st.slides.length;
      if (!n || st.presenting) return;
      // (nothing under way or selected on the page as it begins: what the talk shows is the page alone)
      st.letGo();
      st.clearSel();
      st.setWorkflowView({ openStep: null, chosenSet: null, workflowMenu: null });
      // (and no pen's card over the talk: a pen writes over the slide as it is)
      set((prev: EditorState) => ({ ...prev, presenting: { at: Math.max(0, Math.min(n - 1, from)) }, talkInk: [], inkMode: null }));
    },
    presentAt: (at: number) =>
      set((prev: EditorState) => {
        if (!prev.presenting || at < 0 || at >= prev.slides.length || at === prev.presenting.at) return prev;
        // (a pen's writing over the slide goes as the slide does)
        return { ...prev, presenting: { at }, talkInk: [] };
      }),
    endPresenting: () => set((prev: EditorState) => (prev.presenting ? { ...prev, presenting: null, talkInk: [] } : prev)),
  };
}
