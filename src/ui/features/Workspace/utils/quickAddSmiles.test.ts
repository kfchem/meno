import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import type { EditorState, Model } from "../store/types";
import { namedDrawn, putDownSmiles } from "./quickAddSmiles";
import { isElementSymbol } from "../../../../lib/roles/molblock";

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, store, st: () => store.getState() };
}

/** Ethanol as the plugin would give it back: three atoms in a row. */
const ethanol = (): Model => ({
  atoms: [
    { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
    { id: 2, x: 1.3, y: 0.75, r: 0.9, el: "C" },
    { id: 3, x: 2.6, y: 0, r: 0.9, el: "O" },
  ],
  bonds: [
    { id: 1, a: 1, b: 2, order: 1 },
    { id: 2, a: 2, b: 3, order: 1 },
  ],
});

const opened = (st: () => EditorState): NonNullable<EditorState["quickAdd"]> => {
  const q = { at: { x: 10, y: 5 }, x: 100, y: 100, within: { width: 800, height: 600 } };
  st().setQuickAdd(q);
  return st().quickAdd!;
};

describe("a SMILES typed in Quick Add", () => {
  it("is drawn where Quick Add was opened, once read, and Quick Add closes", () => {
    const { store, st } = editor();
    const asked = opened(st);
    expect(putDownSmiles(store, asked, ethanol())).toBe(true);
    expect(st().model.atoms).toHaveLength(3);
    expect(st().quickAdd).toBeNull();
  });

  it("is not drawn should Quick Add go while it is read - Escape, a press elsewhere, another opened", () => {
    const { store, st } = editor();
    const asked = opened(st);
    st().setQuickAdd(null);
    expect(putDownSmiles(store, asked, ethanol())).toBe(false);
    expect(st().model.atoms).toHaveLength(0);
    // (another opened meanwhile: not the one it was typed in)
    const first = opened(st);
    opened(st);
    expect(putDownSmiles(store, first, ethanol())).toBe(false);
    expect(st().model.atoms).toHaveLength(0);
  });

  it("is drawn once for an Enter pressed twice, as quick as the first: the second reading finds its Quick Add gone", () => {
    const { doc, store, st } = editor();
    const asked = opened(st);
    expect(putDownSmiles(store, asked, ethanol())).toBe(true);
    expect(putDownSmiles(store, asked, ethanol())).toBe(false);
    expect(st().model.atoms).toHaveLength(3);
    doc.undo();
    expect(st().model.atoms).toHaveLength(0);
  });
});

describe("a molecule the dictionary has, typed in Quick Add", () => {
  it("is drawn out as the canvas draws its label out: its atoms, each an element, none left a label", () => {
    for (const [label, atoms, bonds] of [["DMF", 5, 4], ["Et3N", 7, 6], ["THF", 5, 5], ["PdCl2", 3, 2]] as const) {
      const m = namedDrawn(label);
      expect([label, m.atoms.length, m.bonds.length]).toEqual([label, atoms, bonds]);
      expect(m.atoms.every((a) => isElementSymbol(a.el))).toBe(true);
    }
  });

  it("is put down where Quick Add was opened, as a SMILES read is", () => {
    const { store, st } = editor();
    const asked = opened(st);
    expect(putDownSmiles(store, asked, namedDrawn("DMF"))).toBe(true);
    expect(st().model.atoms.map((a) => a.el).sort()).toEqual(["C", "C", "C", "N", "O"]);
  });
});
