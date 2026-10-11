import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import { centredAt, readRecord } from "../utils/copyPaste";

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, store, state: () => store.getState() };
}

describe("a copy of slides, shapes with words, a structure and words, pasted together", () => {
  it("comes back whole, one step, its words in its shapes as they are numbered here, all of it selected", () => {
    const { doc, state } = editor();
    // (something there already, so that what is pasted is numbered on)
    state().addShape({ kind: "rect", x0: 0, y0: 0, x1: 1, y1: 1 });
    state().addCaption("there", 50, 50);
    const part = {
      atoms: [
        { id: 1, x: 0, y: 0, el: "C" },
        { id: 2, x: 1.8, y: 0, el: "O" },
      ],
      bonds: [{ id: 3, a: 1, b: 2, order: 1 as const }],
      slides: [{ id: 4, x: 0, y: 0, w: 32, h: 18 }],
      shapes: [{ id: 9, kind: "rounded" as const, x0: -5, y0: 5, x1: 5, y1: 9 }],
      captions: [
        { id: 2, x: 0, y: 7, text: "in the box", width: 9, shape: 9 },
        { id: 3, x: 0, y: -6, text: "below" },
      ],
    };
    const depth = doc.history().undoDepth;
    // (as Meno's own record of a copy carries them)
    state().pasteModel(centredAt(readRecord(JSON.stringify({ format: "meno-structure", version: 1, ...part }))!, { x: 100, y: 0 }));
    expect(doc.history().undoDepth).toBe(depth + 1);
    expect(state().model.atoms).toHaveLength(2);
    expect(state().slides).toHaveLength(1);
    expect(state().shapes).toHaveLength(2);
    const box = state().shapes[1];
    const inBox = state().captions.find((c) => c.text === "in the box")!;
    expect(inBox.shape).toBe(box.id);
    // (about the box's middle, where it now is)
    expect(inBox.x).toBeCloseTo((box.x0 + box.x1) / 2);
    expect([...state().selShapes]).toEqual([box.id]);
    expect(state().selSlides.size).toBe(1);
    expect(state().sel.atoms.size).toBe(2);
    doc.undo();
    expect(state().shapes).toHaveLength(1);
    expect(state().captions.map((c) => c.text)).toEqual(["there"]);
  });
});
