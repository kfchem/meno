import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import { gestureUnderWay, letLostGesturesGo, wordsUnderWay } from "./gesture";

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

  it("is a stroke of ink being drawn", () => {
    const { st } = editor();
    st().setInkDraft({ look: { pen: "pen", width: 1 }, stroke: { points: [0, 0, 0.5] } });
    expect(gestureUnderWay(st())).toBe(true);
    st().setInkDraft(null);
    expect(gestureUnderWay(st())).toBe(false);
  });
});

describe("words typed on the page, whose undo is the words' own", () => {
  it("are an atom's label being typed, until it is kept or let go", () => {
    const { st } = editor();
    const id = st().addAtom(0, 0, "C");
    expect(wordsUnderWay(st())).toBe(false);
    st().beginLabelEdit(id);
    expect(wordsUnderWay(st())).toBe(true);
    expect(gestureUnderWay(st())).toBe(false);
    st().cancelLabelEdit();
    expect(wordsUnderWay(st())).toBe(false);
  });

  it("are words on the page being typed", () => {
    const { st } = editor();
    st().setCaptionEdit({ id: null, at: { x: 0, y: 0 }, n: 1 });
    expect(wordsUnderWay(st())).toBe(true);
    st().setCaptionEdit(null);
    expect(wordsUnderWay(st())).toBe(false);
  });
});

describe("a gesture lost, the window left or the pointer taken", () => {
  const underWay = (st: () => ReturnType<ReturnType<typeof editor>["st"]>) => {
    st().startChainAt(0, 0, true);
    st().setShapeDraft({ kind: "rect", from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, even: false });
    st().setInkDraft({ look: { pen: "pen", width: 1 }, stroke: { points: [0, 0, 0.5] } });
    st().setBoxSelect({ active: true, kind: "box", points: [{ x: 0, y: 0 }] });
    st().beginPanHold(1);
  };

  it("leaves no flag behind to take every undo after it, and lets the gesture go by its Escape first", () => {
    for (const type of ["blur", "pointercancel"]) {
      const { st } = editor();
      const target = new EventTarget();
      let escaped = 0;
      const stop = letLostGesturesGo(target, st, () => escaped++);
      underWay(st);
      expect(gestureUnderWay(st())).toBe(true);
      target.dispatchEvent(new Event(type));
      expect(escaped).toBe(1);
      expect(gestureUnderWay(st())).toBe(false);
      stop();
    }
  });

  it("keeps what is drawn, being typed, and the electron-pushing mode", () => {
    const { st } = editor();
    const id = st().addAtom(0, 0, "C");
    st().beginLabelEdit(id);
    st().setPushDraw({ from: { atom: id }, half: true, pointer: { x: 1, y: 1 }, to: null });
    st().endGestures();
    expect(st().model.atoms).toHaveLength(1);
    expect(st().labelEdit.active).toBe(true);
    expect(st().pushDraw).toEqual({ from: null, half: true, pointer: null, to: null });
  });

  it("does nothing on a page at rest, nor once it is no longer listened for", () => {
    const { st } = editor();
    const target = new EventTarget();
    let escaped = 0;
    const stop = letLostGesturesGo(target, st, () => escaped++);
    target.dispatchEvent(new Event("blur"));
    expect(escaped).toBe(0);
    stop();
    underWay(st);
    target.dispatchEvent(new Event("pointercancel"));
    expect(escaped).toBe(0);
    expect(gestureUnderWay(st())).toBe(true);
  });
});
