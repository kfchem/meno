import { describe, expect, it } from "vitest";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from ".";

/** A workspace with an ethanol drawn, its atoms selected; and its document. */
function drawn() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  const c1 = st().addAtom(0, 0, "C");
  const c2 = st().addAtom(1.5, 0, "C");
  const o = st().addAtom(2.25, 1.3, "O");
  st().addBond(c1, c2);
  st().addBond(c2, o);
  return { store, doc, st, atoms: [c1, c2, o] };
}

describe("a set made from a selection", () => {
  it("is one step to undo: its frame fitted to what it holds as the press that made it is let go is in that step - one undo takes the set away whole", () => {
    const { doc, st } = drawn();
    const before = doc.getState();
    const depth = doc.history().undoDepth;
    // (pressed on the menu's row, or the selection's port: the document as it was at the press - then the set made, then the press let go)
    const id = st().addSet({ x0: -0.93, y0: -0.71, x1: 3.11, y1: 2.07 });
    st().settleFrames(before);
    const made = doc.getState().sets?.find((b) => b.id === id);
    expect(made).toBeDefined();
    expect(doc.history().undoDepth).toBe(depth + 1);
    doc.undo();
    expect(doc.getState().sets ?? []).toEqual(before.sets ?? []);
    // (and a redo brings it back as it was settled)
    doc.redo();
    expect(doc.getState().sets?.find((b) => b.id === id)).toEqual(made);
  });
});
