import { afterEach, describe, expect, it, vi } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, st: () => store.getState() };
}

describe("an arrow or a plus dragged and held still a while on the way", () => {
  afterEach(() => vi.useRealTimers());

  it("is one undo step: the arrow moved, its end and a corner dragged, a plus moved", () => {
    vi.useFakeTimers();
    const { doc, st } = editor();
    const a = st().addArrowBetween({ x: 0, y: 0 }, { x: 4, y: 0 });
    const p = st().addPlus(-3, 0);
    const depth = doc.history().undoDepth;
    // the arrow dragged, held still for two seconds - lining it up - and dragged on
    st().updateArrow(a, { x: 3, y: 0 }, "move-1");
    vi.advanceTimersByTime(2000);
    st().updateArrow(a, { x: 4, y: 1 }, "move-1");
    expect(doc.history().undoDepth).toBe(depth + 1);
    // its end, and a corner, likewise
    st().updateArrow(a, { length: 5 }, "reshape-1");
    vi.advanceTimersByTime(2000);
    st().updateArrow(a, { length: 6 }, "reshape-1");
    st().updateArrow(a, { corners: [{ along: 0.5, across: 1 }] }, "corner-1");
    vi.advanceTimersByTime(2000);
    st().updateArrow(a, { corners: [{ along: 0.5, across: 2 }] }, "corner-1");
    expect(doc.history().undoDepth).toBe(depth + 3);
    // a plus too
    st().movePlus(p, -3, 1, "move-2");
    vi.advanceTimersByTime(2000);
    st().movePlus(p, -3, 2, "move-2");
    expect(doc.history().undoDepth).toBe(depth + 4);
    for (let i = 0; i < 4; i++) doc.undo();
    expect(st().arrows.find((x) => x.id === a)).toMatchObject({ x: 2, y: 0, length: 4 });
    expect(st().arrows.find((x) => x.id === a)?.corners).toBeUndefined();
    expect(st().pluses.find((x) => x.id === p)).toMatchObject({ x: -3, y: 0 });
  });

  it("is a step of its own for each drag, however soon the next begins", () => {
    const { doc, st } = editor();
    const a = st().addArrowBetween({ x: 0, y: 0 }, { x: 4, y: 0 });
    const depth = doc.history().undoDepth;
    st().updateArrow(a, { x: 3, y: 0 }, "move-1");
    st().updateArrow(a, { x: 4, y: 0 }, "move-2");
    expect(doc.history().undoDepth).toBe(depth + 2);
  });
});
