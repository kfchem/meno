import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import { centredAt } from "../utils/copyPaste";
import { chairDrawing, chairOf, depthRings } from "./chair";

/** The chair as Quick Add puts it down: pasted where it was opened (Workspace's `onChoose`, "chair"). */
function putDown(at: { x: number; y: number }) {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  store.getState().pasteModel(centredAt(chairDrawing({ at, firstId: 1, firstBondId: 1 }), at));
  return doc.getState().model;
}

describe("a chair put down from Quick Add", () => {
  const at = { x: 40, y: -25 };
  const model = putDown(at);

  it("is six carbons and six single bonds, their depth and the drawing's own configuration kept, the near edge bold", () => {
    expect(model.atoms).toHaveLength(6);
    expect(model.bonds).toHaveLength(6);
    expect(model.atoms.every((a) => a.el === "C" && typeof a.z === "number" && a.stereoCentre === true && a.stereoShown === true)).toBe(true);
    expect(model.bonds.every((b) => b.order === 1)).toBe(true);
    expect(model.bonds.filter((b) => b.display === "bold")).toHaveLength(1);
  });

  it("is centred where Quick Add was opened, and is read back as a chair there", () => {
    const x = model.atoms.reduce((s, a) => s + a.x, 0) / 6;
    const y = model.atoms.reduce((s, a) => s + a.y, 0) / 6;
    expect(x).toBeCloseTo(at.x, 6);
    expect(y).toBeCloseTo(at.y, 6);
    const [ring] = depthRings(model);
    expect(chairOf(model, ring)).not.toBeNull();
  });
});

describe("a chair fused, flipped and drawn flat on a page", () => {
  it("is each one undo step: the fusion, the flip", async () => {
    const { fusedOn } = await import("./fuse");
    const { flipOf } = await import("./flip");
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    st().pasteModel(centredAt(chairDrawing({ at: { x: 0, y: 0 }, firstId: 1, firstBondId: 1 }), { x: 0, y: 0 }));
    const ids = () => new Set(doc.getState().model.atoms.map((a) => a.id));
    const bond = doc.getState().model.bonds[0].id;
    const made = fusedOn(doc.getState().model, ids(), bond, "trans");
    expect(made && !("refused" in made)).toBe(true);
    const depth = doc.history().undoDepth;
    const fused = made as Exclude<typeof made, null | { refused: string }>;
    st().addSolid(fused.atoms, fused.bonds, "fuse chair");
    expect(doc.history().undoDepth).toBe(depth + 1);
    expect(doc.getState().model.atoms).toHaveLength(10);
    expect(doc.getState().model.bonds).toHaveLength(11);
    doc.undo();
    expect(doc.getState().model.atoms).toHaveLength(6);
    // (a chair alone flips; fused, the tool does not flip it)
    const flip = flipOf(doc.getState().model, ids());
    expect(flip && "moves" in flip).toBe(true);
    const before = doc.history().undoDepth;
    st().placeSolid((flip as { moves: { id: number; x: number; y: number; z?: number }[] }).moves, "flip chair");
    expect(doc.history().undoDepth).toBe(before + 1);
  });
});
