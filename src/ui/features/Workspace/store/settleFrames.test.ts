import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));
import { gestureStep } from "../../../../lib/doc/document";
import { createWorkspaceDocument } from "../document";
import { frameAround, structureBox } from "../workflow/fitFrames";
import { addSet } from "../workflow/model";
import { connectStoreToDocument, createEditorStore } from "./index";
import { readKept, readWorkspace, workspaceFile } from "../utils/workspace";
import { workspaceOfFile } from "../../../views/openFile";

/** Two chains of two carbons: atoms 1-2 at the origin, 3-4 far to the right. */
const page = () => ({
  atoms: [
    { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
    { id: 2, x: 1.5, y: 0, r: 0.9, el: "C" },
    { id: 3, x: 20, y: 0, r: 0.9, el: "C" },
    { id: 4, x: 21.5, y: 0, r: 0.9, el: "C" },
  ],
  bonds: [
    { id: 1, a: 1, b: 2, order: 1 as const },
    { id: 2, a: 3, b: 4, order: 1 as const },
  ],
});

/** A stand-in for the window: the listeners it was given, to be fired by the test. */
function windowStub() {
  const on = new Map<string, Set<(e?: unknown) => void>>();
  const stub = {
    addEventListener: (type: string, f: (e?: unknown) => void) => on.set(type, (on.get(type) ?? new Set()).add(f)),
    removeEventListener: (type: string, f: (e?: unknown) => void) => on.get(type)?.delete(f),
    setTimeout: (f: () => void) => globalThis.setTimeout(f, 0),
  };
  return { stub, fire: (type: string) => on.get(type)?.forEach((f) => f()), count: () => [...on.values()].reduce((n, s) => n + s.size, 0) };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("frames settled as the pointer is let go (the store's watchFrames)", () => {
  function setup() {
    vi.useFakeTimers();
    const w = windowStub();
    vi.stubGlobal("window", w.stub);
    const doc = createWorkspaceDocument();
    doc.edit("draw", (d) => addSet({ ...d, model: page() as never, nextId: 5 }, { x0: -2, y0: -2, x1: 4, y1: 3 }));
    const store = createEditorStore(doc);
    const stop = store.getState().watchFrames();
    return { w, doc, store, stop };
  }
  const frame = (d: ReturnType<typeof createWorkspaceDocument>) => d.getState().sets![0];

  it("fits the frame to its member after a drag that took the member out and in, in the drag's own step", () => {
    const { w, doc } = setup();
    // (a member dragged right, its middle still inside: the frame stays while it is held)
    const was = { ...frame(doc) };
    w.fire("pointerdown");
    doc.edit("drag", (d) => ({ ...d, model: { ...d.model, atoms: d.model.atoms.map((a) => (a.id <= 2 ? { ...a, x: a.x + 1.8 } : a)) } }), gestureStep("drag"));
    expect(frame(doc)).toMatchObject({ x0: was.x0, x1: was.x1, y0: was.y0, y1: was.y1 });
    const depth = doc.history().undoDepth;
    w.fire("pointerup");
    // (not before the gesture's own last edit has been made: on the next turn)
    expect(frame(doc)).toMatchObject({ x1: was.x1 });
    vi.runAllTimers();
    const m = doc.getState().model;
    const want = frameAround([structureBox(m, new Map(m.atoms.map((a) => [a.id, a])), [1, 2])]);
    expect(frame(doc)).toMatchObject({ x0: want.x0, x1: want.x1, y0: want.y0, y1: want.y1 });
    expect(doc.history().undoDepth).toBe(depth);
    // (one undo takes back the drag and the fit)
    doc.undo();
    expect(frame(doc)).toMatchObject({ x0: was.x0, x1: was.x1 });
  });

  it("does nothing for a press that changed nothing: no edit, no step", () => {
    const { w, doc } = setup();
    // (settled once, as a drag's end would: the frame fitted)
    w.fire("pointerdown");
    w.fire("pointerup");
    vi.runAllTimers();
    const depth = doc.history().undoDepth;
    const state = doc.getState();
    w.fire("pointerdown");
    w.fire("pointerup");
    vi.runAllTimers();
    expect(doc.getState()).toBe(state);
    expect(doc.history().undoDepth).toBe(depth);
  });

  it("stops listening when it is told to", () => {
    const { w, stop } = setup();
    expect(w.count()).toBe(3);
    stop();
    expect(w.count()).toBe(0);
  });
});

describe("a workspace opened with a frame sized by hand", () => {
  it("has the frame its members' room, as it would after an edit - and is not unsaved for it", async () => {
    const doc = createWorkspaceDocument();
    doc.edit("draw", (d) => addSet({ ...d, model: page() as never, nextId: 5 }, { x0: -2, y0: -2, x1: 4, y1: 3 }));
    // (a frame far larger than what it holds, as saved)
    doc.edit("size", (d) => ({ ...d, sets: d.sets!.map((b) => ({ ...b, x0: -40, y0: -30, x1: 60, y1: 50 })) }));
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const saved = readWorkspace(workspaceOfFile((await workspaceFile(store.getState())).bytes)!)!;
    const { ws } = await readKept(saved);
    const fresh = createWorkspaceDocument();
    const opened = createEditorStore(fresh);
    connectStoreToDocument(opened, fresh);
    opened.getState().openWorkspace(ws, true);
    const m = fresh.getState().model;
    const members = fresh.getState().sets![0].members!;
    expect(members).toHaveLength(2);
    // (the room of the two chains, not the hand-sized frame)
    const byId = new Map(m.atoms.map((a) => [a.id, a]));
    const want = frameAround([structureBox(m, byId, [1, 2]), structureBox(m, byId, [3, 4])]);
    expect(fresh.getState().sets![0]).toMatchObject({ x0: want.x0, x1: want.x1, y0: want.y0, y1: want.y1 });
    expect(fresh.history().dirty).toBe(false);
  });
});
