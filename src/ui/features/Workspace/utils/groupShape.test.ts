import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import { groupShape } from "./groupShape";

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, state: () => store.getState() };
}

describe("a group's shape (Save as abbreviation closes when it changes)", () => {
  it("is another once an undo takes an atom of the group, or a bond among them, away; the same as it moves", () => {
    const { doc, state } = editor();
    // a tBu group on a carbon, the panel opened on the four
    const c = state().addAtom(0, 0, "C");
    const q = state().addAtomBonded(c, L, 0, "C");
    const m1 = state().addAtomBonded(q, 1.5 * L, 0.87 * L, "C");
    const m2 = state().addAtomBonded(q, 1.5 * L, -0.87 * L, "C");
    const m3 = state().addAtomBonded(q, 2 * L, 0, "C");
    const ids = [q, m1, m2, m3];
    const opened = groupShape(state().model, ids);
    // moved: the same group
    state().moveAtoms([{ id: m3, x: 3 * L, y: 0 }], "drag");
    expect(groupShape(state().model, ids)).toBe(opened);
    doc.undo();
    // a methyl undone away: Save would have shown "tBu" on an isopropyl
    doc.undo();
    expect(groupShape(state().model, ids)).not.toBe(opened);
    doc.redo();
    expect(groupShape(state().model, ids)).toBe(opened);
    // an atom of it charged, or another element: another group
    state().stepCharge(m1, 1);
    expect(groupShape(state().model, ids)).not.toBe(opened);
    doc.undo();
    expect(groupShape(state().model, ids)).toBe(opened);
    const relabelled = groupShape({ ...state().model, atoms: state().model.atoms.map((a) => (a.id === m1 ? { ...a, el: "N" } : a)) }, ids);
    expect(relabelled).not.toBe(opened);
  });
});
