import type { StoreApi } from "zustand";
import type { DocumentStore } from "../../../../../lib/doc";
import * as ops from "../../document";
import type { WorkspaceDocument } from "../../document";
import type { EditorState, InkLook } from "../types";
import type { InkStroke } from "../../../../../lib/chem/ink";

type SetState = StoreApi<EditorState>["setState"];

/**
 * Writing by hand on the page (docs/PRESENTING.md, *Handwriting*): edits to
 * the document, a stroke at a time, so that undo takes them back and Save
 * keeps them; which pieces are selected, which is under the pointer, the
 * pen's card and the stroke being written, the view's.
 */
export function createInksSlice(doc: DocumentStore<WorkspaceDocument>, set: SetState) {
  return {
    setInkMode: (mode: EditorState["inkMode"]) => set({ inkMode: mode }),
    setInkDraft: (draft: EditorState["inkDraft"]) => set({ inkDraft: draft }),
    setHoveredInk: (id: number | null) => set((prev: EditorState) => (prev.hoveredInk === id ? prev : { ...prev, hoveredInk: id })),
    // (only those there: an id an undo has taken away is no selection - as for shapes)
    selectInks: (ids: Iterable<number>, add = false) =>
      set((prev: EditorState) => ({ ...prev, selInks: new Set([...(add ? prev.selInks : []), ...[...ids].filter((id) => prev.inks.some((k) => k.id === id))]) })),
    toggleInkSel: (id: number) =>
      set((prev: EditorState) => {
        const selInks = new Set(prev.selInks);
        if (!selInks.delete(id)) selInks.add(id);
        return { ...prev, selInks };
      }),
    writeStroke: (look: InkLook, stroke: InkStroke, join?: number | null) => {
      const before = doc.getState();
      const piece = join != null ? before.inks?.find((k) => k.id === join) : undefined;
      const fresh = before.nextInkId ?? 1;
      if (!doc.edit("write", (d) => ops.addInkStroke(d, look, stroke, join))) return null;
      // (on the piece it joined, if it did)
      return piece && doc.getState().inks?.find((k) => k.id === piece.id)?.strokes.length !== piece.strokes.length ? piece.id : fresh;
    },
    eraseStrokes: (cuts: readonly { id: number; index: number }[], gesture?: string) =>
      doc.edit("rub out", (d) => ops.removeInkStrokes(d, cuts), gesture ? { coalesceKey: `erase:${gesture}` } : undefined),
    colourInks: (ids: readonly number[], color: string | null, gesture?: string) =>
      doc.edit("colour writing", (d) => ops.colourInks(d, ids, color), gesture ? { coalesceKey: `colour-inks:${gesture}` } : undefined),
    writePdfStroke: (pdf: number, page: number, look: InkLook, stroke: InkStroke, join?: number | null) => {
      const before = doc.getState().pdfs?.find((p) => p.id === pdf)?.inks ?? [];
      if (!doc.edit("write", (d) => ops.addPdfInkStroke(d, pdf, page, look, stroke, join))) return null;
      const after = doc.getState().pdfs?.find((p) => p.id === pdf)?.inks ?? [];
      // (the piece it joined, or the one it made)
      return after.length > before.length ? after.length - 1 : (join ?? null);
    },
    erasePdfStrokes: (cuts: readonly { pdf: number; piece: number; index: number }[], gesture?: string) =>
      doc.edit("rub out", (d) => ops.removePdfInkStrokes(d, cuts), gesture ? { coalesceKey: `erase:${gesture}` } : undefined),
    writeTalkStroke: (look: InkLook, stroke: InkStroke) => set((prev: EditorState) => ({ ...prev, talkInk: [...prev.talkInk, { look, stroke }] })),
    eraseTalkStrokes: (indices: readonly number[]) =>
      set((prev: EditorState) => {
        if (!indices.length) return prev;
        const gone = new Set(indices);
        return { ...prev, talkInk: prev.talkInk.filter((_, i) => !gone.has(i)) };
      }),
    removeInk: (id: number) => {
      if (doc.edit("delete writing", (d) => ops.removeInks(d, [id])))
        set((prev: EditorState) => ({ ...prev, hoveredInk: prev.hoveredInk === id ? null : prev.hoveredInk }));
    },
  };
}
