import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";

/** A carbon with an atom bonded to it, the label to be typed on that atom - as the canvas has them. */
function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  const c = st().addAtom(0, 0, "C");
  const x = st().addAtom(NOMINAL_BOND_LENGTH, 0, "C");
  st().addBond(c, x, 1);
  // (a label typed on the atom and kept, by Enter or not)
  const typed = (label: string, byEnter = true) => {
    st().beginLabelEdit(x, label[0]);
    st().setLabelEditValue(label);
    st().commitLabelEdit(label, byEnter);
  };
  return { doc, st, x, typed };
}

describe("Enter twice: a label typed and kept by Enter, drawn out by an Enter straight after", () => {
  it("draws the label out, one step after its own: undone to the label first, then to before it", () => {
    const { doc, st, x, typed } = editor();
    typed("OMe");
    expect(st().model.atoms.find((a) => a.id === x)?.el).toBe("OMe");
    expect(st().keyAfterLabel(true)).toBe(true);
    // (drawn out: its O where the label was, a methyl on)
    expect(st().model.atoms.map((a) => a.el).sort()).toEqual(["C", "C", "O"]);
    doc.undo();
    expect(st().model.atoms.find((a) => a.id === x)?.el).toBe("OMe");
    doc.undo();
    expect(st().model.atoms.find((a) => a.id === x)?.el).toBe("C");
  });

  it("does nothing where anything came between: another key, or the selection changed", () => {
    const { st, x, typed } = editor();
    typed("OMe");
    expect(st().keyAfterLabel(false)).toBe(true);
    expect(st().keyAfterLabel(true)).toBe(false);
    expect(st().model.atoms.find((a) => a.id === x)?.el).toBe("OMe");
    // (a press, or a selection made, between the two)
    typed("OEt");
    st().forgetLabelKept();
    st().keyAfterLabel(true);
    expect(st().model.atoms.find((a) => a.id === x)?.el).toBe("OEt");
    typed("OBn");
    st().setSel({ atoms: new Set([x]), bonds: new Set() });
    st().keyAfterLabel(true);
    expect(st().model.atoms.find((a) => a.id === x)?.el).toBe("OBn");
  });

  it("is only the typing's: an Enter over a label, none typed, draws nothing out", () => {
    const { doc, st, x } = editor();
    st().beginLabelEdit(x, "O");
    st().setLabelEditValue("OMe");
    // (kept by a press away from it, not by Enter)
    st().commitLabelEdit("OMe", false);
    expect(st().keyAfterLabel(true)).toBe(false);
    expect(st().model.atoms.find((a) => a.id === x)?.el).toBe("OMe");
    // (and with nothing kept at all - an Enter while hovering a label)
    const steps = doc.history().undoDepth;
    expect(st().keyAfterLabel(true)).toBe(false);
    expect(doc.history().undoDepth).toBe(steps);
  });

  it("does nothing, saying nothing, for a label with nothing to draw out", () => {
    const { doc, st, x, typed } = editor();
    typed("N");
    const steps = doc.history().undoDepth;
    expect(st().keyAfterLabel(true)).toBe(true);
    expect(st().model.atoms.find((a) => a.id === x)?.el).toBe("N");
    expect(doc.history().undoDepth).toBe(steps);
  });
});
