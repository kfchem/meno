import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";

describe("a step's options changed, undone", () => {
  it("as one step for a run of changes to the same option close together - a number stepped by an arrow key held down - and apart for another option", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    const step = st().addStep("energy-window", "meno", 0, 0);
    const before = doc.history().undoDepth;
    for (const window of [3.5, 4, 4.5, 5]) st().updateStep(step, { options: { window } });
    expect(doc.history().undoDepth).toBe(before + 1);
    expect(doc.getState().steps?.find((s) => s.id === step)?.options).toMatchObject({ window: 5 });
    st().updateStep(step, { options: { window: 5, other: 1 } });
    expect(doc.history().undoDepth).toBe(before + 2);
    doc.undo();
    doc.undo();
    expect(doc.getState().steps?.find((s) => s.id === step)?.options?.window).not.toBe(5);
  });
});
