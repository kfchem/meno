import type { StoreApi } from "zustand";
import type { DocumentStore } from "../../../../../lib/doc";
import * as ops from "../../document";
import type { WorkspaceDocument } from "../../document";
import type { EditorState, RecordSwap } from "../types";
import { recordsGathered, recordsGrid, recordsOf, shownModel, shownRecord, STACK_SWAP_MS } from "../../utils/stacks";

type SetState = StoreApi<EditorState>["setState"];
type GetState = StoreApi<EditorState>["getState"];

/**
 * Stacks of drawings (utils/stacks): which record each shows, the view's -
 * the drawing as shown, the store's `model`, made again from the whole as it
 * changes - and laying one out as a grid, or stacking it again, an edit to
 * the document.
 */
export function createRecordsSlice(doc: DocumentStore<WorkspaceDocument>, set: SetState, get: GetState) {
  // (a stack gone over to the next: drawn by the drawing again)
  const done = (stack: number, swap: RecordSwap) => {
    if (get().recordSwaps[stack] !== swap) return;
    setTimeout(() => {
      set((prev: EditorState) => {
        if (prev.recordSwaps[stack] !== swap) return prev;
        const { [stack]: _done, ...recordSwaps } = prev.recordSwaps;
        return { ...prev, recordSwaps };
      });
    }, STACK_SWAP_MS);
  };
  return {
    showRecord: (stack: number, record: number) => {
      const swap = { from: [] as number[], to: [] as number[], start: performance.now() };
      set((prev: EditorState) => {
        const was = shownRecord(prev.fullModel, stack, prev.recordsShown);
        const records = recordsOf(prev.fullModel, stack);
        const next = records.find((r) => r.record === record);
        if (was === record || !next || prev.fullModel.atoms.some((a) => a.stack?.id === stack && a.stack.spread)) return prev;
        const recordsShown = { ...prev.recordsShown, [stack]: record };
        const model = shownModel(prev.fullModel, recordsShown);
        // (going over to it: the one let go of going, the next coming - components/StackSwap2D)
        const gone = new Set(records.find((r) => r.record === was)?.atoms ?? []);
        swap.from = [...gone];
        swap.to = next.atoms;
        const recordSwaps = { ...prev.recordSwaps, [stack]: swap };
        const hovered = (prev.hovered.atomId != null && gone.has(prev.hovered.atomId)) || (prev.hovered.bondId != null && !model.bonds.some((b) => b.id === prev.hovered.bondId)) ? { atomId: null, bondId: null } : prev.hovered;
        // (selected, the one shown now is, in place of the one out of sight)
        if (![...prev.sel.atoms].some((id) => gone.has(id))) return { ...prev, recordsShown, model, recordSwaps, hovered };
        const came = new Set(next.atoms);
        const atoms = new Set([...prev.sel.atoms].filter((id) => !gone.has(id)).concat(next.atoms));
        const bonds = new Set([...prev.sel.bonds].filter((id) => model.bonds.some((b) => b.id === id)));
        for (const b of model.bonds) if (came.has(b.a) && came.has(b.b)) bonds.add(b.id);
        return { ...prev, recordsShown, model, recordSwaps, hovered, sel: { atoms, bonds }, selAnchor: prev.selAnchor != null && gone.has(prev.selAnchor) ? null : prev.selAnchor };
      });
      done(stack, swap);
    },
    spreadRecords: (stack: number) => {
      const { fullModel } = get();
      const records = recordsOf(fullModel, stack);
      if (records.length < 2 || fullModel.atoms.some((a) => a.stack?.id === stack && a.stack.spread)) return;
      doc.edit("lay out as a grid", (d) => ops.spreadRecords(d, stack, recordsGrid(d.model, stack)));
    },
    gatherRecords: (stack: number, shown: number) => {
      const { fullModel } = get();
      const records = recordsOf(fullModel, stack);
      if (records.length < 2 || !fullModel.atoms.some((a) => a.stack?.id === stack && a.stack.spread)) return;
      // (the one to show said before it is stacked: the drawing as shown is
      // then that at once - and the others go out of sight where they stood,
      // as one let go of in a stack goes: components/StackSwap2D)
      const ids = new Set(records.flatMap((r) => (r.record === shown ? [] : r.atoms)));
      const gone = { atoms: fullModel.atoms.filter((a) => ids.has(a.id)), bonds: fullModel.bonds.filter((b) => ids.has(b.a) && ids.has(b.b)) };
      const swap = { from: [...ids], to: [], start: performance.now(), gone };
      set((prev: EditorState) => ({ ...prev, recordsShown: { ...prev.recordsShown, [stack]: shown }, recordSwaps: { ...prev.recordSwaps, [stack]: swap } }));
      doc.edit("stack again", (d) => ops.gatherRecords(d, stack, recordsGathered(d.model, stack)));
      done(stack, swap);
    },
  };
}
