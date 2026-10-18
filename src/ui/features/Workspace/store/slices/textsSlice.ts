import type { StoreApi } from "zustand";
import { pointOfStyle } from "../../restyle";
import type { DocumentStore } from "../../../../../lib/doc";
import * as ops from "../../document";
import type { WorkspaceDocument } from "../../document";
import type { EditorState, TextOf } from "../types";

type SetState = StoreApi<EditorState>["setState"];

/**
 * The texts the workspace holds: edits to the document, so that undo takes
 * them back and Save keeps them; which one its column shows is the view's
 * (store/index brings it along as they come and go).
 */
export function createTextsSlice(doc: DocumentStore<WorkspaceDocument>, set: SetState, getState: () => EditorState) {
  return {
    addTexts: (texts: Parameters<EditorState["addTexts"]>[0], onPage?: { x: number; y: number }) => {
      if (!texts.length) return;
      // (each a sheet on the page too, where it is to lie: a row of them there, clear of what lies there)
      const placed = onPage ? ops.textsInRow(texts, onPage, doc.getState(), pointOfStyle(doc.getState().style)) : texts;
      const { doc: next, last } = ops.addTexts(doc.getState(), placed);
      // (one with a sheet: into the column from its sheet, as it opens)
      const lastSheet = onPage && last != null && next.texts?.find((t) => t.id === last)?.at;
      if (next !== doc.getState()) doc.edit(texts.length > 1 ? "open texts" : "open text", () => next);
      set({ textShown: last, textsOpen: last != null, ...(lastSheet ? { textFlight: { id: last!, to: "column" as const, start: performance.now() } } : {}) });
    },
    newText: (onPage?: { x: number; y: number }) => {
      getState().addTexts([{ name: "", text: "" }], onPage);
      set({ textToWrite: getState().textShown });
    },
    wroteText: () => set({ textToWrite: null }),
    editText: (id: number, text: string) =>
      doc.edit("type text", (d) => ops.editText(d, id, text), { coalesceKey: `text:${id}` }),
    removeText: (id: number) => doc.edit("close text", (d) => ops.removeText(d, id)),
    removeTexts: (ids: Iterable<number>) => {
      const gone = new Set(ids);
      doc.edit(gone.size > 1 ? "delete texts" : "delete text", (d) => ops.removeTexts(d, gone));
      set((prev: EditorState) => ({ ...prev, selTexts: new Set([...prev.selTexts].filter((id) => !gone.has(id))), hoveredText: prev.hoveredText != null && gone.has(prev.hoveredText) ? null : prev.hoveredText }));
    },
    showText: (id: number) => set({ textShown: id, textsOpen: true, pdfShown: null }),
    // (read in the column: its tab there, as a PDF's is - not a step to undo; store/index shows it, as one come)
    readText: (id: number) => {
      const t = doc.getState().texts?.find((x) => x.id === id);
      if (!t) return;
      if (t.reading === false) doc.amend((d) => ops.setTextReading(d, id, true));
      // (rising from its sheet, where the column is not showing it already)
      set((prev: EditorState) => ({
        ...prev,
        textShown: id,
        textsOpen: true,
        pdfShown: null,
        ...(t.at && !(prev.textsOpen && prev.textShown === id && prev.pdfShown == null) ? { textFlight: { id, to: "column" as const, start: performance.now() } } : {}),
      }));
    },
    // (its tab closed: one with a sheet on the page lies there still; one without - an output, a log - goes)
    stopReadingText: (id: number) => {
      const t = doc.getState().texts?.find((x) => x.id === id);
      if (!t) return;
      // (the last read there, shown, with a sheet: back down to it as the column shuts)
      const st = getState();
      const last = st.textsOpen && st.textShown === id && st.pdfShown == null && !st.texts.some((x) => x.id !== id && x.reading !== false);
      if (t.at) doc.amend((d) => ops.setTextReading(d, id, false));
      else doc.edit("close text", (d) => ops.removeText(d, id));
      if (t.at && last) set({ textFlight: { id, to: "page", start: performance.now() } });
    },
    riseText: (id: number) => set({ textFlight: { id, to: "column", start: performance.now() } }),
    endTextFlight: () => set({ textFlight: null }),
    setTextIcon: (id: number, icon: boolean) => doc.edit(icon ? "minimize text" : "expand text", (d) => ops.setTextIcon(d, id, icon)),
    setTextOf: (id: number, of: TextOf) => doc.amend((d) => ops.setTextOf(d, id, of)),
    setHoveredText: (id: number | null) => set((prev: EditorState) => (prev.hoveredText === id ? prev : { ...prev, hoveredText: id })),
    // (only sheets on the page, as pictures)
    selectTexts: (ids: Iterable<number>, add = false) =>
      set((prev: EditorState) => ({ ...prev, selTexts: new Set([...(add ? prev.selTexts : []), ...[...ids].filter((id) => prev.texts.some((t) => t.id === id && t.at))]), pdfSel: null, pdfBox: null })),
    toggleTextSel: (id: number) =>
      set((prev: EditorState) => {
        const next = new Set(prev.selTexts);
        if (!next.delete(id)) next.add(id);
        return { ...prev, selTexts: next, pdfSel: null, pdfBox: null };
      }),
    // (a double-click on the canvas, the column open: the work comes back to the canvas, and Quick Add waits for the next)
    doubleClickOnEmpty: (q: NonNullable<EditorState["quickAdd"]>) => {
      if (getState().textsOpen) getState().closeTexts();
      else set({ quickAdd: q });
    },
    closeTexts: () =>
      set((prev: EditorState) => {
        // (a PDF shown: its page goes back down to it on the page as the column shuts - docs/PDF.md; a text, to its sheet)
        const pdf = prev.textsOpen && prev.pdfShown != null ? prev.pdfs.find((p) => p.id === prev.pdfShown) : undefined;
        // (whatever its body - a sheet, a molecule; one with none goes with the column: components/PdfColumn)
        const text = prev.textsOpen && prev.pdfShown == null ? prev.texts.find((t) => t.id === prev.textShown) : undefined;
        return {
          ...prev,
          textsOpen: false,
          columnFilled: false,
          ...(pdf ? { pdfFlight: { id: pdf.id, page: pdf.page, to: "page" as const, start: performance.now() } } : {}),
          ...(text ? { textFlight: { id: text.id, to: "page" as const, start: performance.now() } } : {}),
        };
      }),
  };
}
