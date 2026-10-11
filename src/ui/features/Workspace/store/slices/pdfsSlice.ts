import type { StoreApi } from "zustand";
import type { DocumentStore } from "../../../../../lib/doc";
import * as ops from "../../document";
import type { WorkspaceDocument } from "../../document";
import type { EditorState } from "../types";

type SetState = StoreApi<EditorState>["setState"];

/**
 * PDFs on the page (docs/PDF.md): edits to the document, so that undo takes
 * them back and Save keeps them; which is under the pointer, the view's.
 * Where each is read in the column is kept with it too, but is no step to
 * undo, as where a text is scrolled to is none: it is amended into every
 * state the document has been in.
 */
export function createPdfsSlice(doc: DocumentStore<WorkspaceDocument>, set: SetState, get: () => EditorState) {
  return {
    setHoveredPdf: (id: number | null) => set({ hoveredPdf: id }),
    setLitPdf: (id: number | null) => set({ litPdf: id }),
    setColumnWidth: (px: number) => set({ columnWidth: px }),
    setPdfColumnWidth: (px: number) => set({ pdfColumnWidth: px }),
    readPdf: (id: number) => {
      const pdf = get().pdfs.find((p) => p.id === id);
      if (!pdf) return;
      // (from its page on top; read before, from where it was left)
      if (!pdf.reading) doc.amend((d) => ops.updatePdf(d, id, { reading: { at: pdf.page, zoom: 1 } }));
      const open = get().textsOpen && get().pdfShown === id;
      set({ pdfShown: id, textsOpen: true, ...(open ? {} : { pdfFlight: { id, page: pdf.page, to: "column", start: performance.now() } }) });
    },
    showPdf: (id: number) => set({ pdfShown: id, textsOpen: true }),
    stopReadingPdf: (id: number) => {
      const st = get();
      const pdf = st.pdfs.find((p) => p.id === id);
      if (!pdf?.reading) return;
      const seen = st.textsOpen && st.pdfShown === id;
      // (the column shows what else it holds - store/index - or shuts)
      doc.amend((d) => ops.updatePdf(d, id, { reading: null }));
      if (seen) set({ pdfFlight: { id, page: pdf.page, to: "page", start: performance.now() } });
    },
    setPdfReading: (id: number, reading: { at: number; zoom: number }) => doc.amend((d) => ops.updatePdf(d, id, { reading })),
    readToPage: (id: number, from: number, to: number) =>
      doc.amend((d) => (d.pdfs?.find((p) => p.id === id)?.page === from ? ops.updatePdf(d, id, { page: to }) : d)),
    endPdfFlight: () => set({ pdfFlight: null }),
    setPdfFind: (find: EditorState["pdfFind"]) => set({ pdfFind: find }),
    askPdfMenu: (ask: EditorState["menuAsk"]) => set({ menuAsk: ask }),
    setPdfFlash: (flash: EditorState["pdfFlash"]) => set({ pdfFlash: flash }),
    setPdfWords: (words: EditorState["pdfWords"]) => set({ pdfWords: words }),
    // (words selected let the drawing's selection go: one selection, what is copied)
    setPdfSel: (sel: EditorState["pdfSel"]) =>
      set((prev: EditorState) =>
        sel
          ? { ...prev, pdfSel: sel, pdfBox: null, sel: { atoms: new Set<number>(), bonds: new Set<number>() }, selAnchor: null, sel3d: new Set<number>(), chosen3d: null }
          : prev.pdfSel
            ? { ...prev, pdfSel: null }
            : prev,
      ),
    setPdfPicture: (flight: EditorState["pdfPicture"]) => set({ pdfPicture: flight }),
    // (a box drawn lets the words selected go, and the drawing's selection: one selection, what is copied)
    setPdfBox: (box: EditorState["pdfBox"]) =>
      set((prev: EditorState) =>
        box
          ? { ...prev, pdfBox: box, pdfSel: null, sel: { atoms: new Set<number>(), bonds: new Set<number>() }, selAnchor: null, sel3d: new Set<number>(), chosen3d: null, selPictures: new Set<number>(), selTexts: new Set<number>(), selCaptions: new Set<number>() }
          : prev.pdfBox
            ? { ...prev, pdfBox: null }
            : prev,
      ),
    addPdfs: (pdfs: Parameters<EditorState["addPdfs"]>[0], at: { x: number; y: number }) => {
      // (clear of the PDFs already there, not over them)
      const row = ops.clearOfPdfs(ops.pdfsInRow(pdfs, at), doc.getState().pdfs ?? []);
      if (row.length) doc.edit(row.length > 1 ? "add PDFs" : "add PDF", (d) => row.reduce(ops.addPdf, d));
    },
    movePdf: (id: number, x: number, y: number, gesture?: string) =>
      doc.edit("move PDF", (d) => ops.updatePdf(d, id, { x, y }), { ...(gesture ? { coalesceKey: `pdf:${id}:${gesture}` } : {}) }),
    turnPdf: (id: number, page: number) => doc.edit("turn page", (d) => ops.updatePdf(d, id, { page })),
    spreadPdf: (id: number, spread: boolean) => doc.edit(spread ? "spread pages" : "gather pages", (d) => ops.updatePdf(d, id, { spread, ...(spread ? { icon: false } : {}) })),
    placePdfPage: (id: number, page: number, x: number, y: number, gesture?: string) =>
      doc.edit("move page", (d) => ops.placePdfPage(d, id, page, x, y), { ...(gesture ? { coalesceKey: `pdf-page:${id}:${page}:${gesture}` } : {}) }),
    pdfPagesInRows: (id: number) => doc.edit("put pages in rows", (d) => ops.updatePdf(d, id, { placed: null })),
    // (made an icon, its pages gathered first)
    iconPdf: (id: number, icon: boolean) =>
      doc.edit(icon ? "minimize PDF" : "expand PDF", (d) => ops.updatePdf(d, id, { icon, ...(icon ? { spread: false } : {}) })),
    removePdf: (id: number) => {
      if (doc.edit("delete PDF", (d) => ops.removePdf(d, id))) set((prev: EditorState) => ({ ...prev, hoveredPdf: prev.hoveredPdf === id ? null : prev.hoveredPdf }));
    },
  };
}
