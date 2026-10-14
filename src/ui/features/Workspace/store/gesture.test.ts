import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import { gestureUnderWay } from "./gesture";

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, st: () => store.getState() };
}

describe("a gesture under way, which undo lets go as Escape does", () => {
  it("is none on a page at rest", () => {
    expect(gestureUnderWay(editor().st())).toBe(false);
  });

  it("is a chain being drawn, until it is drawn or let go", () => {
    const { st } = editor();
    st().startChainAt(0, 0, true);
    expect(gestureUnderWay(st())).toBe(true);
    st().cancelExtend();
    expect(gestureUnderWay(st())).toBe(false);
  });

  it("is a shape being drawn, an arrow drawn, a box drawn, a drag held", () => {
    const { st } = editor();
    st().setShapeDraft({ kind: "rect", from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, even: false });
    expect(gestureUnderWay(st())).toBe(true);
    st().setShapeDraft(null);
    st().setBoxSelect({ active: true, kind: "box", points: [{ x: 0, y: 0 }] });
    expect(gestureUnderWay(st())).toBe(true);
    st().setBoxSelect({ active: false, kind: "box", points: [] });
    st().beginPanHold(1);
    expect(gestureUnderWay(st())).toBe(true);
    st().endPanHold(1);
    expect(gestureUnderWay(st())).toBe(false);
  });

  it("is an electron-pushing arrow once begun from an atom, not the mode waiting for one", () => {
    const { st } = editor();
    st().setPushDraw({ from: null, half: false, pointer: null, to: null });
    expect(gestureUnderWay(st())).toBe(false);
  });
});
