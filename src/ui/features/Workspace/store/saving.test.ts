import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, state: () => store.getState() };
}

describe("Save, while the workspace changes as it is written", () => {
  it("leaves what changed while it was written unsaved - words typed on, a job's results - so that closing asks", () => {
    const { doc, state } = editor();
    state().addCaption("K2CO3, DMF", 0, 0);
    // (Save begins: what is written is the workspace as it is now)
    const written = state().writing();
    // (meanwhile, more words)
    state().addCaption("80 °C", 0, 2);
    state().markSavedAs("/tmp/a.meno", written);
    expect(state().savedPath).toBe("/tmp/a.meno");
    expect(doc.history().dirty).toBe(true);
  });

  it("is saved where nothing changed as it was written", () => {
    const { doc, state } = editor();
    state().addCaption("K2CO3, DMF", 0, 0);
    const written = state().writing();
    state().markSavedAs("/tmp/a.meno", written);
    expect(doc.history().dirty).toBe(false);
  });
});
