import { describe, expect, it } from "vitest";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import { labelBegunOn } from "../utils/labelTyping";

// A letter typed goes to the selection's atoms, wherever the pointer is (the maintainer, 2026-11-14: docs/EDITOR-2D.md,
// *Labels typed in place*).

const at = (id: number, x: number, y = 0) => ({ id, x, y });

describe("where a letter typed begins a label", () => {
  it("on the one atom selected, the pointer anywhere - on the page, on another atom", () => {
    expect(labelBegunOn([at(1, 0)], null, { x: 9, y: 9 }, 1)).toEqual({ id: 1 });
    expect(labelBegunOn([at(1, 0)], 7, { x: 9, y: 9 }, 1)).toEqual({ id: 1 });
  });
  it("on every atom selected, the caret on the one nearest the pointer - not on an atom under it that is not selected", () => {
    expect(labelBegunOn([at(1, 0), at(2, 3), at(3, 6)], 9, { x: 5.6, y: 0 }, 1)).toEqual({ id: 3, atoms: [1, 2, 3] });
    // (the pointer's place not known: the one chosen first)
    expect(labelBegunOn([at(1, 0), at(2, 3)], null, null, 2)).toEqual({ id: 2, atoms: [1, 2] });
  });
  it("with no atom selected, on the atom under the pointer, as before - and nowhere with none", () => {
    expect(labelBegunOn([], 4, { x: 0, y: 0 }, null)).toEqual({ id: 4 });
    expect(labelBegunOn([], null, { x: 0, y: 0 }, null)).toBeNull();
  });
});

describe("a label typed on the selection's atoms", () => {
  it("is written on every one when kept, as one undo step named for it - the selection kept", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    const a = st().addAtom(0, 0, "C");
    const b = st().addAtom(1.5, 0.9, "C");
    const c = st().addAtom(3, 0, "C");
    const d = st().addAtom(4.5, 0.9, "C");
    st().addBond(a, b);
    st().addBond(b, c);
    st().addBond(c, d);
    st().setSel({ atoms: new Set([a, c, d]), bonds: new Set() });
    const depth = doc.history().undoDepth;
    st().beginLabelEdit(c, "O", { atoms: [a, c, d] });
    st().setLabelEditValue("OMe");
    st().commitLabelEdit("OMe", true);
    const els = () => st().model.atoms.map((x) => x.el);
    expect(els()).toEqual(["OMe", "C", "OMe", "OMe"]);
    expect(doc.history().undoDepth).toBe(depth + 1);
    expect(doc.history().undoLabel).toBe("label 3 atoms: OMe");
    expect([...st().sel.atoms].sort()).toEqual([a, c, d].sort());
    doc.undo();
    expect(els()).toEqual(["C", "C", "C", "C"]);
  });

  it("let go, changes nothing", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    const a = st().addAtom(0, 0, "C");
    const b = st().addAtom(1.5, 0.9, "C");
    st().addBond(a, b);
    const was = doc.getState().model;
    st().beginLabelEdit(a, "F", { atoms: [a, b] });
    st().cancelLabelEdit();
    expect(doc.getState().model).toBe(was);
  });
});
