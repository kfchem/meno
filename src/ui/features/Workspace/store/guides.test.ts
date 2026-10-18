import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import { guideMove, guideSides, guideWidth } from "../utils/guiding";

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

  it("change nothing in the page's state at a step that lines up with nothing, as none was shown", () => {
    const { store, state } = editor();
    const a = state().addCaption("Alpha", 0, 0);
    state().addCaption("Beta", 6, 5.03);
    state().selectCaptions([a]);
    const g = guideMove(store, toWorld, { x: 0, y: 0 });
    let changes = 0;
    const stop = store.subscribe(() => changes++);
    // (well off the other's middle and sides, steps at every frame)
    for (let i = 0; i < 10; i++) g.step(0.1 * i, -3, keys);
    expect(changes).toBe(0);
    g.end();
    expect(changes).toBe(0);
    stop();
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

  it("make a shape as wide as another near it by the side its handle moves, and as tall by its top or bottom", () => {
    const { store, state } = editor();
    const a = state().addShape({ kind: "rect", x0: 0, y0: 0, x1: 4, y1: 2 })!;
    state().addShape({ kind: "rect", x0: 6, y0: 0, x1: 11, y1: 3, radius: 3 });
    state().selectShapes([a]);
    const g = guideSides(store, toWorld, { x: 0, y: 0 });
    // (its right side dragged to 4.98 wide: 5, as the other is; its top to 2.97 tall: 3)
    expect(g.step({ x0: 0, y0: 0, x1: 4.98, y1: 2.97 }, { x: "x1", y: "y1" }, keys)).toEqual({ x0: 0, y0: 0, x1: 5, y1: 3 });
    expect(state().guides?.marks.length).toBe(4);
    g.end();
    expect(state().guides).toBeNull();
  });
});
