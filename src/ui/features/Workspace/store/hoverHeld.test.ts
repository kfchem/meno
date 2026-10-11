import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { addMolecule3d, createWorkspaceDocument } from "../document";
import { holdPicture } from "../../../../lib/picture/held";

/**
 * What is under the pointer, when an undo takes it away with the pointer
 * resting on it: forgotten, each kind of thing on the page - the pointer
 * has not moved, so nothing else says so, and its light would stay where it
 * was, a key acting on what is gone.
 */
function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, state: () => store.getState() };
}

const water = {
  atoms: [
    { el: "O", x: 0, y: 0, z: 0 },
    { el: "H", x: 0.76, y: 0.59, z: 0 },
    { el: "H", x: -0.76, y: 0.59, z: 0 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
};

/** A PNG's signature, its header and its end: what Meno takes to be a picture. */
function png(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 8, 0, 0, 0, 8, 8, 6, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0]);
}

describe("what is under the pointer, an undo taking it away", () => {
  it("is forgotten: a reaction arrow, a plus, words", () => {
    const { doc, state } = editor();
    const arrow = state().addArrow(0, 0);
    state().setHoveredArrow(arrow);
    doc.undo();
    expect(state().hoveredArrow).toBeNull();
    const plus = state().addPlus(0, 0);
    state().setHoveredPlus(plus);
    doc.undo();
    expect(state().hoveredPlus).toBeNull();
    const words = state().addCaption("K2CO3", 0, 0);
    state().setHoveredCaption(words);
    doc.undo();
    expect(state().hoveredCaption).toBeNull();
  });

  it("is forgotten: a PDF, a picture", async () => {
    const { doc, state } = editor();
    state().addPdfs([{ name: "paper.pdf", sha256: "a".repeat(64), pages: [[595, 842]] }], { x: 0, y: 0 });
    state().setHoveredPdf(state().pdfs[0].id);
    doc.undo();
    expect(state().hoveredPdf).toBeNull();
    const p = (await holdPicture(png()))!;
    const [picture] = state().addPictures([{ name: "figure.png", sha256: p.sha256, media: p.media, width: p.width, height: p.height }], { x: 0, y: 0 });
    state().setHoveredPicture(picture);
    doc.undo();
    expect(state().hoveredPicture).toBeNull();
  });

  it("is forgotten: a molecule in 3D, and an atom of it", () => {
    const { doc, state } = editor();
    doc.edit("add", (d) => addMolecule3d(d, { ...water, at: { x: 0, y: 0 } }));
    const id = state().molecules3d[0].id;
    state().setHovered3d({ id });
    state().setHoveredAtom3d(id, 1);
    doc.undo();
    expect(state().hovered3d).toBeNull();
    expect(state().hoveredAtom3d).toBeNull();
  });

  it("is forgotten: a charge's mark, its atom gone", () => {
    const { doc, state } = editor();
    const atom = state().addAtom(0, 0, "N");
    state().setHoveredMark({ atom, kind: "charge" });
    doc.undo();
    expect(state().hoveredMark).toBeNull();
  });

  it("is kept where it is still there", () => {
    const { doc, state } = editor();
    const arrow = state().addArrow(0, 0);
    state().setHoveredArrow(arrow);
    state().addPlus(5, 5);
    doc.undo();
    expect(state().hoveredArrow).toBe(arrow);
  });
});
