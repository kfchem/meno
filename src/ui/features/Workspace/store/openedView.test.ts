// Held beside molecules3d.test.ts: a record's molecules in 3D opened as a tab's structure (openModel) are shown as the record's copy had them -
// each by its own place in the record, a list open with its row and surface value, nothing left of what a tab opened before showed.
import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument, schemeOf } from "../document";
import { readRecord, recordText } from "../utils/copyPaste";
import type { Turn3D } from "./types";

const water = {
  atoms: [
    { el: "O", x: 0, y: 0, z: 0 },
    { el: "H", x: 0.76, y: 0.59, z: 0 },
    { el: "H", x: -0.76, y: 0.59, z: 0 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
};
const frames = [[0, 0, 0, 0.76, 0.59, 0, -0.76, 0.59, 0], [0, 0, 0.1, 0.76, 0.59, 0.1, -0.76, 0.59, 0.1], [0, 0, 0.2, 0.76, 0.59, 0.2, -0.76, 0.59, 0.2]];
const quarter: Turn3D = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];
const upright: Turn3D = [0, Math.SQRT1_2, 0, Math.SQRT1_2];

/** A canvas's store, empty, and what opening `record` as its structure leaves it showing. */
function opened(...records: ReturnType<typeof readRecord>[]) {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  for (const record of records) store.getState().openModel(record!, schemeOf(record!));
  return store.getState();
}
const recordOf = (molecules3d: object[]) => readRecord(recordText({ atoms: [], bonds: [], molecules3d: molecules3d as never }));

describe("a record's molecules in 3D opened as a tab's structure", () => {
  it("each is shown as its own copy had it, by its place among the record's: the turns and frames are told apart", () => {
    const state = opened(recordOf([{ ...water, at: { x: 0, y: 0 }, turn: quarter, frames, frame: 3 }, { ...water, at: { x: 5, y: 0 }, turn: upright, frames, frame: 2 }]));
    expect(state.molecules3d.map((m) => m.id)).toEqual([1, 2]);
    expect(state.turns3d[1]).toEqual(quarter);
    expect(state.turns3d[2]).toEqual(upright);
    expect(state.frames3d).toEqual({ 1: 3, 2: 2 });
  });

  it("has a list open as the copy had it, its row chosen and its surface's value - and none where the copy had none", () => {
    const state = opened(recordOf([{ ...water, at: { x: 0, y: 0 }, list: { id: "cube:orbitals", row: 3, iso: 0.02 } }, { ...water, at: { x: 5, y: 0 }, list: { id: "cube:density", row: null } }, { ...water, at: { x: 9, y: 0 } }]));
    expect(state.lists3d[1]).toEqual({ list: "cube:orbitals", row: 3, pointed: null, iso: 0.02 });
    expect(state.lists3d[2]).toEqual({ list: "cube:density", row: null, pointed: null });
    expect(state.lists3d[3]).toBeUndefined();
  });

  it("leaves nothing of what a record opened before showed: opened over it, a record with none carries none", () => {
    const state = opened(
      recordOf([{ ...water, at: { x: 0, y: 0 }, turn: quarter, frames, frame: 3, list: { id: "cube:orbitals", row: 1 } }]),
      recordOf([{ ...water, at: { x: 0, y: 0 } }]),
    );
    expect(state.turns3d[1]).not.toEqual(quarter);
    expect(state.frames3d).toEqual({});
    expect(state.lists3d).toEqual({});
  });
});
