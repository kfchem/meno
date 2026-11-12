import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));
import { gestureStep } from "../../../../lib/doc/document";
import { addMolecule3d, createWorkspaceDocument } from "../document";
import { addConversation } from "../conversation/ops";
import { cardRect } from "../pageGl/conversationCard";
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
  // (how each was listened for: in the capture phase or not)
  const captured = new Map<string, boolean>();
  const stub = {
    addEventListener: (type: string, f: (e?: unknown) => void, capture?: boolean) => (captured.set(type, capture === true), on.set(type, (on.get(type) ?? new Set()).add(f))),
    removeEventListener: (type: string, f: (e?: unknown) => void) => on.get(type)?.delete(f),
    setTimeout: (f: () => void) => globalThis.setTimeout(f, 0),
  };
  return { stub, captured, fire: (type: string) => on.get(type)?.forEach((f) => f()), count: () => [...on.values()].reduce((n, s) => n + s.size, 0) };
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

  it("does nothing for a press that undid a step - a click on the history's button, let go: the state undone to is settled already, what lies over a frame there is eased by no one, and redo stays", () => {
    const { w, doc } = setup();
    // (settled once; then a structure put over the frame's edge, its middle outside it - a step of its own)
    w.fire("pointerdown");
    w.fire("pointerup");
    vi.runAllTimers();
    doc.edit("place", (d) => ({ ...d, model: { ...d.model, atoms: d.model.atoms.map((a) => (a.id >= 3 ? { ...a, x: a.x - 16.5 } : a)) } }));
    const lying = doc.getState();
    // (dragged away - a gesture of its own, let go: one step)
    w.fire("pointerdown");
    doc.edit("drag", (d) => ({ ...d, model: { ...d.model, atoms: d.model.atoms.map((a) => (a.id >= 3 ? { ...a, x: a.x + 30 } : a)) } }), gestureStep("drag"));
    w.fire("pointerup");
    vi.runAllTimers();
    // (the button pressed, the step undone, the button let go)
    w.fire("pointerdown");
    expect(doc.undo()).toBe(true);
    const undone = doc.getState();
    expect(undone.model.atoms[2].x).toBe(lying.model.atoms[2].x);
    w.fire("pointerup");
    vi.runAllTimers();
    expect(doc.getState()).toBe(undone);
    expect(doc.history().redoDepth).toBe(1);
    // (and redone: the same)
    w.fire("pointerdown");
    expect(doc.redo()).toBe(true);
    const redone = doc.getState();
    w.fire("pointerup");
    vi.runAllTimers();
    expect(doc.getState()).toBe(redone);
  });

  it("stops listening when it is told to", () => {
    const { w, stop } = setup();
    expect(w.count()).toBe(3);
    stop();
    expect(w.count()).toBe(0);
  });

  it("hears the release before anything under the window can stop it: a molecule in 3D's drag ends with a stopPropagation on the canvas, which a listener of the bubbling phase never hears", () => {
    const { w } = setup();
    expect(Object.fromEntries(w.captured)).toEqual({ pointerdown: true, pointerup: true, pointercancel: true });
  });

  it("eases a molecule in 3D dragged onto a conversation's card off it, to its left, in the drag's own step", () => {
    vi.useFakeTimers();
    const w = windowStub();
    vi.stubGlobal("window", w.stub);
    const doc = createWorkspaceDocument();
    const frame = { x0: 0, y0: 0, x1: 36, y1: 21 };
    doc.edit("conversation", (d) => addConversation(d, frame));
    doc.edit("molecule", (d) => addMolecule3d(d, { atoms: [{ el: "O", x: 0, y: 0, z: 0 }, { el: "H", x: 0, y: 0.76, z: 0.59 }], bonds: [{ a1: 0, a2: 1, order: 1 }], at: { x: 5, y: 10 } } as never));
    const store = createEditorStore(doc);
    store.getState().watchFrames();
    const room = cardRect(frame)!;
    w.fire("pointerdown");
    store.getState().moveMolecules3d([{ id: 1, at: { x: (room.x0 + room.x1) / 2, y: 10 } }], "drag");
    const depth = doc.history().undoDepth;
    w.fire("pointerup");
    vi.runAllTimers();
    expect(doc.getState().molecules3d![0].at.x).toBeLessThan(room.x0);
    expect(doc.getState().molecules3d![0].at.y).toBe(10);
    expect(doc.history().undoDepth).toBe(depth);
    // (one undo takes back the drag and the ease: the molecule where it was)
    doc.undo();
    expect(doc.getState().molecules3d![0].at).toEqual({ x: 5, y: 10 });
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
