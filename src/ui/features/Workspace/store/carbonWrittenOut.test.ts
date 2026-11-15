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
import { measured } from "../../../../testing/timeouts";

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
  // (begun as the label box is begun: from the menu, with what it opens with, or by a letter typed - then typed on to `typed`)
  const begun = (index: number, initial: string, how: { select?: boolean } | undefined, typed: string) => {
    const id = s().model.atoms[index].id;
    s().beginLabelEdit(id, initial, how);
    s().setLabelEditValue(keptLabel(typed, labelReading));
    s().commitLabelEdit(typed);
    return s().model.atoms.find((a) => a.id === id)!;
  };
  const labels = () => drawingLayout(s().model as Model, { aromaticEnabled: false, aromaticRings: {} }, MENO).layout.texts.map((t) => t.text);
  return { s, type, begun, labels };
}

describe("a carbon typed with its hydrogens", () => {
  beforeEach(() => useNotices.setState({ notices: [] }));

  it("is written out, the compound as it was: CH2 inside a chain, CH3 at its end, CH2 in a ring, CH on a double bond", () => {
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
  }, measured(3000));

  it("is drawn with its bonds' hydrogens where those typed are not them, and says so", () => {
    const t = typing("CC(C)C");
    // (the middle carbon has three bonds: CH, not the CH2 typed)
    const atom = t.type(1, "CH2");
    expect(atom.shown).toBe(true);
    expect(t.labels()).toContain("CH");
    const said = useNotices.getState().notices.find((n) => n.id === "carbon-written-hydrogens");
    expect(said?.text).toBe("CH2 was typed on a carbon whose bonds leave it one H: it is drawn CH, as its bonds have it.");
    // (and the other way: CH on propane's middle carbon is drawn CH2, its count in words)
    useNotices.setState({ notices: [] });
    const p = typing("CCC");
    expect(p.type(1, "CH").shown).toBe(true);
    expect(p.labels()).toContain("CH2");
    expect(useNotices.getState().notices.find((n) => n.id === "carbon-written-hydrogens")?.text).toBe(
      "CH was typed on a carbon whose bonds leave it two H: it is drawn CH2, as its bonds have it.",
    );
  }, measured(3000));

  it("typed as C alone, is written out with its hydrogens too: a bare C would say it has none (Brecher 2008, GR-2.1.1)", () => {
    const t = typing("CCCCC");
    const atom = t.type(2, "C");
    expect(atom.shown).toBe(true);
    expect(t.labels()).toContain("CH2");
    expect(useNotices.getState().notices).toEqual([]);
  }, measured(3000));

  it("keeps its charge and its mass number, as it keeps an unpaired electron: the compound never changes", () => {
    // (the 2-propyl cation's carbon written CH: its C with the charge and its H - stacked between its bonds, the charge on the C's line -
    //  the count right, nothing said; the carbanion's the same; C alone too)
    for (const [smiles, typed, charge, drawn] of [
      ["C[CH+]C", "CH", 1, /^C\+H$/],
      ["C[CH-]C", "CH", -1, /^C[-−]H$/],
      ["C[CH+]C", "C", 1, /^C\+H$/],
    ] as const) {
      useNotices.setState({ notices: [] });
      const t = typing(smiles);
      const atom = t.type(1, typed);
      expect([atom.el, atom.shown, atom.charge], `${smiles} ${typed}`).toEqual(["C", true, charge]);
      expect(t.labels().some((l) => drawn.test(l)), `${smiles} ${typed}: ${t.labels().join(" ")}`).toBe(true);
      expect(useNotices.getState().notices, `${smiles} ${typed}`).toEqual([]);
    }
    // (a 13C methyl written CH3, or C: still 13C)
    for (const typed of ["CH3", "C"]) {
      const t = typing("[13CH3]CC");
      const atom = t.type(0, typed);
      expect([atom.shown, atom.isotope], typed).toEqual([true, 13]);
    }
    // (another is given by typing it: CH+ over a neutral carbon, CH with the long minus sign too, 12C over the 13C - still written out)
    expect(typing("CCC").type(1, "CH+").charge).toBe(1);
    expect(typing("CCC").type(1, "CH\u2212").charge).toBe(-1);
    const twelve = typing("[13CH3]CC").type(0, "12CH3");
    expect([twelve.shown, twelve.isotope]).toEqual([true, 12]);
  }, measured(3000));

  it("stays a bare vertex where its menu's Edit label is left with the C it opens with, nothing typed", () => {
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
  }, measured(3000));

  it("is written out from the menu's Edit label where something is typed over the C it opens with, and begun by a letter C typed", () => {
    // (the menu on a corner opens with C selected: CH2 typed over it, or CH3 at a chain's end, writes the carbon out)
    for (const [index, typed] of [
      [2, "CH2"],
      [0, "CH3"],
    ] as const) {
      const atom = typing("CCCCC").begun(index, "C", { select: true }, typed);
      expect([typed, atom.shown]).toEqual([typed, true]);
    }
    // (begun by the letter C typed over the corner and kept so: written out, CH2 - it is not the menu's C left as it was)
    const t = typing("CCCCC");
    expect(t.begun(2, "C", undefined, "C").shown).toBe(true);
    expect(t.labels()).toContain("CH2");
  }, measured(3000));

  it("on several atoms selected, says the first whose bonds do not give the H typed - the one begun on, then the others", () => {
    // (isobutane: its middle carbon has three bonds - one H - and an end carbon one bond - three H; CH2 typed fits neither)
    const t = typing("CC(C)C");
    const [end, middle] = [t.s().model.atoms[0].id, t.s().model.atoms[1].id];
    t.s().setSel({ atoms: new Set([end, middle]), bonds: new Set() });
    t.s().beginLabelEdit(middle, "C");
    t.s().setLabelEditValue("CH2");
    t.s().commitLabelEdit("CH2");
    expect(t.s().model.atoms.filter((a) => a.shown).map((a) => a.id).sort()).toEqual([end, middle].sort());
    expect(useNotices.getState().notices.find((n) => n.id === "carbon-written-hydrogens")?.text).toBe("CH2 was typed on a carbon whose bonds leave it one H: it is drawn CH, as its bonds have it.");
  }, measured(3000));

  it("is a bare vertex again once something else is typed over it", () => {
    const t = typing("CCCCC");
    t.type(2, "CH2");
    const atom = t.type(2, "N");
    expect([atom.el, atom.shown]).toEqual(["N", undefined]);
  }, measured(3000));
});

