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

describe("a structure read put on the page, and the view", () => {
  const ring = () => ({
    atoms: [
      { id: 1, x: 40, y: 0, r: 0.9, el: "C" },
      { id: 2, x: 41.5, y: 0.9, r: 0.9, el: "C" },
      { id: 3, x: 43, y: 0, r: 0.9, el: "C" },
    ],
    bonds: [
      { id: 4, a: 1, b: 2, order: 1 as const },
      { id: 5, a: 2, b: 3, order: 1 as const },
    ],
  });

  it("carried out of a PDF and let go on the page, a second one too, is where the chemist put it: the view is not asked to move", () => {
    const { st } = editor();
    const before = st().showRequest;
    st().putRead(ring(), undefined, true);
    st().putRead({ ...ring(), atoms: ring().atoms.map((a) => ({ ...a, y: a.y - 8 })) }, undefined, true);
    expect(st().showRequest).toBe(before);
    expect(st().model.atoms.length).toBe(6);
    // (selected all the same, the last one put down)
    expect(st().sel.atoms.size).toBe(3);
  });

  it("put down where Meno chose its place, is still shown", () => {
    const { st } = editor();
    const n = st().showRequest?.n ?? 0;
    st().putRead(ring());
    expect(st().showRequest?.n).toBe(n + 1);
    expect(st().showRequest?.box).toBeTruthy();
  });
});
