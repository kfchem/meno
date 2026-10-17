import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import { gestureUnderWay } from "./gesture";

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, st: () => store.getState() };
}

// A finger's press that a second finger, come down soon after, makes the
// start of a pinch: whatever it did is taken back without a trace.
describe("a press taken back, a pinch's first finger", () => {
  it("leaves no bond, no move, no selection, and nothing to redo", () => {
    const { doc, st } = editor();
    const a = st().addAtom(0, 0);
    const b = st().addAtom(1.8, 0);
    st().setSel({ atoms: new Set([a]), bonds: new Set() });
    const before = doc.getState();
    const depth = doc.history().undoDepth;
    const redo = doc.history().redoDepth;

    // the finger comes down on atom b: it selects b, draws a bond from it, and starts to move a
    st().notePress();
    st().setSel({ atoms: new Set([b]), bonds: new Set() });
    st().addBond(a, b, 1);
    st().moveAtom(a, 0.4, 0.3);
    st().moveAtom(a, 0.6, 0.5);
    st().startChainAt(2, 2, true);
    expect(gestureUnderWay(st())).toBe(true);
    expect(st().model.bonds).toHaveLength(1);

    expect(st().takeBackPress()).toBe(true);
    expect(doc.getState()).toBe(before);
    expect(st().model.bonds).toHaveLength(0);
    expect(st().model.atoms.find((x) => x.id === a)).toMatchObject({ x: 0, y: 0 });
    expect([...st().sel.atoms]).toEqual([a]);
    expect(gestureUnderWay(st())).toBe(false);
    expect(doc.history().undoDepth).toBe(depth);
    expect(doc.history().redoDepth).toBe(redo);
    // (and undo goes on from before it: the second atom, then the first)
    doc.undo();
    expect(st().model.atoms).toHaveLength(1);
  });

  it("takes back an edit that came together with the step before it, by its state", () => {
    const { doc, st } = editor();
    const a = st().addAtom(0, 0);
    st().moveAtom(a, 1, 0);
    const before = doc.getState();
    st().notePress();
    // (the same atom moved again at once: one step with the move before)
    st().moveAtom(a, 2, 0);
    expect(st().takeBackPress()).toBe(true);
    expect(doc.getState()).toBe(before);
  });

  it("is nothing where no press was noted, or once taken back", () => {
    const { doc, st } = editor();
    st().addAtom(0, 0);
    const before = doc.getState();
    expect(st().takeBackPress()).toBe(false);
    st().notePress();
    expect(st().takeBackPress()).toBe(true);
    expect(st().takeBackPress()).toBe(false);
    expect(doc.getState()).toBe(before);
  });
});
