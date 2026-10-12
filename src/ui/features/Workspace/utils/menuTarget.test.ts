import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import { menuTargetGone } from "./menuTarget";
import type { MenuTarget } from "../PartMenu";

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, store, state: () => store.getState() };
}

const on = (kind: MenuTarget["kind"], id: number | null): MenuTarget => ({
  kind,
  id,
  selection: "none",
  at: { x: 0, y: 0 },
  x: 0,
  y: 0,
  within: { width: 800, height: 600 },
});

describe("a right-click menu over a part gone (Workspace closes it)", () => {
  it("knows words, an arrow, a plus undone away while their menu is open - Cmd+Z reaches the document with it open", () => {
    const { doc, store, state } = editor();
    const words = state().addCaption("K2CO3, DMF", 1, 2);
    const arrow = state().addArrow(4, 0);
    const plus = state().addPlus(8, 0);
    for (const t of [on("caption", words), on("arrow", arrow), on("plus", plus)]) expect(menuTargetGone(t, store.getState())).toBe(false);
    // (the plus undone: its menu's part gone, the others' still there)
    doc.undo();
    expect(menuTargetGone(on("plus", plus), state())).toBe(true);
    expect(menuTargetGone(on("arrow", arrow), state())).toBe(false);
    doc.undo();
    doc.undo();
    expect(menuTargetGone(on("caption", words), state())).toBe(true);
    expect(menuTargetGone(on("arrow", arrow), state())).toBe(true);
    // (back again with redo: there)
    doc.redo();
    expect(menuTargetGone(on("caption", words), state())).toBe(false);
  });

  it("knows writing by hand rubbed out or undone away", () => {
    const { doc, state } = editor();
    const k = state().writeStroke({ pen: "pen", width: 1 }, { points: [0, 0, 0.5, 1, 1, 0.5] })!;
    expect(menuTargetGone(on("ink", k), state())).toBe(false);
    doc.undo();
    expect(menuTargetGone(on("ink", k), state())).toBe(true);
  });

  it("knows an atom deleted, and leaves a menu on empty space be", () => {
    const { state } = editor();
    const c = state().addAtom(0, 0, "C");
    expect(menuTargetGone(on("atom", c), state())).toBe(false);
    state().deleteAtom(c);
    expect(menuTargetGone(on("atom", c), state())).toBe(true);
    expect(menuTargetGone(on(null, null), state())).toBe(false);
  });
});
