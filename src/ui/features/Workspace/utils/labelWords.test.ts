import { describe, expect, it } from "vitest";
import { labelReading } from "./labelTyping";
import { keptLabel, liveLabel } from "../../../../lib/chem/smartLabel";
import { LabelWords } from "./labelWords";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import { buildTextLabels } from "../../../../lib/chem/layout2d";
import { DEFAULT_STYLE_CHOICE, styleOf } from "../../../../lib/chem/style";
import { editorLayoutOptions, layoutBonds } from "../layoutOptions";

describe("a label typed in place", () => {
  it("is one line: a new line typed or pasted is none, the caret after what went in", () => {
    const ed = new LabelWords("O");
    ed.replaceSelection("M\ne");
    expect(ed.text).toBe("OMe");
    expect(ed.sel).toEqual({ anchor: 3, head: 3 });
    ed.replaceSelection("\n");
    expect(ed.text).toBe("OMe");
  });

  it("shows what is typed as it is meant once the input method has given it - the caret kept, what was typed kept", () => {
    const ed = new LabelWords("");
    ed.reading = (t) => liveLabel(t, labelReading);
    ed.replaceSelection("c");
    expect(ed.text).toBe("C");
    ed.replaceSelection("o2me");
    expect(ed.text).toBe("CO2Me");
    expect(ed.typed).toBe("co2me");
    expect(ed.sel.head).toBe(5);
    // (composing: left as the input method has it)
    ed.setComposing({ from: 5, to: 5, text: "ｈ", sel: [1, 1] });
    expect(ed.text).toBe("CO2Me");
    ed.setComposing(null);
    // (full-width letters, as an input method gives them, as the ordinary ones)
    const fw = new LabelWords("");
    fw.reading = (t) => liveLabel(t, labelReading);
    fw.edit({ from: 0, to: 0, insert: "ｏｍｅ" });
    expect(fw.typed).toBe("ome");
    expect(fw.text).toBe("OMe");
    // (a letter deleted: read again from what is left)
    fw.command({ kind: "delete", unit: "letter", dir: -1 }, true);
    expect(fw.typed).toBe("om");
    expect(fw.text).toBe("om");
  });

  it("kept and changed, is drawn as written until the drawing's own label is; let go or unchanged, it is not", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const s = () => store.getState();
    const id = s().addAtom(0, 0, "C");
    s().beginLabelEdit(id);
    const n = s().labelEdit.n!;
    s().setLabelEditValue("N");
    s().commitLabelEdit();
    expect(s().labelLeft).toEqual({ atomId: id, n, text: "N" });
    s().labelShown();
    expect(s().labelLeft).toBeNull();
    // (each edit its own number; the same label again changes nothing)
    s().beginLabelEdit(id);
    expect(s().labelEdit.n).toBeGreaterThan(n);
    s().setLabelEditValue("N");
    s().commitLabelEdit();
    expect(s().labelLeft).toBeNull();
    s().beginLabelEdit(id);
    s().cancelLabelEdit();
    expect(s().labelLeft).toBeNull();
  });

  it("read as something else than was typed, is had back as typed from the atom's menu - one step", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const s = () => store.getState();
    const id = s().addAtom(0, 0, "C");
    s().beginLabelEdit(id, "o");
    s().setLabelEditValue("OBz");
    s().commitLabelEdit("obz");
    expect(s().model.atoms[0]).toMatchObject({ el: "OBz", typed: "obz" });
    s().labelAsTyped(id);
    expect(s().model.atoms[0].el).toBe("obz");
    expect(s().model.atoms[0].typed).toBeUndefined();
    doc.undo();
    expect(s().model.atoms[0]).toMatchObject({ el: "OBz", typed: "obz" });
    // (typed as it reads: nothing to have back)
    s().beginLabelEdit(id, "");
    s().setLabelEditValue("OMe");
    s().commitLabelEdit("OMe");
    expect(s().model.atoms[0].typed).toBeUndefined();
  });

  it("typed any way, is kept as one label, drawn as it reads from its bond on either side - and had back as typed (the maintainer, 2026-10-11)", () => {
    const opts = editorLayoutOptions(styleOf(DEFAULT_STYLE_CHOICE));
    // (the label, as it is drawn where its bond leaves to the left, then the ways of typing it)
    for (const [label, drawn, ...typings] of [
      ["OH", "HO", "OH", "oh", "HO", "ho"],
      ["OAc", "AcO", "OAc", "oac", "AcO", "aco"],
      ["OMe", "MeO", "OMe", "ome", "MeO", "meo"],
      ["OBn", "BnO", "OBn", "obn", "BnO", "bno"],
      ["NHAc", "AcHN", "NHAc", "nhac", "AcHN", "achn", "HNAc", "hnac"],
      ["CO2Me", "MeO2C", "CO2Me", "co2me", "MeO2C", "meo2c"],
    ]) {
      // (its atom right of a carbon, the bond leaving to the left; then left of it)
      for (const side of [1, -1]) {
        for (const typed of typings) {
          const doc = createWorkspaceDocument();
          const store = createEditorStore(doc);
          connectStoreToDocument(store, doc);
          const s = () => store.getState();
          const c = s().addAtom(0, 0, "C");
          const x = s().addAtomBonded(c, side * 1.5, 0, "C", 1);
          s().beginLabelEdit(x, "");
          s().setLabelEditValue(keptLabel(typed, labelReading));
          s().commitLabelEdit(typed);
          const { atoms, bonds } = s().model;
          const at = atoms.findIndex((a) => a.id === x);
          const text = buildTextLabels(atoms, opts, layoutBonds(bonds, new Map(atoms.map((a, i) => [a.id, i])))).find((t) => t.atom === at && !t.beside)?.text;
          expect(text, `${typed} ${side > 0 ? "right" : "left"}`).toBe(side > 0 ? label : drawn);
          // (what was typed, where it is not what is kept: in the atom's menu, As typed)
          expect(atoms[at].typed, typed).toBe(typed === label ? undefined : typed);
        }
      }
    }
    // (HO typed as it is drawn: OH, HO to be had back - one step)
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const s = () => store.getState();
    const id = s().addAtom(0, 0, "C");
    s().beginLabelEdit(id, "");
    s().setLabelEditValue(keptLabel("HO", labelReading));
    s().commitLabelEdit("HO");
    expect(s().model.atoms[0]).toMatchObject({ el: "O", typed: "HO" });
    s().labelAsTyped(id);
    expect(s().model.atoms[0].el).toBe("HO");
    doc.undo();
    expect(s().model.atoms[0]).toMatchObject({ el: "O", typed: "HO" });
  });
});
