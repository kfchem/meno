import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import { editorModelOf, processFileContent } from "../utils/io";
import { recordsOf } from "../utils/stacks";

/** Store wired to a document, the way a workspace tab is put together. */
function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, state: () => store.getState() };
}

const sdf = readFileSync(`${__dirname}/../../../../../scripts/gui/fixtures/conformance-three.sdf`, "utf8");

describe("an SD file opened into a workspace", () => {
  it("is added as a stack of its own beside one already there, its first record shown, one step to undo each", async () => {
    const { doc, state } = editor();
    for (let k = 0; k < 2; k++) {
      const read = await processFileContent("three.sdf", sdf);
      state().appendModel(editorModelOf(read.model), { arrows: [], pluses: [] });
    }
    const stacks = [...new Set(state().fullModel.atoms.map((a) => a.stack?.id).filter((s) => s != null))];
    expect(stacks).toHaveLength(2);
    for (const s of stacks) expect(recordsOf(state().fullModel, s!).map((r) => r.title)).toEqual(["ethanol", "propan-1-ol", "butan-1-ol"]);
    // (each shows its first record: ethanol's three atoms, twice)
    expect(state().model.atoms).toHaveLength(6);
    expect(doc.history().undoDepth).toBe(2);
    doc.undo();
    expect(new Set(state().fullModel.atoms.map((a) => a.stack?.id)).size).toBe(1);
  });
});
