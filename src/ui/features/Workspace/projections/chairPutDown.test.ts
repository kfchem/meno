import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import { centredAt } from "../utils/copyPaste";
import { chairDrawing, chairOf, depthRings } from "./chair";

/** A page, its store and document. */
function page() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, st: () => store.getState() };
}

/** The chair as Quick Add puts it down where it was opened (Workspace's `onChoose`, "chair": `putChair`). */
function putDown(at: { x: number; y: number }) {
  const { doc, st } = page();
  st().putChair(at);
  return doc.getState().model;
}

/** The form a page's one chair is in: form 1 is seen from the right, its up end - the higher of the two ends - at the left. */
function formOf(model: { atoms: { x: number; y: number }[] }): 0 | 1 {
  const ends = [...model.atoms].sort((p, q) => p.x - q.x);
  return ends[0].y > ends[ends.length - 1].y ? 1 : 0;
}

describe("a chair put down from Quick Add", () => {
  const at = { x: 40, y: -25 };
  const model = putDown(at);

  it("is six carbons and six plain single bonds, their depth and the drawing's own configuration kept", () => {
    expect(model.atoms).toHaveLength(6);
    expect(model.bonds).toHaveLength(6);
    expect(model.atoms.every((a) => a.el === "C" && typeof a.z === "number" && a.stereoCentre === true && a.stereoShown === true)).toBe(true);
    expect(model.bonds.every((b) => b.order === 1)).toBe(true);
    expect(model.bonds.every((b) => b.display == null)).toBe(true);
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

describe("the chair's icon clicked again", () => {
  it("turns the chair it put down, unchanged, to the view from the other side as one step - and a third click back - in place", () => {
    const { doc, st } = page();
    st().putChair({ x: 3, y: 2 });
    const first = doc.getState().model;
    expect(formOf(first)).toBe(1);
    const depth = doc.history().undoDepth;
    st().putChair({ x: 30, y: 20 });
    const second = doc.getState().model;
    expect(second.atoms).toHaveLength(6);
    expect(formOf(second)).toBe(0);
    expect(doc.history().undoDepth).toBe(depth + 1);
    expect(doc.history().undoLabel).toBe("the chair's other view");
    // (where it was: the ring's middle kept, each bond as long; still a chair of the tool's, its depth that view's)
    const mid = (m: typeof first) => ({ x: m.atoms.reduce((t, a) => t + a.x, 0) / 6, y: m.atoms.reduce((t, a) => t + a.y, 0) / 6 });
    expect(mid(second).x).toBeCloseTo(mid(first).x, 9);
    expect(mid(second).y).toBeCloseTo(mid(first).y, 9);
    expect(chairOf(second, depthRings(second)[0])).toMatchObject({ form: expect.any(Number) });
    st().putChair({ x: 0, y: 0 });
    expect(formOf(doc.getState().model)).toBe(1);
    expect(doc.getState().model.atoms).toHaveLength(6);
    // (undone, the click before it: clicked again from there, it turns again)
    doc.undo();
    expect(formOf(doc.getState().model)).toBe(0);
    st().putChair({ x: 0, y: 0 });
    expect(formOf(doc.getState().model)).toBe(1);
    expect(doc.getState().model.atoms).toHaveLength(6);
  });

  it("puts down another where anything was done since: a group drawn on it, or another edit", () => {
    const { doc, st } = page();
    st().putChair({ x: 0, y: 0 });
    st().addAtom(20, 20, "O");
    st().putChair({ x: 10, y: 0 });
    expect(doc.getState().model.atoms).toHaveLength(13);
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
