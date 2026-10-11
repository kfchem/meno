import type { StoreApi } from "zustand";
import type { DocumentStore } from "../../../../../lib/doc";
import * as ops from "../../document";
import type { WorkspaceDocument } from "../../document";
import type { Caption, EditorState, WordsFrom } from "../types";
import { marksAll, stylesOf, toggled, type WordsMark } from "../../../../../lib/chem/captions";

type SetState = StoreApi<EditorState>["setState"];

/** How many writings of words have been opened: each its own number. */
let writings = 0;

/**
 * Words on the page (lib/chem/captions): edits to the document, so that
 * undo takes them back and Save keeps them; which are under the pointer,
 * being written, and the icons a double-click opens, the view's.
 */
export function createCaptionsSlice(doc: DocumentStore<WorkspaceDocument>, set: SetState) {
  return {
    setHoveredCaption: (id: number | null) => set({ hoveredCaption: id }),
    selectCaptions: (ids: Iterable<number>, add = false) =>
      set((prev: EditorState) => ({ ...prev, selCaptions: new Set([...(add ? prev.selCaptions : []), ...ids]), pdfSel: null, pdfBox: null })),
    setCaptionEdit: (edit: EditorState["captionEdit"]) => set({ captionEdit: edit && { ...edit, n: edit.n ?? ++writings } }),
    markCaptionDrawn: (n: number) =>
      set((prev: EditorState) => (prev.captionEdit?.n === n && !prev.captionEdit.drawn ? { ...prev, captionEdit: { ...prev.captionEdit, drawn: true } } : prev)),
    leaveCaptionEdit: (n: number, id: number | null) =>
      set((prev: EditorState) => {
        const edit = prev.captionEdit;
        if (edit?.n !== n) return prev;
        return { ...prev, captionEdit: null, captionLeft: id != null ? { id, n, at: edit.at } : prev.captionLeft };
      }),
    captionShown: (id: number) => set((prev: EditorState) => (prev.captionLeft?.id === id ? { ...prev, captionLeft: null } : prev)),
    setWordsWriting: (words: EditorState["wordsWriting"], n?: number) =>
      set((prev: EditorState) => {
        if (!words) return prev.wordsWriting && (n == null || prev.wordsWriting.n === n) ? { ...prev, wordsWriting: null } : prev;
        const w = prev.wordsWriting;
        // (the same words, where they were: nothing to draw again)
        if (w && w.n === words.n && w.arrow === words.arrow && w.x === words.x && w.y === words.y && w.halfW === words.halfW && w.halfH === words.halfH) return prev;
        return { ...prev, wordsWriting: words };
      }),
    setQuickAdd: (q: EditorState["quickAdd"]) => set({ quickAdd: q }),
    addCaption: (text: string, x: number, y: number, arrow?: number, from?: WordsFrom, width?: number, align?: Caption["align"], more?: { size?: number; marks?: WordsMark[]; shape?: number }) => {
      const id = doc.getState().nextCaptionId ?? 1;
      doc.edit("add text", (d) =>
        ops.addCaption(d, {
          text,
          x,
          y,
          ...(arrow != null ? { arrow } : {}),
          ...(from ? { from } : {}),
          ...(width != null && width > 0 ? { width } : {}),
          ...(align ? { align } : {}),
          ...(more?.size ? { size: more.size } : {}),
          ...(more?.marks?.length ? { marks: more.marks } : {}),
          ...(more?.shape != null ? { shape: more.shape } : {}),
        }),
      );
      return id;
    },
    updateCaption: (id: number, patch: Parameters<EditorState["updateCaption"]>[1], gesture?: string) =>
      doc.edit(
        patch.text != null
          ? "edit text"
          : patch.width !== undefined
            ? "resize text"
            : patch.align !== undefined
              ? "align text"
              : patch.size !== undefined
                ? "size text"
                : patch.marks !== undefined
                  ? "mark text"
                  : "move text",
        (d) => ops.updateCaption(d, id, patch),
        {
          ...(gesture ? { coalesceKey: `caption:${id}:${gesture}` } : {}),
        },
      ),
    // (all the letters of the words `ids` set otherwise, as one step: in a colour, or none of their own; bold, italic, raised or lowered - or, all of them so, not)
    colourWords: (ids: number[], color: string | null, gesture?: string) =>
      doc.edit("colour text", (d) => ops.markCaptions(d, ids, (c) => marksAll(c.text, c.marks, { color })), gesture ? { coalesceKey: `colour-words:${gesture}` } : undefined),
    styleWords: (ids: number[], side: "bold" | "italic" | "sup" | "sub") => {
      const take = new Set(ids);
      const all = doc.getState().captions?.filter((c) => take.has(c.id)).flatMap((c) => stylesOf(c.text.length, c.marks)) ?? [];
      const r = toggled(all, side);
      doc.edit("mark text", (d) => ops.markCaptions(d, ids, (c) => marksAll(c.text, c.marks, r)));
    },
    removeCaption: (id: number) => {
      if (doc.edit("delete text", (d) => ops.removeCaption(d, id)))
        set((prev: EditorState) => ({
          ...prev,
          hoveredCaption: prev.hoveredCaption === id ? null : prev.hoveredCaption,
          selCaptions: prev.selCaptions.has(id) ? new Set([...prev.selCaptions].filter((c) => c !== id)) : prev.selCaptions,
        }));
    },
  };
}
