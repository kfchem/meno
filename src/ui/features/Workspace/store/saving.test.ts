import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import { turnsOf } from "../../../../lib/doc/saveTurns";

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

describe("Save asked for again while it writes", () => {
  it("writes once more, after, with what changed meanwhile - and only then is the workspace saved", async () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const state = () => store.getState();
    const files: string[][] = [];
    const holds: (() => void)[] = [];
    // (as Save writes: the workspace as it is as it begins, held at the disk until let go)
    const save = () =>
      turnsOf(store)("save", async () => {
        const written = state().writing();
        const words = state().captions.map((c) => c.text);
        await new Promise<void>((go) => holds.push(go));
        files.push(words);
        state().markSavedAs("/tmp/a.meno", written);
        return true;
      });
    state().addCaption("K2CO3, DMF", 0, 0);
    const first = save();
    await new Promise((r) => setTimeout(r, 0));
    state().addCaption("80 \u00b0C", 0, 2);
    const again = [save(), save()];
    holds[0]();
    await first;
    // (written as it was: what came after it is still unsaved)
    expect(doc.history().dirty).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    holds[1]();
    expect(await Promise.all(again)).toEqual([true, true]);
    expect(files).toEqual([["K2CO3, DMF"], ["K2CO3, DMF", "80 \u00b0C"]]);
    expect(holds.length).toBe(2);
    expect(doc.history().dirty).toBe(false);
  });
});
