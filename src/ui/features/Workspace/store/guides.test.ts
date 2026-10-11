import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import { guideMove, guideWidth } from "../utils/guiding";

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, store, state: () => store.getState() };
}

// (a hundred pixels of the screen to a unit of the page, y up)
const toWorld = (cx: number, cy: number) => ({ x: cx / 100, y: -cy / 100 });
const keys = { shiftKey: false, metaKey: false, ctrlKey: false };

describe("guides as what is selected is moved", () => {
  it("line it up with what is near - its middle with another's - and show it, Ctrl holding them off and Shift keeping one way", () => {
    const { store, state } = editor();
    const a = state().addCaption("Alpha", 0, 0);
    state().addCaption("Beta", 6, 5.03);
    state().selectCaptions([a]);
    const g = guideMove(store, toWorld, { x: 0, y: 0 });
    // (5 up: 0.03 off the other's middle, within 6 pixels - it lines up)
    const d = g.step(1, 5, keys);
    expect(d.y).toBeCloseTo(5.03);
    expect(state().guides?.lines.length).toBeGreaterThan(0);
    // (Ctrl - ⌘ on a Mac, where the tests may run: as moved, nothing shown)
    expect(g.step(1, 5, { ...keys, ctrlKey: true, metaKey: true })).toEqual({ x: 1, y: 5 });
    expect(state().guides).toBeNull();
    // (Shift: the way it went most, alone)
    expect(g.step(4, 0.5, { ...keys, shiftKey: true }).y).toBe(0);
    g.step(1, 5, keys);
    g.end();
    expect(state().guides).toBeNull();
  });

  it("make words as wide as other words near them, but not their own width as it was", () => {
    const { store, state } = editor();
    const a = state().addCaption("Alpha beta gamma", 0, 0, undefined, undefined, 8);
    state().addCaption("Delta", 0, 3, undefined, undefined, 10);
    const g = guideWidth(store, toWorld, { x: 0, y: 0 }, a);
    expect(g.step({ x0: -4, x1: 5.97, y0: -0.5, y1: 0.5 }, keys)).toBeCloseTo(10);
    // (its own 8, as it was, is nothing to line up with)
    expect(g.step({ x0: -4, x1: 3.98, y0: -0.5, y1: 0.5 }, keys)).toBeNull();
    g.end();
  });
});