describe("letters that read as nothing, typed over an atom", () => {
  beforeEach(() => useNotices.setState({ notices: [] }));
  const said = () => useNotices.getState().notices.find((n) => n.id === "label-read-as-nothing")?.text;

  it("are kept as typed, and Meno says the atom is no longer what it was: CH2CH2 over a carbon, over an N", () => {
    const t = typing("CCCCC");
    expect(t.type(2, "CH2CH2").el).toBe("CH2CH2");
    expect(said()).toBe("CH2CH2 is not an element or a group Meno reads, so it is kept as words, and this atom is no longer a carbon. Undo brings the carbon back.");
    useNotices.setState({ notices: [] });
    const n = typing("CCNCC");
    expect(n.type(2, "CH2CH2").el).toBe("CH2CH2");
    expect(said()).toBe("CH2CH2 is not an element or a group Meno reads, so it is kept as words, and this atom is no longer N. Undo brings the N back.");
  }, measured(3000));

  it("are drawn in the order typed at either end of a chain - never turned round as a group at a left end is", () => {
    // (pentane's first carbon, its bond coming in from the right, and its last, its bond from the left)
    for (const index of [0, 4]) {
      const t = typing("CCCCC");
      t.type(index, "CH2CH2");
      expect(t.labels(), `${index}`).toContain("CH2CH2");
      expect(t.labels(), `${index}`).not.toContain("H2CH2C");
    }
    // (a group Meno reads, at the left end: turned round as before - MeO)
    const g = typing("CCCCC");
    g.type(0, "OMe");
    expect(g.labels()).toContain("MeO");
  }, measured(3000));

  it("on several atoms selected, names the one begun on: N first, then a carbon - 'no longer N'", () => {
    const t = typing("CCNCC");
    const [c, n] = [t.s().model.atoms[1].id, t.s().model.atoms[2].id];
    t.s().setSel({ atoms: new Set([c, n]), bonds: new Set() });
    t.s().beginLabelEdit(n, "x");
    t.s().setLabelEditValue("xyz");
    t.s().commitLabelEdit("xyz");
    expect(t.s().model.atoms.filter((a) => a.id === c || a.id === n).map((a) => a.el)).toEqual(["xyz", "xyz"]);
    expect(said()).toBe("xyz is not an element or a group Meno reads, so it is kept as words, and this atom is no longer N. Undo brings the N back.");
  }, measured(3000));

  it("say nothing where what is typed is read - an element, a group, an Rgroup, a kind of group - or where the atom was words already", () => {
    for (const typed of ["N", "OMe", "CO2Me", "R1", "PG", "Ar"]) {
      typing("CCCCC").type(2, typed);
      expect(said(), typed).toBeUndefined();
    }
    const t = typing("CCCCC");
    t.type(2, "CH2CH2");
    useNotices.setState({ notices: [] });
    expect(t.type(2, "CH2CH2CH2").el).toBe("CH2CH2CH2");
    expect(said()).toBeUndefined();
  }, measured(3000));
});
