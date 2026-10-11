import { gestureStep } from "../../../../../lib/doc/document";
import type { StoreApi } from "zustand";
import type { DocumentStore } from "../../../../../lib/doc";
import * as ops from "../../document";
import type { WorkspaceDocument } from "../../document";
import type { EditorState, Shape, ShapePatch } from "../types";

type SetState = StoreApi<EditorState>["setState"];

/**
 * Shapes on the page (docs/PRESENTING.md, *Shapes*): edits to the document,
 * so that undo takes them back and Save keeps them; which are selected,
 * which is under the pointer and one being drawn, the view's.
 */
export function createShapesSlice(doc: DocumentStore<WorkspaceDocument>, set: SetState) {
  return {
    setHoveredShape: (id: number | null) => set((prev: EditorState) => (prev.hoveredShape === id ? prev : { ...prev, hoveredShape: id })),
    setShapeDraft: (draft: EditorState["shapeDraft"]) => set({ shapeDraft: draft }),
    selectShapes: (ids: Iterable<number>, add = false) =>
      set((prev: EditorState) => ({ ...prev, selShapes: new Set([...(add ? prev.selShapes : []), ...ids]) })),
    toggleShapeSel: (id: number) =>
      set((prev: EditorState) => {
        const selShapes = new Set(prev.selShapes);
        if (!selShapes.delete(id)) selShapes.add(id);
        return { ...prev, selShapes };
      }),
    addShape: (shape: Omit<Shape, "id">) => {
      const id = doc.getState().nextShapeId ?? 1;
      return doc.edit("add shape", (d) => ops.addShape(d, shape)) ? id : null;
    },
    updateShape: (id: number, patch: ShapePatch, gesture?: string) =>
      doc.edit(
        patch.tail ? "move callout's tail" : patch.x0 !== undefined || patch.x1 !== undefined || patch.y0 !== undefined || patch.y1 !== undefined ? "resize shape" : "change shape",
        (d) => ops.updateShape(d, id, patch),
        gesture ? gestureStep(`shape:${id}:${gesture}`) : {},
      ),
    styleShapes: (ids: readonly number[], patch: Pick<ShapePatch, "weight" | "dash" | "heads">) => doc.edit("change shapes' lines", (d) => ops.restyleShapes(d, ids, patch)),
    colourShapes: (ids: readonly number[], which: "stroke" | "fill", color: string | null, gesture?: string) =>
      doc.edit(which === "fill" ? "fill shapes" : "colour shapes' lines", (d) => ops.restyleShapes(d, ids, { [which]: color }), gesture ? { coalesceKey: `colour-shapes:${gesture}` } : undefined),
    orderShapes: (ids: readonly number[], front: boolean) => doc.edit(front ? "bring shapes to front" : "send shapes to back", (d) => ops.orderShapes(d, ids, front)),
    removeShape: (id: number) => {
      if (doc.edit("delete shape", (d) => ops.removeShapes(d, [id])))
        set((prev: EditorState) => ({ ...prev, hoveredShape: prev.hoveredShape === id ? null : prev.hoveredShape }));
    },
  };
}
