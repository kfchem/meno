import { describe, expect, it } from "vitest";
import { createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import { roundHandleAt, roundsOf } from "./shapeRounds";

describe("a document's rectangles' corners as its canvas draws them", () => {
  it("are kept with the document: two tabs each holding shape 1, rounded differently, never mixed", () => {
    const a = createEditorStore(createWorkspaceDocument());
    const b = createEditorStore(createWorkspaceDocument());
    const shape = { id: 1, kind: "rect" as const, x0: 0, y0: 0, x1: 40, y1: 20 };
    const pointPx = 0.125;
    roundsOf(a).shown.set(1, 8);
    roundsOf(b).shown.set(1, 40);
    // (each handle where its own document's corners begin: 8 points in, and 40 - 5 units - in)
    expect(roundHandleAt(shape, pointPx, 0, roundsOf(a)).x).toBeCloseTo(1);
    expect(roundHandleAt(shape, pointPx, 0, roundsOf(b)).x).toBeCloseTo(5);
    // (one tab's shape going, or rounded by hand, leaves the other's as it was)
    roundsOf(a).shown.delete(1);
    roundsOf(a).byHand.add(1);
    expect(roundsOf(b).shown.get(1)).toBe(40);
    expect(roundsOf(b).byHand.has(1)).toBe(false);
    // (and a change told in one is told to its own handles alone)
    let toldB = 0;
    roundsOf(b).moved.add(() => toldB++);
    for (const told of roundsOf(a).moved) told();
    expect(toldB).toBe(0);
    expect(roundsOf(a)).toBe(roundsOf(a));
  });
});
