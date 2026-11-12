import { describe, expect, it } from "vitest";
import { cleanUp, CleanUpRefused } from "../chem/cleanUp";
import { identityOfDrawn } from "../chem/identityOf";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import { chairDrawing, seenPlaces } from "./chair";

/** A trans-1,2-dimethylcyclohexane drawn as a chair, on a page. */
function page() {
  const d = chairDrawing({ at: { x: 0, y: 0 }, firstId: 1, firstBondId: 1 });
  const atoms = [...d.atoms];
  const bonds = [...d.bonds];
  [[0, 1], [1, -1]].forEach(([k, face], i) => {
    const free = d.solid.free.find((f) => f.at === k && f.face === face)!;
    const place = seenPlaces(d, k).find((p) => p.free === free)!;
    atoms.push({ id: 20 + i, el: "C", r: 0.9, x: place.place.x, y: place.place.y });
    bonds.push({ id: 30 + i, a: d.ring[k], b: 20 + i, order: 1 });
  });
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  store.getState().pasteModel({ atoms, bonds });
  return { doc, store };
}

describe("Clean-up and a projection", () => {
  it("leaves a chair as it is drawn, and says so", async () => {
    const { doc, store } = page();
    const was = doc.getState().model;
    const error = await cleanUp(store, null).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CleanUpRefused);
    expect((error as Error).message).toMatch(/projection, drawn as it is/);
    expect(doc.getState().model).toBe(was);
  });

  it("is laid out flat by Draw flat: no depth left, the compound the same", async () => {
    const { doc, store } = page();
    const was = identityOfDrawn(doc.getState().model).text;
    await cleanUp(store, null, true);
    const now = doc.getState().model;
    expect(now.atoms.every((a) => a.z == null)).toBe(true);
    expect(identityOfDrawn(now).text).toBe(was);
  });
});
