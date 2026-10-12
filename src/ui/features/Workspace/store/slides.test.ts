import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument, isBlankDocument } from "../document";
import { readWorkspace, workspaceText } from "../utils/workspace";
import { centredAt, clipItems, readRecord, recordText } from "../utils/copyPaste";

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, store, state: () => store.getState() };
}

const WIDE = { w: 32, h: 18 };

describe("slides on the page", () => {
  it("are put down last in the talk's order, each one step", () => {
    const { doc, state } = editor();
    const a = state().addSlide({ x: 0, y: 0, ...WIDE });
    const b = state().addSlide({ x: 50, y: 0, ...WIDE });
    expect(state().slides.map((s) => s.id)).toEqual([a, b]);
    expect(isBlankDocument(doc.getState())).toBe(false);
    expect(doc.history().undoDepth).toBe(2);
    // (one of no size, or nowhere, is not put down)
    expect(state().addSlide({ x: 0, y: 0, w: 0, h: 9 })).toBeNull();
    expect(state().addSlide({ x: Number.NaN, y: 0, ...WIDE })).toBeNull();
    doc.undo();
    expect(state().slides.map((s) => s.id)).toEqual([a]);
  });

  it("are moved and made larger, a drag one step; shown with the page about them, or not; never made nothing", () => {
    const { doc, state } = editor();
    const id = state().addSlide({ x: 0, y: 0, ...WIDE })!;
    for (const x of [1, 2, 3]) state().updateSlide(id, { x }, "drag");
    expect(state().slides[0].x).toBe(3);
    expect(doc.history().undoDepth).toBe(2);
    state().updateSlide(id, { w: 64, h: 36 }, "corner");
    expect(state().slides[0]).toMatchObject({ w: 64, h: 36 });
    state().updateSlide(id, { w: 0 });
    expect(state().slides[0].w).toBe(64);
    state().updateSlide(id, { around: true });
    expect(state().slides[0].around).toBe(true);
    // (a move keeps it so; asked, it goes)
    state().updateSlide(id, { x: 9 });
    expect(state().slides[0].around).toBe(true);
    state().updateSlide(id, { around: false });
    expect("around" in state().slides[0]).toBe(false);
  });

  it("are put earlier or later in the talk, the others moving up or down one, as one step", () => {
    const { doc, state } = editor();
    const ids = [0, 1, 2, 3].map((i) => state().addSlide({ x: 50 * i, y: 0, ...WIDE })!);
    const depth = doc.history().undoDepth;
    state().orderSlide(ids[3], 0);
    expect(state().slides.map((s) => s.id)).toEqual([ids[3], ids[0], ids[1], ids[2]]);
    state().orderSlide(ids[3], 9);
    expect(state().slides.map((s) => s.id)).toEqual([ids[0], ids[1], ids[2], ids[3]]);
    expect(doc.history().undoDepth).toBe(depth + 2);
    // (where it is already: no step)
    state().orderSlide(ids[3], 3);
    expect(doc.history().undoDepth).toBe(depth + 2);
    state().removeSlide(ids[1]);
    expect(state().slides.map((s) => s.id)).toEqual([ids[0], ids[2], ids[3]]);
  });

  it("are selected, moved and deleted with the rest of the selection", () => {
    const { state } = editor();
    const a = state().addSlide({ x: 0, y: 0, ...WIDE })!;
    const b = state().addSlide({ x: 50, y: 0, ...WIDE })!;
    state().selectAll();
    expect([...state().selSlides]).toEqual([a, b]);
    state().moveAtoms([], "drag", { slides: [{ id: a, x: 5, y: 6 }] });
    expect(state().slides[0]).toMatchObject({ x: 5, y: 6 });
    state().clearSel();
    expect(state().selSlides.size).toBe(0);
    state().selectSlides([b]);
    state().deleteSelection();
    expect(state().slides.map((s) => s.id)).toEqual([a]);
    expect(state().selSlides.size).toBe(0);
  });

  it("select what is on them: what lies within, the slide and those within it with it", () => {
    const { state } = editor();
    const outer = state().addSlide({ x: 0, y: 0, w: 64, h: 36 })!;
    const inner = state().addSlide({ x: 5, y: 5, ...WIDE })!;
    state().addSlide({ x: 200, y: 0, ...WIDE });
    state().addBondedPair({ x: -1, y: 0 }, { x: 1, y: 0 });
    state().addBondedPair({ x: 199, y: 0 }, { x: 201, y: 0 });
    state().selectOnSlide(outer);
    expect([...state().selSlides].sort()).toEqual([outer, inner].sort());
    expect(state().sel.atoms.size).toBe(2);
    expect([...state().sel.atoms].every((id) => Math.abs(state().model.atoms.find((x) => x.id === id)!.x) < 2)).toBe(true);
  });

  it("select the shapes on them too, by their middles", () => {
    const { state } = editor();
    const slide = state().addSlide({ x: 0, y: 0, w: 64, h: 36 })!;
    const inside = state().addShape({ kind: "rounded", x0: -5, y0: -3, x1: 5, y1: 3 })!;
    state().addShape({ kind: "rect", x0: 100, y0: 0, x1: 110, y1: 5 });
    state().selectOnSlide(slide);
    expect([...state().selShapes]).toEqual([inside]);
  });

  it("are copied and pasted, last in the talk, selected - in Meno's own record alone", () => {
    const { state } = editor();
    state().addSlide({ x: 0, y: 0, ...WIDE });
    const part = { atoms: [], bonds: [], slides: [{ id: 7, x: 10, y: 20, w: 32, h: 18, around: true as const }] };
    const items = clipItems(part);
    expect(items.map((i) => i.flavor)).toEqual(["meno"]);
    const back = readRecord(recordText(part))!;
    expect(back.slides).toEqual(part.slides);
    state().pasteModel(centredAt(back, { x: 100, y: 0 }));
    expect(state().slides).toHaveLength(2);
    expect(state().slides[1]).toMatchObject({ x: 100, y: 0, w: 32, h: 18, around: true });
    expect([...state().selSlides]).toEqual([state().slides[1].id]);
    // (what does not read is left out)
    const bad = readRecord(JSON.stringify({ format: "meno-structure", version: 1, atoms: [], bonds: [], slides: [{ id: 1, x: 0, y: 0, w: -1, h: 2 }, { id: 2, x: "a", y: 0, w: 1, h: 1 }] }))!;
    expect(bad.slides).toBeUndefined();
  });

  it("are saved in the workspace's file in the talk's order, and come back so", () => {
    const { state } = editor();
    const a = state().addSlide({ x: 0, y: 0, ...WIDE })!;
    const b = state().addSlide({ x: 50, y: 0, ...WIDE })!;
    state().orderSlide(b, 0);
    state().updateSlide(a, { around: true });
    const text = workspaceText(state());
    expect(JSON.parse(text).slides).toEqual([
      { id: b, x: 50, y: 0, w: 32, h: 18 },
      { id: a, x: 0, y: 0, w: 32, h: 18, around: true },
    ]);
    const other = editor();
    other.state().openWorkspace(readWorkspace(text)!, true);
    expect(other.state().slides).toEqual([
      { id: 1, x: 50, y: 0, w: 32, h: 18 },
      { id: 2, x: 0, y: 0, w: 32, h: 18, around: true },
    ]);
    expect(other.state().addSlide({ x: 0, y: 0, ...WIDE })).toBe(3);
  });

  it("are given in a talk: begun at one, gone on, ended - none to begin from, none; one undone, ended", () => {
    const { doc, state } = editor();
    state().present(0);
    expect(state().presenting).toBeNull();
    state().addSlide({ x: 0, y: 0, ...WIDE });
    state().addSlide({ x: 50, y: 0, ...WIDE });
    state().addBondedPair({ x: -1, y: 0 }, { x: 1, y: 0 });
    state().selectAll();
    state().present(5);
    expect(state().presenting).toEqual({ at: 1 });
    // (nothing selected as it begins)
    expect(state().sel.atoms.size).toBe(0);
    state().presentAt(0);
    expect(state().presenting).toEqual({ at: 0 });
    state().presentAt(2);
    expect(state().presenting).toEqual({ at: 0 });
    state().endPresenting();
    expect(state().presenting).toBeNull();
    state().present(1);
    doc.undo();
    doc.undo();
    // (fewer slides: at the last there is; none: ended)
    expect(state().presenting).toEqual({ at: 0 });
    doc.undo();
    expect(state().presenting).toBeNull();
  });
});
