import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { keptLabel } from "../../../../lib/chem/smartLabel";
import { labelReading } from "../utils/labelTyping";
import { enterKey, keyAfterKept } from "../components/pageField";

/** A key as a browser gives it. */
const key = (k: Partial<KeyboardEvent>) => ({ key: "", code: "", keyCode: 0, isComposing: false, repeat: false, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...k });
/** Enter as a Japanese input method on Windows gives it, nothing being composed: "Process", keyCode 229, the key pressed in `code`. */
const imeEnter = key({ key: "Process", code: "Enter", keyCode: 229 });
const plainEnter = key({ key: "Enter", code: "Enter", keyCode: 13 });

describe("Enter as an input method gives it (Windows)", () => {
  it("is Enter - nothing composed - and an Enter confirming what is composed is not", () => {
    expect(enterKey(plainEnter)).toBe(true);
    expect(enterKey(imeEnter)).toBe(true);
    expect(enterKey(key({ key: "Process", code: "NumpadEnter", keyCode: 229 }))).toBe(true);
    expect(enterKey(key({ key: "Process", code: "KeyA", keyCode: 229 }))).toBe(false);
    expect(enterKey(key({ ...imeEnter, isComposing: true }))).toBe(false);
    expect(enterKey(imeEnter, true)).toBe(false);
  });

  it("straight after a label kept by Enter, draws it out - any other key lets it be, a composed one is none", () => {
    expect(keyAfterKept(imeEnter)).toBe(true);
    expect(keyAfterKept(key({ key: "Process", code: "KeyA", keyCode: 229 }))).toBe(false);
    expect(keyAfterKept(key({ ...imeEnter, shiftKey: true }))).toBe(false);
    expect(keyAfterKept(key({ ...imeEnter, isComposing: true }))).toBe(null);
    expect(keyAfterKept(key({ ...plainEnter, repeat: true }))).toBe(null);
  });

  it("types OMe over an atom, kept by the field's Enter, drawn out by the next - both as the input method gives them", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    const c = st().addAtom(0, 0, "C");
    const x = st().addAtom(NOMINAL_BOND_LENGTH, 0, "C");
    st().addBond(c, x, 1);
    // (the field's Enter, as LabelTyping2D's `finish` keeps it)
    st().beginLabelEdit(x, "O");
    st().setLabelEditValue("OMe");
    expect(enterKey(imeEnter)).toBe(true);
    st().setLabelEditValue(keptLabel("OMe", labelReading));
    st().commitLabelEdit("OMe", true);
    expect(st().model.atoms.find((a) => a.id === x)?.el).toBe("OMe");
    expect(st().labelKept).not.toBeNull();
    // (the next Enter, as the window hears it)
    const after = keyAfterKept(imeEnter);
    expect(after).toBe(true);
    expect(st().keyAfterLabel(after!)).toBe(true);
    // (drawn out: an O on the atom, a methyl on it)
    expect(st().model.atoms.find((a) => a.id === x)?.el).toBe("O");
    expect(st().model.atoms.length).toBe(3);
  });
});

describe("Enter twice over a label kept as it was", () => {
  it("draws out a label typed over an atom that already said it - as a structure read from a figure has its groups", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    const c = st().addAtom(0, 0, "C");
    const x = st().addAtom(NOMINAL_BOND_LENGTH, 0, "OMe");
    st().addBond(c, x, 1);
    st().beginLabelEdit(x, "O");
    st().setLabelEditValue(keptLabel("OMe", labelReading));
    st().commitLabelEdit("OMe", true);
    expect(st().labelEnd?.how).toBe("same");
    expect(st().labelKept).not.toBeNull();
    expect(st().keyAfterLabel(true)).toBe(true);
    expect(st().model.atoms.find((a) => a.id === x)?.el).toBe("O");
    expect(st().model.atoms.length).toBe(3);
  });
});
