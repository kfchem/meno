import { gestureStep } from "../../../../../lib/doc/document";
import type { StoreApi } from "zustand";
import type { DocumentStore } from "../../../../../lib/doc";
import * as ops from "../../document";
import type { WorkspaceDocument } from "../../document";
import type { Cycle, EditorState } from "../types";

type SetState = StoreApi<EditorState>["setState"];

/**
 * Catalytic cycles on the page (lib/chem/cycle; docs/EDITOR-2D.md,
 * *Catalytic cycles*): edits to the document, so that undo takes them back
 * and Save keeps them; which are selected and which is under the pointer,
 * the view's.
 */
export function createCyclesSlice(doc: DocumentStore<WorkspaceDocument>, set: SetState) {
  return {
    setHoveredCycle: (id: number | null) => set((prev: EditorState) => (prev.hoveredCycle === id ? prev : { ...prev, hoveredCycle: id })),
    selectCycles: (ids: Iterable<number>, add = false) =>
      set((prev: EditorState) => ({ ...prev, selCycles: new Set([...(add ? prev.selCycles : []), ...[...ids].filter((id) => prev.cycles.some((c) => c.id === id))]) })),
    addCycle: (cycle: Omit<Cycle, "id">) => {
      const id = doc.getState().nextCycleId ?? 1;
      return doc.edit("add cycle", (d) => ops.addCycle(d, cycle)) ? id : null;
    },
    updateCycle: (id: number, patch: ops.CyclePatch, gesture?: string) =>
      doc.edit(patch.ccw !== undefined ? "turn cycle round" : patch.branches ? "change cycle's arrows" : "change cycle", (d) => ops.updateCycle(d, id, patch), gesture ? gestureStep(`cycle:${id}:${gesture}`) : {}),
    removeCycle: (id: number) => {
      if (doc.edit("delete cycle", (d) => ops.removeCycles(d, [id])))
        set((prev: EditorState) => ({ ...prev, hoveredCycle: prev.hoveredCycle === id ? null : prev.hoveredCycle }));
    },
  };
}
