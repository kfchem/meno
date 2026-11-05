import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import { changeSet } from "../../../../lib/doc/document";

describe("a change set made through the store's own calls", () => {
  it("is one step to undo, said as its maker's, never joined to the person's edits before or after it", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    // (the person's: a step of an energy window, its window set)
    const own = st().addStep("energy-window", "meno", 0, 0);
    st().updateStep(own, { options: { window: 4 } });
    const before = doc.history().undoDepth;
    let made: { set: number; step: number } | undefined;
    // (a set, a step in it, a wire and the step's options: each call its own edit, as the person makes them)
    doc.actAs("conversation", changeSet("conversation:1:1", "a conversation, by a test model"), () => {
      const set = st().addSet({ x0: -3, y0: -3, x1: 3, y1: 3 });
      const step = st().addStep("energy-window", "meno", 10, 0);
      st().connect({ set }, step);
      st().updateStep(step, { options: { window: 2.5 } });
      made = { set, step };
    });
    expect(doc.history()).toMatchObject({ undoDepth: before + 1, undoLabel: "conversation", undoBy: "a conversation, by a test model" });
    expect(doc.getState().steps?.find((s) => s.id === made!.step)?.options).toMatchObject({ window: 2.5 });
    expect(doc.getState().wires?.length).toBe(1);
    // (the person's next change, the same kind as one in the change set: a step of their own)
    st().updateStep(made!.step, { options: { window: 3 } });
    expect(doc.history().undoDepth).toBe(before + 2);
    expect(doc.history().undoBy).toBeUndefined();
    doc.undo();
    // (one undo takes the whole change set back - and only it: the person's step and window stay)
    doc.undo();
    const after = doc.getState();
    expect(after.steps?.map((s) => s.id)).toEqual([own]);
    expect(after.steps?.[0].options).toMatchObject({ window: 4 });
    expect(after.wires ?? []).toEqual([]);
    expect(st().sets.some((b) => b.id === made!.set)).toBe(false);
    // (and back again, as one)
    doc.redo();
    expect(doc.getState().steps).toHaveLength(2);
    expect(doc.history().undoBy).toBe("a conversation, by a test model");
  });
});
