import { gestureStep } from "../../../../../lib/doc/document";
import type { StoreApi } from "zustand";
import type { DocumentStore } from "../../../../../lib/doc";
import * as ops from "../../document";
import type { WorkspaceDocument } from "../../document";
import type { EditorState, PictureItem, PictureToAdd } from "../types";

type SetState = StoreApi<EditorState>["setState"];

/**
 * Pictures on the page (docs/PDF.md, *A picture*): edits to the document,
 * so that undo takes them back and Save keeps them; which are selected and
 * which is under the pointer, the view's.
 */
export function createPicturesSlice(doc: DocumentStore<WorkspaceDocument>, set: SetState) {
  return {
    setHoveredPicture: (id: number | null) => set({ hoveredPicture: id }),
    // (only those on the page: a long press held on one an undo took away selects nothing when its time comes)
    selectPictures: (ids: Iterable<number>, add = false) =>
      set((prev: EditorState) => ({ ...prev, selPictures: new Set([...(add ? prev.selPictures : []), ...[...ids].filter((id) => prev.pictures.some((p) => p.id === id))]) })),
    togglePictureSel: (id: number) =>
      set((prev: EditorState) => {
        const selPictures = new Set(prev.selPictures);
        if (selPictures.has(id)) selPictures.delete(id);
        else selPictures.add(id);
        return { ...prev, selPictures };
      }),
    addPictures: (pictures: PictureToAdd[], at: { x: number; y: number }, just = false) => {
      // (clear of what lies there already, not over it - unless put down just there)
      const inRow = ops.picturesInRow(pictures, at);
      const row = just ? inRow : ops.clearOfPictures(inRow, doc.getState());
      if (!row.length) return [];
      const first = doc.getState().nextPictureId ?? 1;
      if (!doc.edit(row.length > 1 ? "add pictures" : "add picture", (d) => row.reduce(ops.addPicture, d))) return [];
      // (selected, as what is pasted is, to be moved straight on)
      const ids = row.map((_, i) => first + i);
      set((prev: EditorState) => ({ ...prev, sel: { atoms: new Set(), bonds: new Set() }, sel3d: new Set(), selPictures: new Set(ids) }));
      return ids;
    },
    putPicture: (picture: Omit<PictureItem, "id">) => {
      // (where it was made for, clear of what lies there already - moved along to the right)
      const [placed] = ops.clearOfPictures([picture], doc.getState());
      const id = doc.getState().nextPictureId ?? 1;
      // (the view eased to it as it was begun: not again as it lands)
      set((prev: EditorState) => ({ ...prev, picturesLaid: new Set([...prev.picturesLaid, id]) }));
      return doc.edit(placed.media === "video/mp4" ? "add film" : "add picture", (d) => ops.addPicture(d, placed)) ? id : null;
    },
    updatePicture: (id: number, patch: Partial<Pick<PictureItem, "x" | "y" | "w" | "h" | "turn">>, gesture?: string) =>
      doc.edit(
        patch.w !== undefined || patch.h !== undefined ? "resize picture" : patch.turn !== undefined ? "turn picture" : "move picture",
        (d) => ops.updatePicture(d, id, patch),
        gesture ? gestureStep(`picture:${id}:${gesture}`) : {},
      ),
    removePicture: (id: number) => {
      if (doc.edit("delete picture", (d) => ops.removePictures(d, [id])))
        set((prev: EditorState) => ({ ...prev, hoveredPicture: prev.hoveredPicture === id ? null : prev.hoveredPicture }));
    },
  };
}
