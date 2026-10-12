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

/**
 * A long press on a picture takes hold of it - selects it - a moment after
 * the press: an undo meanwhile, taking the picture away, left it selected,
 * gone, when that moment came.
 */
describe("a picture or a PDF an undo took away", () => {
  it("is not selected when a long press on it comes to take hold of it", async () => {
    const { doc, state } = editor();
    const p = (await holdPicture(png()))!;
    const [picture] = state().addPictures([{ name: "figure.png", sha256: p.sha256, media: p.media, width: p.width, height: p.height }], { x: 0, y: 0 });
    state().clearSel();
    doc.undo();
    state().selectPictures([picture]);
    expect(state().selPictures.size).toBe(0);
    state().addPdfs([{ name: "paper.pdf", sha256: "a".repeat(64), pages: [[595, 842]] }], { x: 0, y: 0 });
    const pdf = state().pdfs[0].id;
    doc.undo();
    state().selectPdfs([pdf]);
    expect(state().selPdfs.size).toBe(0);
  });
});

/**
 * Quick Add opened by a wire let go on empty space offers the calculations
 * that take what the wire comes out of: Cmd+Z, taking that set away, left
 * it open offering every calculation there is, for nothing.
 */
describe("Quick Add opened by a wire", () => {
  it("shuts when an undo takes away the set the wire comes out of", () => {
    const { doc, state } = editor();
    const set = state().addSet({ x0: 0, y0: 0, x1: 4, y1: 4 });
    const open = { at: { x: 8, y: 0 }, x: 400, y: 300, within: { width: 800, height: 600 } };
    state().setQuickAdd({ ...open, wire: { set } });
    state().addAtom(9, 9, "C");
    doc.undo();
    expect(state().quickAdd).not.toBeNull();
    doc.undo();
    expect(state().quickAdd).toBeNull();
    // (opened on empty space, from nothing: kept)
    state().setQuickAdd(open);
    state().addAtom(9, 9, "C");
    doc.undo();
    expect(state().quickAdd).not.toBeNull();
  });
});

describe("words, a text's sheet, a slide or a shape an undo took away", () => {
  it("is not selected when a press held on it comes to take hold of it", () => {
    const { doc, state } = editor();
    const words = state().addCaption("K2CO3", 0, 0);
    doc.undo();
    state().selectCaptions([words]);
    expect(state().selCaptions.size).toBe(0);
    state().addTexts([{ name: "notes.md", text: "# Hi" }], { x: 0, y: 0 });
    const sheet = state().texts[0].id;
    doc.undo();
    state().selectTexts([sheet]);
    expect(state().selTexts.size).toBe(0);
    const slide = state().addSlide({ x: 0, y: 0, w: 16, h: 9 })!;
    doc.undo();
    state().selectSlides([slide]);
    expect(state().selSlides.size).toBe(0);
    const shape = state().addShape({ kind: "arrow", x0: 0, y0: 0, x1: 5, y1: 5 })!;
    doc.undo();
    state().selectShapes([shape]);
    expect(state().selShapes.size).toBe(0);
    // (one still there is selected)
    const kept = state().addShape({ kind: "arrow", x0: 0, y0: 0, x1: 5, y1: 5 })!;
    state().selectShapes([kept]);
    expect([...state().selShapes]).toEqual([kept]);
  });
});

describe("a picture made larger by its corner, let go of by Escape", () => {
  it("is as large as it was, nothing left to undo or redo of it", async () => {
    const { doc, state } = editor();
    const p = (await holdPicture(png()))!;
    const [id] = state().addPictures([{ name: "figure.png", sha256: p.sha256, media: p.media, width: p.width, height: p.height }], { x: 0, y: 0 });
    const was = { ...state().pictures[0] };
    const depth = doc.history().undoDepth;
    state().updatePicture(id, { w: was.w * 1.5, h: was.h * 1.5 }, "scale-1");
    state().updatePicture(id, { w: was.w * 2, h: was.h * 2 }, "scale-1");
    state().dropPictureChange(id, "scale-1");
    expect(state().pictures[0]).toMatchObject({ w: was.w, h: was.h });
    expect(doc.history()).toMatchObject({ undoDepth: depth, redoDepth: 0 });
  });
});
