import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, st: () => store.getState() };
}

describe("a scheme read put on the page", () => {
  it("comes in as one step - its structure, its arrow with its kind, its words over it - the words selected with the atoms", () => {
    const { doc, st } = editor();
    const depth = doc.history().undoDepth;
    st().putRead(
      { atoms: [{ id: 1, x: 0, y: 0, r: 0.9, el: "C" }, { id: 2, x: 1.8, y: 0, r: 0.9, el: "O" }], bonds: [{ id: 3, a: 1, b: 2, order: 1 }] },
      { arrows: [{ x: 6, y: 0, angle: 0, length: 4, kind: "equilibrium", corners: [{ along: 0.5, across: 1 }] }], pluses: [], captions: [{ x: 6, y: 1, text: "THF", arrowAt: 0 }, { x: 0, y: -2, text: "1", marks: [{ from: 0, to: 1, bold: true }] }] },
    );
    expect(doc.history().undoDepth).toBe(depth + 1);
    expect(st().arrows[0]).toMatchObject({ kind: "equilibrium", corners: [{ along: 0.5, across: 1 }] });
    expect(st().captions.find((c) => c.text === "THF")!.arrow).toBe(st().arrows[0].id);
    expect(st().sel.atoms.size).toBe(2);
    expect(st().selCaptions.size).toBe(2);
    doc.undo();
    expect(st().arrows).toEqual([]);
    expect(st().captions).toEqual([]);
  });
});
