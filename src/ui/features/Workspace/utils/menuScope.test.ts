import { describe, expect, it } from "vitest";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import { menuScope } from "./menuScope";

// A right-click menu's first line: what it acts on (docs/EDITOR-2D.md, *Selecting*).

function page() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  const a = st().addAtom(0, 0, "C");
  const b = st().addAtom(1, 0.5, "C");
  const c = st().addAtom(2, 0, "C");
  const d = st().addAtom(3, 0.5, "C");
  return { st, a, b, c, d, ab: st().addBond(a, b), bc: st().addBond(b, c), cd: st().addBond(c, d) };
}

describe("a right-click menu's first line", () => {
  it("says the one thing where it is selected alone: an atom, a bond with its atoms", () => {
    const { st, a, ab } = page();
    st().selectAlone("atom", a);
    expect(menuScope(st(), "atom", a)).toEqual({ thing: "This atom", count: "This atom", more: false, ofKind: "1 atom" });
    st().selectAlone("bond", ab);
    expect(menuScope(st(), "bond", ab)).toEqual({ thing: "This bond", count: "This bond", more: false, ofKind: "1 bond" });
  });

  it("counts the selection by kind where it holds more: 3 atoms; 4 atoms, 2 bonds", () => {
    const { st, a, b, c, ab, bc } = page();
    st().setSel({ atoms: new Set([a, b, c]), bonds: new Set() });
    expect(menuScope(st(), "atom", b)).toEqual({ thing: "This atom", count: "3 atoms", more: true, ofKind: "3 atoms" });
    st().setSel({ atoms: new Set([a, b, c]), bonds: new Set([ab, bc]) });
    expect(menuScope(st(), "bond", ab)).toMatchObject({ count: "3 atoms, 2 bonds", more: true });
  });
});

describe("a right-click on a thing not selected", () => {
  it("selects it alone, whatever was selected let go - a structure's atoms let go for one atom; for a bond, the bond and its atoms", () => {
    const { st, a, b, c, d, ab, cd } = page();
    st().setSel({ atoms: new Set([a, b, c]), bonds: new Set([ab]) });
    st().selectAlone("atom", d);
    expect([[...st().sel.atoms], [...st().sel.bonds]]).toEqual([[d], []]);
    st().selectAlone("bond", cd);
    expect([[...st().sel.atoms].sort(), [...st().sel.bonds]]).toEqual([[c, d].sort(), [cd]]);
  });
});
