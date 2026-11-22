import { describe, expect, it } from "vitest";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import { menuScope, reachedOf, wholeStructures } from "./menuScope";

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
    expect(menuScope(st(), "atom", a)).toEqual({ thing: "This atom", count: "This atom", more: false, ofKind: "1 atom", whole: false });
    st().selectAlone("bond", ab);
    expect(menuScope(st(), "bond", ab)).toEqual({ thing: "This bond", count: "This bond", more: false, ofKind: "1 bond", whole: false });
  });

  it("counts the selection by kind where it holds more: 3 atoms; 4 atoms, 2 bonds", () => {
    const { st, a, b, c, ab, bc } = page();
    st().setSel({ atoms: new Set([a, b, c]), bonds: new Set() });
    expect(menuScope(st(), "atom", b)).toEqual({ thing: "This atom", count: "3 atoms", more: true, ofKind: "3 atoms", whole: false });
    st().setSel({ atoms: new Set([a, b, c]), bonds: new Set([ab, bc]) });
    expect(menuScope(st(), "bond", ab)).toMatchObject({ count: "3 atoms, 2 bonds", more: true });
  });
});

describe("whole structures selected", () => {
  it("are every atom of each structure and every bond between them, more than the one thing", () => {
    const { st, a, b, c, d, ab, bc, cd } = page();
    // (one structure a-b-c-d, all of it)
    st().setSel({ atoms: new Set([a, b, c, d]), bonds: new Set([ab, bc, cd]) });
    expect(wholeStructures(st())).toBe(true);
    expect(menuScope(st(), "atom", b).whole).toBe(true);
    expect(menuScope(st(), "bond", bc).whole).toBe(true);
  });

  it("are not half a structure: an atom missing, or a bond missing between atoms held", () => {
    const { st, a, b, c, d, ab, bc, cd } = page();
    st().setSel({ atoms: new Set([a, b, c]), bonds: new Set([ab, bc]) });
    expect(wholeStructures(st())).toBe(false);
    st().setSel({ atoms: new Set([a, b, c, d]), bonds: new Set([ab, bc]) });
    expect(wholeStructures(st())).toBe(false);
    expect(menuScope(st(), "atom", b).whole).toBe(false);
    st().setSel({ atoms: new Set([a, b, c, d]), bonds: new Set([cd, bc, ab]) });
    expect(wholeStructures(st())).toBe(true);
  });

  it("are two whole structures together, but not one whole beside an atom of another", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    const [a, b, c, d, e] = [0, 1, 2, 3, 4].map((i) => st().addAtom(i * 2, 0, "C"));
    const ab = st().addBond(a, b);
    const cd = st().addBond(c, d);
    st().setSel({ atoms: new Set([a, b, c, d]), bonds: new Set([ab, cd]) });
    expect(wholeStructures(st())).toBe(true);
    // (e is a lone atom, a structure of its own; one atom of a structure with its neighbour left out is half of one)
    st().setSel({ atoms: new Set([a, b, c]), bonds: new Set([ab]) });
    expect(wholeStructures(st())).toBe(false);
    st().setSel({ atoms: new Set([a, b, e]), bonds: new Set([ab]) });
    expect(wholeStructures(st())).toBe(true);
  });

  it("is not said of one atom or one bond alone", () => {
    const { st, a, b, ab } = page();
    st().selectAlone("atom", a);
    expect(menuScope(st(), "atom", a).whole).toBe(false);
    st().selectAlone("bond", ab);
    expect(menuScope(st(), "bond", ab).whole).toBe(false);
    void b;
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

describe("what a menu's own items reach", () => {
  it("is the selected things of its kind where the menu is the selection's and the thing is among them; else the thing alone", () => {
    expect(reachedOf({ selection: "here" }, new Set([3, 5, 7]), 5)).toEqual([5, 3, 7]);
    expect(reachedOf({ selection: "here" }, new Set([3, 7]), 5)).toEqual([5]);
    expect(reachedOf({ selection: "none" }, new Set([3, 5]), 5)).toEqual([5]);
  });

  it("as one undo step: words given a size together, each its own patch", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    const a = st().addCaption("one", 0, 0);
    const b = st().addCaption("two", 5, 0);
    const depth = doc.history().undoDepth;
    st().updateCaptions(reachedOf({ selection: "here" }, new Set([a, b]), a).map((id) => [id, { size: 14 }] as const), "size text");
    expect(doc.history().undoDepth).toBe(depth + 1);
    expect(st().captions.map((c) => c.size)).toEqual([14, 14]);
    doc.undo();
    expect(st().captions.map((c) => c.size ?? null)).toEqual([null, null]);
  });
});
