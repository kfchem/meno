// Held beside molecules3d.test.ts: a record's stack of molecules in 3D opened as a tab's structure shows the member its copy showed - as a
// workspace opened does (modelSlice `openWorkspace`, `stacksShown`) - turned as that member was.
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
const first: Turn3D = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];
const second: Turn3D = [0, Math.SQRT1_2, 0, Math.SQRT1_2];

describe("a record's stack of molecules in 3D opened as a tab's structure", () => {
  it("shows the member the copy showed, not the first", () => {
    const record = readRecord(
      recordText({
        atoms: [],
        bonds: [],
        molecules3d: [
          { ...water, at: { x: 0, y: 0 }, stack: { id: 1 }, turn: first },
          { ...water, at: { x: 0, y: 0 }, stack: { id: 1 }, turn: second, shown: true },
        ] as never,
      }),
    )!;
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    store.getState().openModel(record, schemeOf(record));
    const state = store.getState();
    const stack = state.molecules3d[1].stack!;
    expect(state.molecules3d[0].stack!.id).toBe(stack.id);
    expect(state.stacksShown[stack.id]).toBe(2);
    expect(state.turns3d[2]).toEqual(second);
  });
});
