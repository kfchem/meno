import type { StoreApi } from "zustand";
import type { DocumentStore } from "../../../../../lib/doc";
import * as ops from "../../document";
import type { WorkspaceDocument } from "../../document";
import type { EditorState } from "../types";
import { recordsGathered, recordsGrid, recordsOf, shownModel, shownRecord } from "../../utils/stacks";

type SetState = StoreApi<EditorState>["setState"];
type GetState = StoreApi<EditorState>["getState"];

/**
 * Stacks of drawings (utils/stacks): which record each shows, the view's -
 * the drawing as shown, the store's `model`, made again from the whole as it
 * changes - and laying one out as a grid, or stacking it again, an edit to
 * the document.
 */
export function createRecordsSlice(doc: DocumentStore<WorkspaceDocument>, set: SetState, get: GetState) {
  return {
    showRecord: (stack: number, record: number) =>
      set((prev: EditorState) => {
        const was = shownRecord(prev.fullModel, stack, prev.recordsShown);
        const records = recordsOf(prev.fullModel, stack);
        const next = records.find((r) => r.record === record);
        if (was === record || !next || prev.fullModel.atoms.some((a) => a.stack?.id === stack && a.stack.spread)) return prev;
        const recordsShown = { ...prev.recordsShown, [stack]: record };
        const model = shownModel(prev.fullModel, recordsShown);
        // (selected, the one shown now is, in place of the one out of sight)
        const gone = new Set(records.find((r) => r.record === was)?.atoms ?? []);
        if (![...prev.sel.atoms].some((id) => gone.has(id))) return { ...prev, recordsShown, model };
        const came = new Set(next.atoms);
        const atoms = new Set([...prev.sel.atoms].filter((id) => !gone.has(id)).concat(next.atoms));
        const bonds = new Set([...prev.sel.bonds].filter((id) => model.bonds.some((b) => b.id === id)));
        for (const b of model.bonds) if (came.has(b.a) && came.has(b.b)) bonds.add(b.id);
        return { ...prev, recordsShown, model, sel: { atoms, bonds }, selAnchor: prev.selAnchor != null && gone.has(prev.selAnchor) ? null : prev.selAnchor };
      }),
    spreadRecords: (stack: number) => {
      const { fullModel } = get();
      const records = recordsOf(fullModel, stack);
      if (records.length < 2 || fullModel.atoms.some((a) => a.stack?.id === stack && a.stack.spread)) return;
      doc.edit("lay out as a grid", (d) => ops.spreadRecords(d, stack, recordsGrid(d.model, stack)));
    },
    gatherRecords: (stack: number, shown: number) => {
      const { fullModel } = get();
      if (recordsOf(fullModel, stack).length < 2 || !fullModel.atoms.some((a) => a.stack?.id === stack && a.stack.spread)) return;
      // (the one to show said before it is stacked: the drawing as shown is then that at once)
      set((prev: EditorState) => ({ ...prev, recordsShown: { ...prev.recordsShown, [stack]: shown } }));
      doc.edit("stack again", (d) => ops.gatherRecords(d, stack, recordsGathered(d.model, stack)));
    },
  };
}
