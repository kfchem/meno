import { beforeEach, describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { drawingLayout } from "../fileActions";
import { MENO } from "../../../../lib/chem/style";
import { keptLabel } from "../../../../lib/chem/smartLabel";
import { labelReading } from "../utils/labelTyping";
import { useNotices } from "../../../notices";
import type { Model } from "./types";

// A carbon typed with its hydrogens - CH2, H2C, CH3, CH - is written out so: drawn labelled, its hydrogens its bonds' own, the compound
// as it was. Typed H its bonds do not give are said, the carbon drawn with its bonds' own.

/** A store holding `smiles` drawn, and a way to type `typed` over its `index`-th atom as the label box keeps it. */
function typing(smiles: string) {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const m = drawnFromSmiles(smiles);
  doc.edit("load", (d) => ({ ...d, model: m }));
  const s = () => store.getState();
  const type = (index: number, typed: string) => {
    const id = s().model.atoms[index].id;
    s().beginLabelEdit(id, "");
    s().setLabelEditValue(keptLabel(typed, labelReading));
    s().commitLabelEdit(typed);
    return s().model.atoms.find((a) => a.id === id)!;
  };
  const labels = () => drawingLayout(s().model as Model, { aromaticEnabled: false, aromaticRings: {} }, MENO).layout.texts.map((t) => t.text);
  return { s, type, labels };
}

describe("a carbon typed with its hydrogens", () => {
  beforeEach(() => useNotices.setState({ notices: [] }));

  it("is written out, the compound as it was: CH2 inside a chain, CH3 at its end, CH2 in a ring, CH on a double bond", { timeout: 60000 }, () => {
    for (const [smiles, index, typed, drawn] of [
      ["CCCCC", 2, "CH2", "CH2"],
      ["CCCCC", 2, "ch2", "CH2"],
      ["CCCCC", 0, "CH3", "H3C"],
      ["CCCCC", 0, "H3C", "H3C"],
      ["C1CCCCC1", 0, "CH2", "CH2"],
      ["C=CC", 1, "CH", "CH"],
    ] as const) {
      const t = typing(smiles);
      const atom = t.type(index, typed);
      expect([typed, atom.el, atom.shown, atom.charge ?? 0]).toEqual([typed, "C", true, 0]);
      expect(t.labels(), `${smiles} ${typed}`).toContain(drawn);
      expect(t.s().model.atoms.length, `${smiles} ${typed}`).toBe(drawnFromSmiles(smiles).atoms.length);
      expect(useNotices.getState().notices, `${smiles} ${typed}`).toEqual([]);
    }
  });

  it("is drawn with its bonds' hydrogens where those typed are not them, and says so", { timeout: 60000 }, () => {
    const t = typing("CC(C)C");
    // (the middle carbon has three bonds: CH, not the CH2 typed)
    const atom = t.type(1, "CH2");
    expect(atom.shown).toBe(true);
    expect(t.labels()).toContain("CH");
    const said = useNotices.getState().notices.find((n) => n.id === "carbon-written-hydrogens");
    expect(said?.text).toContain("CH2 was typed on a carbon whose bonds leave it one H");
    // (and the other way: CH on propane's middle carbon is drawn CH2, its count in words)
    useNotices.setState({ notices: [] });
    const p = typing("CCC");
    expect(p.type(1, "CH").shown).toBe(true);
    expect(p.labels()).toContain("CH2");
    expect(useNotices.getState().notices.find((n) => n.id === "carbon-written-hydrogens")?.text).toBe(
      "CH was typed on a carbon whose bonds leave it two H: it is drawn CH2, as its bonds have it.",
    );
  });

  it("typed as C alone, is written out with its hydrogens too: a bare C would say it has none (Brecher 2008, GR-2.1.1)", { timeout: 60000 }, () => {
    const t = typing("CCCCC");
    const atom = t.type(2, "C");
    expect(atom.shown).toBe(true);
    expect(t.labels()).toContain("CH2");
    expect(useNotices.getState().notices).toEqual([]);
  });

  it("stays a bare vertex where its menu's Edit label is left with the C it opens with, nothing typed", { timeout: 60000 }, () => {
    const t = typing("CCCCC");
    const id = t.s().model.atoms[2].id;
    t.s().beginLabelEdit(id, "C", { select: true });
    t.s().commitLabelEdit("C");
    const atom = t.s().model.atoms.find((a) => a.id === id)!;
    expect([atom.el, atom.shown]).toEqual(["C", undefined]);
    expect(t.labels()).not.toContain("CH2");
    // (one written out already stays so, left the same way)
    t.type(2, "CH2");
    t.s().beginLabelEdit(id, "C", { select: true });
    t.s().commitLabelEdit("C");
    expect(t.s().model.atoms.find((a) => a.id === id)!.shown).toBe(true);
  });

  it("is a bare vertex again once something else is typed over it",{ timeout: 60000 }, () => {
    const t = typing("CCCCC");
    t.type(2, "CH2");
    const atom = t.type(2, "N");
    expect([atom.el, atom.shown]).toEqual(["N", undefined]);
  });
});

describe("letters that read as nothing, typed over an atom", () => {
  beforeEach(() => useNotices.setState({ notices: [] }));
  const said = () => useNotices.getState().notices.find((n) => n.id === "label-read-as-nothing")?.text;

  it("are kept as typed, and Meno says the atom is no longer what it was: CH2CH2 over a carbon, over an N", { timeout: 60000 }, () => {
    const t = typing("CCCCC");
    expect(t.type(2, "CH2CH2").el).toBe("CH2CH2");
    expect(said()).toBe("CH2CH2 is not an element or a group Meno reads, so it is kept as words, and this atom is no longer a carbon. Undo brings the carbon back.");
    useNotices.setState({ notices: [] });
    const n = typing("CCNCC");
    expect(n.type(2, "CH2CH2").el).toBe("CH2CH2");
    expect(said()).toBe("CH2CH2 is not an element or a group Meno reads, so it is kept as words, and this atom is no longer N. Undo brings the N back.");
  });

  it("say nothing where what is typed is read - an element, a group, an Rgroup, a kind of group - or where the atom was words already", { timeout: 60000 }, () => {
    for (const typed of ["N", "OMe", "CO2Me", "R1", "PG", "Ar"]) {
      typing("CCCCC").type(2, typed);
      expect(said(), typed).toBeUndefined();
    }
    const t = typing("CCCCC");
    t.type(2, "CH2CH2");
    useNotices.setState({ notices: [] });
    expect(t.type(2, "CH2CH2CH2").el).toBe("CH2CH2CH2");
    expect(said()).toBeUndefined();
  });
});
