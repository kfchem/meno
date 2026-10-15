import { describe, expect, it } from "vitest";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import { guideSides, guideWidth } from "./guiding";

const none = { shiftKey: false, metaKey: false, ctrlKey: false };
const world = (cx: number, cy: number) => ({ x: cx, y: cy });

function page() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  // a box 30 wide to take the width of; the one made wider is a box of a gesture, near it
  store.getState().addShape({ kind: "rect", x0: 0, y0: 0, x1: 30, y1: 10 });
  return store;
}

describe("a box made wider, its width taken from another's", () => {
  it("is taken within 6 px and held to 10, and not taken afresh at 8 - no flicker at the edge", () => {
    const g = guideSides(page(), world, { x: 20, y: 45 });
    const at = (w: number) => g.step({ x0: 0, y0: 40, x1: w, y1: 50 }, { x: "x1" }, none).x1;
    // (8 px off 30: not taken afresh)
    expect(at(22)).toBe(22);
    // (4 px off: taken)
    expect(at(26)).toBe(30);
    // (8 px off: held, as it was taken)
    expect(at(22)).toBe(30);
    // (past the hold, 12 px off: let go, and then 8 px off is not taken again)
    expect(at(18)).toBe(18);
    expect(at(22)).toBe(22);
  });
});

describe("words made wider", () => {
  it("are held to a longer distance than takes their width, as a box's are", () => {
    const store = page();
    const g = guideWidth(store, world, { x: 20, y: 45 }, -1);
    const at = (w: number) => g.step({ x0: 0, y0: 40, x1: w, y1: 50 }, none);
    expect(at(22)).toBeNull();
    expect(at(26)).toBe(30);
    expect(at(22)).toBe(30);
  });
});
