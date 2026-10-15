import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectStoreToDocument, createEditorStore } from "../store";
import { addMolecule3d, createWorkspaceDocument } from "../document";
import { readRecord } from "../utils/copyPaste";
import { linkToOffice } from "./useOfficeLink";

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

/** A canvas opened from a document holding a molecule in 3D, linked back to it: what it is sent. */
function opened(withDrawing: boolean) {
  const doc = createWorkspaceDocument();
  doc.edit("open", (d) => addMolecule3d(d, { ...water, at: { x: 0, y: 0 } }));
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  if (withDrawing) store.getState().addAtom(10, 0, "C");
  const sent: string[] = [];
  const stop = linkToOffice(store, async (record) => {
    sent.push(record);
  });
  return { doc, state: () => store.getState(), sent, stop };
}

/** Long enough for the drawing to settle and its picture to be made. */
const settle = () => vi.advanceTimersByTimeAsync(1000);

describe("the link back to a document", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends nothing for what the document gave the canvas", async () => {
    const { sent, stop } = opened(true);
    await settle();
    expect(sent).toEqual([]);
    stop();
  });

  it("sends the molecules in 3D with the drawing, turned as they are", async () => {
    const { state, sent, stop } = opened(true);
    await settle();
    state().addAtom(12, 0, "N");
    await settle();
    expect(sent).toHaveLength(1);
    const record = readRecord(sent[0])!;
    expect(record.atoms).toHaveLength(2);
    expect(record.molecules3d).toHaveLength(1);
    state().setTurn3d(1, [0, 1, 0, 0]);
    await settle();
    expect(sent).toHaveLength(2);
    expect(readRecord(sent[1])!.molecules3d![0].turn).toEqual([0, 1, 0, 0]);
    stop();
  });

  it("sends a document holding only a molecule in 3D its changes", async () => {
    const { state, sent, stop } = opened(false);
    await settle();
    state().moveMolecule3d(1, { x: 3, y: 1 });
    await settle();
    expect(sent).toHaveLength(1);
    const record = readRecord(sent[0])!;
    expect(record.atoms).toEqual([]);
    expect(record.molecules3d![0].at).toMatchObject({ x: 3, y: 1 });
    stop();
  });

  it("sends nothing once a change is undone back to what was sent", async () => {
    const { doc, state, sent, stop } = opened(false);
    await settle();
    state().moveMolecule3d(1, { x: 3, y: 1 });
    state().moveMolecule3d(1, { x: 0, y: 0 });
    await settle();
    expect(sent).toEqual([]);
    expect(doc.getState().molecules3d).toHaveLength(1);
    stop();
  });
});

describe("the link back to an Office document, as the canvas changes", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const settle = () => vi.advanceTimersByTimeAsync(1000);

  it("sends words, a shape or writing by hand added alone - all of it what the document shows", async () => {
    for (const add of [
      (st: ReturnType<ReturnType<typeof opened>["state"]>) => st.addCaption("NaH, THF", 5, 5),
      (st: ReturnType<ReturnType<typeof opened>["state"]>) => st.addShape({ kind: "rect", x0: 0, y0: 0, x1: 20, y1: 10 }),
      (st: ReturnType<ReturnType<typeof opened>["state"]>) => st.writeStroke({ pen: "pen", width: 1 }, { points: [0, 0, 0.5, 1, 1, 0.5, 2, 0, 0.5] }),
    ]) {
      const { state, sent, stop } = opened(true);
      await settle();
      const before = sent.length;
      add(state());
      await settle();
      expect(sent.length).toBe(before + 1);
      stop();
    }
  });
});
