import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { dragsSelection, selectedOf } from "./slices/selectionSlice";
import { createWorkspaceDocument } from "../document";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";

/** Store wired to a document, the way a workspace tab is put together. */
function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  // The canvas connects the two in an effect; do the same here.
  const disconnect = connectStoreToDocument(store, doc);
  return { doc, store, disconnect, state: () => store.getState() };
}

describe("editor store over a document", () => {
  it("writes edits to the document and mirrors them back", () => {
    const { doc, state } = editor();
    const id = state().addAtom(1, 2, "O");

    expect(doc.getState().model.atoms).toHaveLength(1);
    // the store's model is the document's, not a copy
    expect(state().model).toBe(doc.getState().model);
    expect(state().model.atoms[0]).toMatchObject({ id, el: "O", x: 1, y: 2 });
    expect(doc.history()).toMatchObject({ undoDepth: 1, dirty: true });
  });

  it("undoes and redoes through the canvas state", () => {
    const { doc, state } = editor();
    state().addAtom(0, 0, "C");
    state().addAtom(1.5, 0, "C");
    expect(state().model.atoms).toHaveLength(2);

    doc.undo();
    expect(state().model.atoms).toHaveLength(1);
    doc.undo();
    expect(state().model.atoms).toHaveLength(0);
    doc.redo();
    expect(state().model.atoms).toHaveLength(1);
  });

  it("deletes what the pointer is on in one step, and forgets the hover", () => {
    const { doc, state } = editor();
    const base = state().addAtom(0, 0, "C");
    const end = state().addAtomBonded(base, 1.5, 0, "C");
    state().setHoveredFromId(end);
    const fitBefore = state().fitNonce;

    state().deleteAtom(end);
    // the carbon left on its own goes with it
    expect(state().model.atoms).toHaveLength(0);
    expect(state().hovered).toEqual({ atomId: null, bondId: null });
    // the view stays where it is
    expect(state().fitNonce).toBe(fitBefore);

    doc.undo();
    expect(state().model.atoms).toHaveLength(2);
    expect(state().model.bonds).toHaveLength(1);
  });

  it("counts a bond extension as one step", () => {
    const { doc, state } = editor();
    const base = state().addAtom(0, 0, "C");
    const before = doc.history().undoDepth;

    state().addAtomBonded(base, 1.5, 0, "C");
    expect(doc.history().undoDepth).toBe(before + 1);
    expect(state().model.atoms).toHaveLength(2);
    expect(state().model.bonds).toHaveLength(1);

    doc.undo();
    // the atom and its bond go together
    expect(state().model.atoms).toHaveLength(1);
    expect(state().model.bonds).toHaveLength(0);
  });

  it("counts drawing a bond in empty space as one step", () => {
    const { doc, state } = editor();
    state().addBondedPair({ x: 0, y: 0 }, { x: 1.5, y: 0 });
    expect(doc.history().undoDepth).toBe(1);
    doc.undo();
    expect(state().model.atoms).toHaveLength(0);
  });

  it("counts an import as one step, not one per atom", () => {
    const { doc, state } = editor();
    state().replaceModel({
      atoms: [
        { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
        { id: 2, x: 1.5, y: 0, r: 0.9, el: "O" },
      ],
      bonds: [{ id: 3, a: 1, b: 2, order: 2 }],
    });

    expect(doc.history().undoDepth).toBe(1);
    expect(state().model.atoms).toHaveLength(2);
    // an import asks for a fit
    expect(state().fitNonce).toBe(1);

    doc.undo();
    expect(state().model.atoms).toHaveLength(0);
  });

  const ethanal = {
    atoms: [
      { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
      { id: 2, x: 1.5, y: 0, r: 0.9, el: "O" },
    ],
    bonds: [{ id: 3, a: 1, b: 2, order: 2 as const }],
  };
  const arrow = { arrows: [{ x: 4, y: 0, angle: 0, length: 3 }] };

  it("opens a tab's file as where the document starts, not as an edit", () => {
    const { doc, state } = editor();
    state().openModel(ethanal, arrow);

    expect(state().model.atoms).toHaveLength(2);
    expect(state().arrows).toHaveLength(1);
    // nothing to undo, nothing unsaved
    expect(doc.history()).toMatchObject({ undoDepth: 0, dirty: false });
    expect(doc.undo()).toBe(false);
    expect(state().model.atoms).toHaveLength(2);

    // an edit after it undoes back to the file, not to an empty canvas
    state().addAtom(3, 0, "N");
    expect(doc.history().dirty).toBe(true);
    doc.undo();
    expect(state().model.atoms).toHaveLength(2);
    expect(doc.history().dirty).toBe(false);
  });

  it("brings a reaction's arrow in with its molecules, as one step", () => {
    const replaced = editor();
    replaced.state().replaceModel(ethanal, arrow);
    expect(replaced.doc.history().undoDepth).toBe(1);
    expect(replaced.state().arrows).toMatchObject([{ x: 4, y: 0, length: 3 }]);
    replaced.doc.undo();
    expect(replaced.state().arrows).toHaveLength(0);
    expect(replaced.state().model.atoms).toHaveLength(0);

    const appended = editor();
    appended.state().appendModel(ethanal, arrow);
    expect(appended.doc.history().undoDepth).toBe(1);
    appended.doc.undo();
    expect(appended.state().arrows).toHaveLength(0);
  });

  it("adds a dropped file beside what is drawn, selected, with ids of its own", () => {
    const { state } = editor();
    const c = state().addAtom(-5, 0, "C");
    state().setSel({ atoms: new Set([c]), bonds: new Set() });
    state().appendModel(ethanal, arrow);
    const atoms = state().model.atoms.filter((a) => a.id !== c);
    expect(atoms.map((a) => a.el)).toEqual(["C", "O"]);
    const bond = state().model.bonds[0];
    expect([bond.a, bond.b]).toEqual(atoms.map((a) => a.id));
    // what was selected before is not now: only what came in is
    expect([...state().sel.atoms]).toEqual(atoms.map((a) => a.id));
    expect([...state().sel.bonds]).toEqual([bond.id]);
  });

  it("merges repeated moves of one atom into a single step", () => {
    const { doc, state } = editor();
    const id = state().addAtom(0, 0, "C");
    const before = doc.history().undoDepth;

    state().moveAtom(id, 1, 0);
    state().moveAtom(id, 2, 0);
    state().moveAtom(id, 3, 0);

    expect(doc.history().undoDepth).toBe(before + 1);
    doc.undo();
    expect(state().model.atoms[0]).toMatchObject({ x: 0, y: 0 });
  });

  it("keeps label edits in the document", () => {
    const { doc, state } = editor();
    const id = state().addAtom(0, 0, "C");
    state().beginLabelEdit(id);
    state().setLabelEditValue("O");
    state().commitLabelEdit();

    expect(state().model.atoms[0].el).toBe("O");
    expect(state().labelEdit.active).toBe(false);
    doc.undo();
    expect(state().model.atoms[0].el).toBe("C");
  });

  it("does not record a label edit that changes nothing", () => {
    const { doc, state } = editor();
    const id = state().addAtom(0, 0, "C");
    const before = doc.history().undoDepth;
    state().beginLabelEdit(id);
    state().setLabelEditValue("  ");
    state().commitLabelEdit();
    expect(doc.history().undoDepth).toBe(before);
    expect(state().model.atoms[0].el).toBe("C");
  });

  it("selects by atom, by bond, along the bonds, and a whole structure; deleting it is one step", () => {
    const { doc, state } = editor();
    // a chain of four and, apart from it, an ethane
    const [a, b, c, d] = [0, 1, 2, 3].map((i) => state().addAtom(i * 1.5, 0, "C"));
    state().connectAtoms(a, b, 1);
    state().connectAtoms(b, c, 1);
    state().connectAtoms(c, d, 1);
    const e = state().addAtom(10, 0, "C");
    const f = state().addAtom(11.5, 0, "C");
    state().connectAtoms(e, f, 1);

    state().toggleAtomSel(a);
    state().selectPathTo(d);
    expect([...state().sel.atoms].sort()).toEqual([a, b, c, d].sort());
    expect(state().sel.bonds.size).toBe(3);
    state().toggleAtomSel(d);
    expect(state().sel.atoms.has(d)).toBe(false);
    expect(state().sel.bonds.size).toBe(2);
    state().selectAll();
    expect(state().sel.atoms.size).toBe(6);
    expect(state().sel.bonds.size).toBe(4);
    state().clearSel();
    // a bond comes with its atoms, and goes on its own
    const ef = state().model.bonds.find((x) => x.a === e || x.b === e)!.id;
    state().toggleBondSel(ef);
    expect([...state().sel.atoms].sort()).toEqual([e, f].sort());
    state().toggleBondSel(ef);
    expect(state().sel.bonds.size).toBe(0);
    state().clearSel();
    state().selectStructure(f);
    expect([...state().sel.atoms].sort()).toEqual([e, f].sort());

    const before = doc.history().undoDepth;
    state().deleteSelection();
    expect(state().model.atoms.map((x) => x.id)).toEqual([a, b, c, d]);
    expect(state().sel.atoms.size).toBe(0);
    expect(doc.history().undoDepth).toBe(before + 1);
  });

  it("moves a selection's atoms as one step, and turns it over keeping the molecule", () => {
    const { doc, state } = editor();
    const a = state().addAtom(0, 0, "C");
    const b = state().addAtom(1.5, 0, "C");
    state().connectAtoms(a, b, 1);
    const bond = state().model.bonds[0].id;
    state().setBondStereo(bond, "up");
    const before = doc.history().undoDepth;
    state().moveAtoms([{ id: a, x: 1, y: 1 }, { id: b, x: 2.5, y: 1 }], "drag-1");
    state().moveAtoms([{ id: a, x: 2, y: 2 }, { id: b, x: 3.5, y: 2 }], "drag-1");
    expect(doc.history().undoDepth).toBe(before + 1);
    state().setSel({ atoms: new Set([a, b]), bonds: new Set([bond]) });
    state().turnSelectionOver("vertical");
    expect(state().model.atoms.map((x) => x.x)).toEqual([3.5, 2]);
    expect(state().model.bonds[0].stereo).toBe("down");
  });

  it("reads a charge, and an isotope, from a label typed", () => {
    const { doc, state } = editor();
    const id = state().addAtom(0, 0, "C");
    const label = (text: string) => {
      state().beginLabelEdit(id);
      state().setLabelEditValue(text);
      state().commitLabelEdit();
      return state().model.atoms[0];
    };
    expect(label("NH3+")).toMatchObject({ el: "N", charge: 1 });
    // opened again, it shows what it is, as typed
    state().beginLabelEdit(id);
    expect(state().labelEdit.value).toBe("N+");
    state().cancelLabelEdit();
    expect(label("2-")).toMatchObject({ el: "N", charge: -2 });
    expect(label("13C")).toMatchObject({ el: "C", isotope: 13 });
    expect(state().model.atoms[0].charge).toBeUndefined();
    // a label that is not an element carries no charge
    label("N+");
    const text = label("OMe");
    expect(text.el).toBe("OMe");
    expect(text.charge).toBeUndefined();
    doc.undo();
    expect(state().model.atoms[0]).toMatchObject({ el: "N", charge: 1 });
  });

  it("steps an atom's charge, and gives and takes its unpaired electron, each as an undo step", () => {
    const { doc, state } = editor();
    const id = state().addAtom(0, 0, "N");
    state().stepCharge(id, 1);
    expect(state().model.atoms[0].charge).toBe(1);
    state().stepCharge(id, -1);
    state().stepCharge(id, -1);
    expect(state().model.atoms[0].charge).toBe(-1);
    state().toggleRadical(id);
    expect(state().model.atoms[0].radical).toBe("doublet");
    state().toggleRadical(id);
    expect(state().model.atoms[0].radical).toBeUndefined();
    doc.undo();
    expect(state().model.atoms[0].radical).toBe("doublet");
  });

  it("pastes a structure as one step, with ids of its own, selected", () => {
    const { doc, state } = editor();
    const c = state().addAtom(0, 0, "C");
    const before = doc.history().undoDepth;
    state().pasteModel({
      atoms: [
        { id: 1, x: 5, y: 0, r: 0.9, el: "C" },
        { id: 2, x: 6, y: 0, r: 0.9, el: "O", charge: -1 },
      ],
      bonds: [{ id: 1, a: 1, b: 2, order: 2 }],
    });
    expect(doc.history().undoDepth).toBe(before + 1);
    const pasted = state().model.atoms.filter((a) => a.id !== c);
    expect(pasted.map((a) => a.el)).toEqual(["C", "O"]);
    expect(new Set(pasted.map((a) => a.id)).has(c)).toBe(false);
    expect(pasted[1].charge).toBe(-1);
    const bond = state().model.bonds[0];
    expect([bond.a, bond.b]).toEqual(pasted.map((a) => a.id));
    expect([...state().sel.atoms]).toEqual(pasted.map((a) => a.id));
    expect([...state().sel.bonds]).toEqual([bond.id]);
    doc.undo();
    expect(state().model.atoms.map((a) => a.id)).toEqual([c]);
  });

  it("forgets what was under the pointer when an undo takes it away, and begins no label on it", () => {
    const { doc, state } = editor();
    const base = state().addAtom(0, 0, "C");
    const end = state().addAtomBonded(base, 1.5, 0, "C");
    // the pointer resting on the atom just drawn, as an undo takes it away
    state().setHoveredFromId(end);
    doc.undo();
    expect(state().hovered).toEqual({ atomId: null, bondId: null });
    // (a letter typed over where it was begins nothing)
    state().beginLabelEdit(end, "N");
    expect(state().labelEdit.active).toBe(false);
    // the bond too, and what is still there stays under the pointer
    doc.redo();
    const bond = state().model.bonds[0].id;
    state().setHoveredFromId(bond);
    doc.undo();
    expect(state().hovered.bondId).toBeNull();
    state().setHoveredFromId(base);
    state().addAtom(9, 9, "N");
    doc.undo();
    expect(state().hovered.atomId).toBe(base);
  });

  it("lets go of what an undo or a redo moves from under the pointer, and keeps what stayed", () => {
    const { doc, state } = editor();
    const a = state().addAtom(0, 0, "C");
    const b = state().addAtomBonded(a, 1.5, 0, "C");
    const bond = state().model.bonds[0].id;
    // dragged to (5, 0), the pointer resting on it there
    state().moveAtoms([{ id: b, x: 5, y: 0 }], "drag-1");
    state().setHoveredFromId(b);
    doc.undo();
    // back across the page: Delete, or a letter, acted on it from there
    expect(state().hovered.atomId).toBeNull();
    // and a redo, the same
    state().setHoveredFromId(b);
    doc.redo();
    expect(state().hovered.atomId).toBeNull();
    // a bond whose end moved
    state().setHoveredFromId(bond);
    doc.undo();
    expect(state().hovered.bondId).toBeNull();
    // what an undo did not move stays under the pointer
    state().setHoveredFromId(a);
    state().addAtom(9, 9, "N");
    doc.undo();
    expect(state().hovered.atomId).toBe(a);
    // and an atom dragged stays lit as it goes, edit by edit
    state().setHoveredFromId(b);
    state().moveAtoms([{ id: b, x: 6, y: 0 }], "drag-2");
    expect(state().hovered.atomId).toBe(b);
  });

  it("selects nothing for a structure whose atom an undo took away before a long press ended", () => {
    const { doc, state } = editor();
    const base = state().addAtom(0, 0, "C");
    const end = state().addAtomBonded(base, 1.5, 0, "C");
    // a long press on the atom just drawn, and Cmd+Z before its 320 ms are up
    doc.undo();
    state().selectStructure(end);
    expect(state().sel.atoms.size).toBe(0);
    expect(state().selAnchor).toBeNull();
    // what is there is selected whole, as before
    state().selectStructure(base);
    expect([...state().sel.atoms]).toEqual([base]);
  });

  it("shuts a step's options card, and forgets a set chosen, when an undo takes it away", () => {
    const { doc, state } = editor();
    const step = state().addStep("energy" as never, "xtb", 0, 0);
    state().setWorkflowView({ openStep: step });
    doc.undo();
    expect(state().openStep).toBeNull();
    // a redo brings the step back, not its card
    doc.redo();
    expect(state().steps.some((x) => x.id === step)).toBe(true);
    expect(state().openStep).toBeNull();
    // a step still there keeps its card open over an undo of something else
    state().setWorkflowView({ openStep: step });
    state().addAtom(9, 9, "C");
    doc.undo();
    expect(state().openStep).toBe(step);
  });

  it("moves the whole selection by an atom of it selected with a picture, a shape or words, not the atom alone", () => {
    const { state } = editor();
    const a = state().addAtom(0, 0, "C");
    const b = state().addAtom(5, 0, "C");
    // the atom alone, selected or not: its own drag
    expect(dragsSelection(state(), a)).toBe(false);
    state().setSel({ atoms: new Set([a]), bonds: new Set() }, a);
    expect(dragsSelection(state(), a)).toBe(false);
    // with another atom, or with words on the page: the selection's
    state().setSel({ atoms: new Set([a, b]), bonds: new Set() }, a);
    expect(dragsSelection(state(), a)).toBe(true);
    state().setSel({ atoms: new Set([a]), bonds: new Set() }, a);
    const words = state().addCaption("rt, 2 h", 9, 9);
    state().selectCaptions([words], true);
    expect(dragsSelection(state(), a)).toBe(true);
    // and not an atom outside the selection
    expect(dragsSelection(state(), b)).toBe(false);
  });

  it("steps the charge of each atom selected, by + or -, as one undo step", () => {
    const { doc, state } = editor();
    const a = state().addAtom(0, 0, "N");
    const b = state().addAtom(5, 0, "O");
    const c = state().addAtom(9, 0, "C");
    const depth = doc.history().undoDepth;
    state().stepCharges([a, b], 1);
    const charge = (id: number) => state().model.atoms.find((x) => x.id === id)!.charge ?? 0;
    expect([charge(a), charge(b), charge(c)]).toEqual([1, 1, 0]);
    expect(doc.history().undoDepth).toBe(depth + 1);
    doc.undo();
    expect([charge(a), charge(b)]).toEqual([0, 0]);
  });

  it("takes what an undo takes back out of the selection, and nothing is left selected", () => {
    const { doc, state } = editor();
    state().addAtom(0, 0, "C");
    state().pasteModel({
      atoms: [
        { id: 1, x: 5, y: 0, r: 0.9, el: "C" },
        { id: 2, x: 6, y: 0, r: 0.9, el: "O" },
      ],
      bonds: [{ id: 1, a: 1, b: 2, order: 1 }],
    });
    expect(selectedOf(state())).toEqual({ any: true, drawing: true });
    doc.undo();
    // (nothing seen selected: a right-click on empty space opens the canvas's menu, not the selection's)
    expect(state().sel.atoms.size + state().sel.bonds.size).toBe(0);
    expect(state().selAnchor).toBeNull();
    expect(selectedOf(state())).toEqual({ any: false, drawing: false });
    // (what is still there stays selected: undo does not change the selection otherwise)
    const kept = state().model.atoms[0].id;
    state().setSel({ atoms: new Set([kept]), bonds: new Set() }, kept);
    state().addAtom(9, 9, "N");
    doc.undo();
    expect([...state().sel.atoms]).toEqual([kept]);
    expect(state().selAnchor).toBe(kept);
  });

  it("pastes a reaction with its arrow and plus, ids of their own, and selects all a group's atoms and bonds", () => {
    const { doc, state } = editor();
    state().addArrow(0, 0);
    const before = doc.history().undoDepth;
    // two atoms of one Sgroup, whose id is handed out between atoms and bonds
    const group = { id: 4, type: "SRU" as const };
    state().pasteModel({
      atoms: [
        { id: 1, x: 5, y: 0, r: 0.9, el: "C", sgroups: [group] },
        { id: 2, x: 6, y: 0, r: 0.9, el: "C", sgroups: [group] },
        { id: 3, x: 9, y: 0, r: 0.9, el: "O" },
      ],
      bonds: [{ id: 5, a: 1, b: 2, order: 1 }],
      arrows: [{ id: 1, x: 7.5, y: 0, angle: 0, length: 2, look: { reactionArrowHeadInset: 0.3 } }],
      pluses: [{ id: 7, x: 4, y: 0 }],
    });
    expect(doc.history().undoDepth).toBe(before + 1);
    expect(state().arrows).toHaveLength(2);
    expect(state().arrows[1]).toMatchObject({ id: 2, x: 7.5, look: { reactionArrowHeadInset: 0.3 } });
    expect(state().pluses).toEqual([{ id: 1, x: 4, y: 0 }]);
    expect(state().sel.atoms.size).toBe(3);
    expect([...state().sel.bonds]).toEqual(state().model.bonds.map((b) => b.id));
    doc.undo();
    expect(state().arrows).toHaveLength(1);
    expect(state().pluses).toHaveLength(0);
  });

  it("cuts atoms, arrows and pluses as one step; moves and deletes a plus", () => {
    const { doc, state } = editor();
    state().replaceModel(
      { atoms: [{ id: 1, x: -2, y: 0, r: 0.9, el: "C" }, { id: 2, x: 2, y: 0, r: 0.9, el: "O" }], bonds: [] },
      { arrows: [{ x: 0, y: 0, angle: 0, length: 2 }], pluses: [{ x: -3, y: 0 }, { x: 3, y: 0 }] },
    );
    const [p1, p2] = state().pluses;
    state().movePlus(p1.id, -3, 1);
    state().movePlus(p1.id, -3, 2);
    expect(state().pluses[0]).toMatchObject({ x: -3, y: 2 });
    const depth = doc.history().undoDepth;
    state().deleteDrawn({ atoms: [state().model.atoms[0]], bonds: [], arrows: state().arrows, pluses: [p1] });
    expect(doc.history().undoDepth).toBe(depth + 1);
    expect(state().model.atoms.map((a) => a.el)).toEqual(["O"]);
    expect(state().arrows).toHaveLength(0);
    expect(state().pluses.map((p) => p.id)).toEqual([p2.id]);
    state().removePlus(p2.id);
    expect(state().pluses).toHaveLength(0);
    doc.undo();
    doc.undo();
    expect(state().arrows).toHaveLength(1);
    expect(state().pluses).toHaveLength(2);
    // the two moves, one step
    doc.undo();
    expect(state().pluses[0]).toMatchObject({ x: -3, y: 0 });
  });

  it("takes the arrows and pluses among a selection with it, deleted or moved", () => {
    const { state } = editor();
    state().replaceModel(
      {
        atoms: [
          { id: 1, x: -2, y: 0, r: 0.9, el: "C" },
          { id: 2, x: 2, y: 0, r: 0.9, el: "O" },
          { id: 3, x: 9, y: 0, r: 0.9, el: "N" },
        ],
        bonds: [],
      },
      { arrows: [{ x: 0, y: 0, angle: 0, length: 2 }], pluses: [{ x: 8, y: 0 }] },
    );
    // the C and the O: the arrow between them, not the plus by the N
    state().setSel({ atoms: new Set([1, 2]), bonds: new Set() });
    state().moveAtoms(
      [{ id: 1, x: -2, y: 5 }, { id: 2, x: 2, y: 5 }],
      "test",
      { arrows: [{ id: state().arrows[0].id, x: 0, y: 5 }] },
    );
    expect(state().arrows[0]).toMatchObject({ x: 0, y: 5 });
    state().deleteSelection();
    expect(state().model.atoms.map((a) => a.el)).toEqual(["N"]);
    expect(state().arrows).toHaveLength(0);
    expect(state().pluses).toHaveLength(1);
  });

  it("adds a reaction arrow and a plus, each one step; a drag of either is one step", () => {
    const { doc, state } = editor();
    const arrow = state().addArrow(1, 2);
    const plus = state().addPlus(-3, 2);
    expect(doc.history().undoDepth).toBe(2);
    // pointing right, as long as a file's
    expect(state().arrows[0]).toMatchObject({ id: arrow, x: 1, y: 2, angle: 0, length: (8 / 3) * NOMINAL_BOND_LENGTH });
    expect(state().pluses).toEqual([{ id: plus, x: -3, y: 2 }]);
    // two drags of the arrow, each of two moves; one of the plus
    state().updateArrow(arrow, { x: 2 }, "drag-1");
    state().updateArrow(arrow, { x: 3 }, "drag-1");
    state().updateArrow(arrow, { angle: 1, length: 5 }, "drag-2");
    state().updateArrow(arrow, { angle: 1.2, length: 6 }, "drag-2");
    state().movePlus(plus, -4, 2, "drag-3");
    state().movePlus(plus, -5, 2, "drag-3");
    expect(doc.history().undoDepth).toBe(5);
    doc.undo();
    expect(state().pluses[0]).toMatchObject({ x: -3 });
    doc.undo();
    expect(state().arrows[0]).toMatchObject({ x: 3, angle: 0 });
    doc.undo();
    expect(state().arrows[0]).toMatchObject({ x: 1 });
  });

  it("keeps aromatic circles in the document", () => {
    const { doc, state } = editor();
    state().toggleAromatic();
    expect(state().aromaticEnabled).toBe(true);
    state().toggleRing("ring-a");
    expect(state().aromaticRings["ring-a"]).toBe(true);
    doc.undo();
    expect(state().aromaticRings["ring-a"]).toBeFalsy();
  });

  it("leaves hover and gesture state out of the history", () => {
    const { doc, state } = editor();
    const id = state().addAtom(0, 0, "C");
    const depth = doc.history().undoDepth;

    state().setHoveredFromId(id);
    expect(state().hovered.atomId).toBe(id);

    state().beginMoveDrag(id, { x: 1, y: 1 });
    // grabbing an atom drops its hover highlight
    expect(state().hovered.atomId).toBeNull();
    state().updateMovePointer(2, 2);
    state().endMoveDrag();
    state().requestFit();

    // none of that is an edit
    expect(doc.history().undoDepth).toBe(depth);
    expect(doc.history().dirty).toBe(true); // still dirty from the added atom
  });

  it("stops mirroring once disconnected, and catches up when reconnected", () => {
    const { doc, store, disconnect, state } = editor();
    state().addAtom(0, 0, "C");
    disconnect();

    doc.undo();
    // the document moved on, the detached store did not
    expect(doc.getState().model.atoms).toHaveLength(0);
    expect(state().model.atoms).toHaveLength(1);

    // reconnecting (a remount) resyncs rather than leaving a stale canvas
    connectStoreToDocument(store, doc);
    expect(state().model.atoms).toHaveLength(0);
  });
});

describe("a workspace's drawing style", () => {
  it("is always set, and changed by an edit like any other: mirrored, undone, and one step for a run of changes to one setting", () => {
    const { doc, state } = editor();
    // (made in a style - Meno's, where none is given - and never without one)
    expect(state().docStyle).toEqual(doc.getState().style);
    expect(state().docStyle.preset).toBe("meno");

    state().setDocumentStyle({ preset: "rsc", changes: {} });
    expect(doc.getState().style).toEqual({ preset: "rsc", changes: {} });
    expect(state().docStyle).toEqual({ preset: "rsc", changes: {} });
    const depth = doc.history().undoDepth;

    // a slider dragged through three values
    for (const v of [0.5, 0.6, 0.7]) {
      state().setDocumentStyle(
        { preset: "rsc", changes: { lineThickness: { value: v, unit: "pt" } } },
        "style:lineThickness",
      );
    }
    expect(doc.history().undoDepth).toBe(depth + 1);
    doc.undo();
    expect(state().docStyle).toEqual({ preset: "rsc", changes: {} });

    // (another style - one step - and undone, the one before; no style ever none)
    state().setDocumentStyle({ preset: "acs1996", changes: {} });
    expect(state().docStyle).toEqual({ preset: "acs1996", changes: {} });
    doc.undo();
    expect(state().docStyle).toEqual({ preset: "rsc", changes: {} });
  });

  it("forgets where it was saved once a file is opened over it, Save to ask where", () => {
    const { doc, state } = editor();
    state().addAtom(0, 0, "C");
    state().markSavedAs("/work/first.mol");
    expect(doc.history().dirty).toBe(false);
    state().addAtom(1.5, 0, "O");
    state().markOpenedOver("second.mol");
    expect(state().savedPath).toBeNull();
    expect(state().openedName).toBe("second.mol");
    // and once saved again, it is saved there
    state().markSavedAs("/work/second.mol");
    expect(state().savedPath).toBe("/work/second.mol");
  });
});

describe("a workspace's history, held to about 100 MB (the maintainer, 2026-10-13)", () => {
  it("costs a step the atoms and bonds it copies: a small drawing keeps its thousand steps, a large one fewer", async () => {
    const { createDocument, DEFAULT_HISTORY_BUDGET } = await import("../../../../lib/doc/document");
    const { stepCost } = await import("../document");
    const { emptyWorkspaceDocument } = await import("../document");
    // a move copies the atoms, not the bonds; words copy neither
    const base = emptyWorkspaceDocument();
    const drawn = { ...base, model: { atoms: [{ id: 1, x: 0, y: 0, r: 0.9, el: "C" }], bonds: [] } };
    const moved = { ...drawn, model: { ...drawn.model, atoms: [{ ...drawn.model.atoms[0], x: 1 }] } };
    expect(stepCost(moved, drawn)).toBe(1);
    expect(stepCost({ ...moved, texts: [] }, moved)).toBe(0);
    expect(stepCost(moved, undefined)).toBe(1);
    // 300 atoms: a thousand steps, the 1001st dropping the oldest
    const { doc: small, state } = editor();
    const a = state().addAtom(0, 0, "C");
    for (let i = 1; i < 300; i++) state().addAtom(i, 0, "C");
    for (let i = 0; i < 1001; i++) state().moveAtoms([{ id: a, x: 0, y: i }], `drag-${i}`);
    expect(small.history().undoDepth).toBe(1000);
    // 10,000 atoms, a budget of a million: a hundred moves held, the oldest gone
    const atoms = Array.from({ length: 10_000 }, (_, i) => ({ id: i + 1, x: i, y: 0, r: 0.9, el: "C" }));
    const big = createDocument({ ...base, model: { atoms, bonds: [] } }, { cost: stepCost, budget: 1_000_000 });
    for (let i = 0; i < 150; i++) big.edit("move", (d) => ({ ...d, model: { ...d.model, atoms: d.model.atoms.map((x, k) => (k === 0 ? { ...x, y: i } : x)) } }));
    expect(big.history().undoDepth).toBeGreaterThanOrEqual(98);
    expect(big.history().undoDepth).toBeLessThanOrEqual(100);
    // and the workspace's own budget
    expect(DEFAULT_HISTORY_BUDGET).toBe(25_000_000);
  });
});

describe("a haptic bond's endpoints, held to the ring it binds (a document fuzzer, 2026-10-13)", () => {
  /** FeCp2 written out on a carbon: its metal, its stars and their haptic bonds to the Cp rings. */
  const ferrocene = () => {
    const ed = editor();
    const a = ed.state().addAtom(0, 0, "C");
    const fe = ed.state().addAtomBonded(a, 1.5, 0, "C");
    ed.state().beginLabelEdit(fe, "FeCp2");
    ed.state().commitLabelEdit();
    ed.state().expandAbbreviation(fe);
    const hap = ed.doc.getState().model.bonds.find((b) => b.endpoints?.length)!;
    return { ...ed, hap };
  };
  const bond = (doc: ReturnType<typeof ferrocene>["doc"], id: number) => doc.getState().model.bonds.find((b) => b.id === id);

  it("goes with its star once an atom of its ring is deleted, or merged onto another - endpoints never name an atom gone, and a star is never left an atom", () => {
    const deleted = ferrocene();
    deleted.state().deleteAtom(deleted.hap.endpoints![0]);
    expect(bond(deleted.doc, deleted.hap.id)).toBeUndefined();
    expect(deleted.doc.getState().model.atoms.some((x) => x.id === deleted.hap.b)).toBe(false);
    const merged = ferrocene();
    merged.state().replaceDraggedAtomWith(merged.hap.endpoints![0], merged.hap.endpoints![2]);
    const ids = new Set(merged.doc.getState().model.atoms.map((x) => x.id));
    for (const b of merged.doc.getState().model.bonds) for (const e of b.endpoints ?? []) expect(ids.has(e)).toBe(true);
    expect(ids.has(merged.hap.b)).toBe(false);
    // and undone, the ring and its bond as they were
    deleted.doc.undo();
    expect(bond(deleted.doc, deleted.hap.id)?.endpoints).toEqual(deleted.hap.endpoints);
  });

  it("goes with its star when the bond or its metal is deleted", () => {
    const bondGone = ferrocene();
    bondGone.state().deleteBond(bondGone.hap.id);
    expect(bondGone.doc.getState().model.atoms.some((x) => x.id === bondGone.hap.b)).toBe(false);
    const metalGone = ferrocene();
    metalGone.state().deleteAtom(metalGone.hap.a);
    expect(metalGone.doc.getState().model.atoms.some((x) => x.el === "*")).toBe(false);
  });

  it("keeps its star at the ring's centre as the ring moves", () => {
    const { state, doc, hap } = ferrocene();
    const ring = doc.getState().model.atoms.filter((x) => hap.endpoints!.includes(x.id));
    state().moveAtoms(ring.map((x) => ({ id: x.id, x: x.x + 3, y: x.y - 2 })), "test");
    const m = doc.getState().model;
    const moved = m.atoms.filter((x) => hap.endpoints!.includes(x.id));
    const star = m.atoms.find((x) => x.id === hap.b)!;
    expect(star.x).toBeCloseTo(moved.reduce((s, x) => s + x.x, 0) / moved.length, 9);
    expect(star.y).toBeCloseTo(moved.reduce((s, x) => s + x.y, 0) / moved.length, 9);
  });

  it("pasted without its ring - the metal and the star alone - goes with its star, binding not the ring it was copied from", () => {
    const { state, doc, hap } = ferrocene();
    const m = doc.getState().model;
    const part = { atoms: m.atoms.filter((x) => x.id === hap.a || x.id === hap.b), bonds: [hap] };
    const before = new Set(m.bonds.map((b) => b.id));
    const atomsBefore = new Set(m.atoms.map((x) => x.id));
    state().pasteModel({ atoms: part.atoms.map((x) => ({ ...x, x: x.x + 20 })), bonds: part.bonds });
    const pasted = doc.getState().model.bonds.filter((b) => !before.has(b.id));
    expect(pasted).toHaveLength(0);
    const added = doc.getState().model.atoms.filter((x) => !atomsBefore.has(x.id));
    expect(added.map((x) => x.el)).toEqual([m.atoms.find((x) => x.id === hap.a)!.el]);
  });

  it("is left out of a part that does not hold the whole ring", async () => {
    const { partOf } = await import("../chem/cleanUp");
    const { doc, hap } = ferrocene();
    const part = partOf(doc.getState().model, new Set([hap.a, hap.b, hap.endpoints![0]]));
    expect(part.bonds.find((b) => b.id === hap.id)?.endpoints).toBeUndefined();
  });
});

describe("a complex written out inside a workflow set (a document fuzzer, 2026-10-13)", () => {
  it("leaves the set's frame finite, and a part without its ring measurable - a NaN frame was dropped with its set on saving", async () => {
    const { drawnBox } = await import("../../../../utils/importers");
    const { structuresOf } = await import("../workflow/entries");
    for (const label of ["Cp*", "FeCp2"]) {
      const { doc, state } = editor();
      const a = state().addAtom(0, 0, "C");
      const x = state().addAtomBonded(a, 1.8, 0, "C");
      const set = state().addSet({ x0: -5, y0: -5, x1: 8, y1: 5 });
      state().beginLabelEdit(x, label);
      state().commitLabelEdit();
      state().expandAbbreviation(x);
      const d = doc.getState();
      const frame = (d.sets ?? []).find((s) => s.id === set)!;
      for (const v of [frame.x0, frame.x1, frame.y0, frame.y1]) expect(Number.isFinite(v)).toBe(true);
      // the metal and its star alone: measured, not NaN
      const hap = d.model.bonds.find((b) => b.endpoints?.length)!;
      const part = { atoms: d.model.atoms.filter((y) => y.id === hap.a || y.id === hap.b), bonds: [hap] };
      const box = drawnBox(part);
      for (const v of [box.minX, box.maxX, box.minY, box.maxY]) expect(Number.isFinite(v)).toBe(true);
      // and the complex one structure, its rings with its metal
      const ring = hap.endpoints![0];
      expect(structuresOf(d.model).find((s) => s.includes(hap.a))).toContain(ring);
    }
  });
});

describe("electron-pushing arrows over a merge (a document fuzzer, 2026-10-13)", () => {
  it("go with the atom dragged onto another, and those on a bond that collapsed go - none left on what is gone", () => {
    const { doc, state } = editor();
    const a = state().addAtom(0, 0, "C");
    const b = state().addAtom(1.5, 0, "O");
    const c = state().addAtom(3, 0, "C");
    const ab = state().connectAtoms(a, b, 1)!;
    state().connectAtoms(b, c, 1);
    state().addPush({ bond: ab }, { atom: b }, false);
    state().addPush({ atom: a }, { atom: c }, false);
    // a dragged onto b: the bond a-b collapses, a goes
    state().replaceDraggedAtomWith(a, b);
    const d = doc.getState();
    const ids = new Set(d.model.atoms.map((x) => x.id));
    const bonds = new Set(d.model.bonds.map((x) => x.id));
    for (const p of d.pushes ?? [])
      for (const e of [p.from, p.to]) {
        if ("atom" in e) expect(ids.has(e.atom)).toBe(true);
        if ("bond" in e) expect(bonds.has(e.bond)).toBe(true);
      }
    // the arrow from a now leaves b, where a was dropped
    expect((d.pushes ?? []).some((p) => "atom" in p.from && p.from.atom === b && "atom" in p.to && p.to.atom === c)).toBe(true);
    // and the one on the collapsed bond is gone
    expect((d.pushes ?? []).some((p) => "bond" in p.from && p.from.bond === ab)).toBe(false);
  });
});

describe("a charge's mark dragged far from its atom (a document fuzzer, 2026-10-13)", () => {
  it("goes no farther than a mark is read back from a file or a copy, so it is not put back on reopening", async () => {
    const { MARK_REACH } = await import("../document");
    const { doc, state } = editor();
    const n = state().addAtom(0, 0, "N");
    state().stepCharge(n, 1);
    state().putMark({ atom: n, kind: "charge" }, { x: 300, y: 400 }, "far");
    const at = doc.getState().model.atoms.find((a) => a.id === n)!.chargeAt!;
    expect(Math.hypot(at.x, at.y)).toBeLessThan(MARK_REACH);
    // in the same direction
    expect(at.y / at.x).toBeCloseTo(400 / 300, 6);
    // one near is put as it is
    state().putMark({ atom: n, kind: "charge" }, { x: 1.5, y: -0.5 }, "near");
    expect(doc.getState().model.atoms.find((a) => a.id === n)!.chargeAt).toEqual({ x: 1.5, y: -0.5 });
  });
});

describe("a bond's stereo and its order (a document fuzzer, 2026-10-13)", () => {
  it("lets a double or triple bond carry no wedge, hashes or wavy line, made so or given one", () => {
    const { doc, state } = editor();
    const a = state().addAtom(0, 0, "C");
    state().addAtomBonded(a, 1.5, 0, "C");
    const id = doc.getState().model.bonds[0].id;
    const bond = () => doc.getState().model.bonds.find((b) => b.id === id)!;
    state().setBondStereo(id, "up");
    expect(bond().stereo).toBe("up");
    state().setBondOrder(id, 2);
    expect(bond().stereo).toBe("none");
    state().setBondStereo(id, "wavy");
    expect(bond().stereo).toBe("none");
    state().setBondOrder(id, 3);
    state().setBondStereo(id, "down");
    expect(bond().stereo).toBe("none");
    // a single bond takes them as ever
    state().setBondOrder(id, 1);
    state().setBondStereo(id, "down");
    expect(bond().stereo).toBe("down");
  });
});
