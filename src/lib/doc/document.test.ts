import { describe, expect, it, vi } from "vitest";
import { createDocument, DEFAULT_COALESCE_MS } from "./document";

type Doc = { atoms: string[]; title: string };

const initial: Doc = { atoms: [], title: "untitled" };

/** Document with a clock we control, so coalescing is testable. */
function withClock(start = 1000) {
  let t = start;
  const doc = createDocument<Doc>(initial, { now: () => t });
  return { doc, tick: (ms: number) => (t += ms) };
}

const addAtom = (el: string) => (d: Doc) => ({ ...d, atoms: [...d.atoms, el] });

describe("createDocument", () => {
  it("starts clean with no history", () => {
    const doc = createDocument(initial);
    expect(doc.getState()).toBe(initial);
    expect(doc.history()).toEqual({
      undoDepth: 0,
      redoDepth: 0,
      undoLabel: undefined,
      redoLabel: undefined,
      dirty: false,
    });
    expect(doc.undo()).toBe(false);
    expect(doc.redo()).toBe(false);
  });

  it("records an edit and reports what undo would take back", () => {
    const doc = createDocument(initial);
    expect(doc.edit("add C", addAtom("C"))).toBe(true);
    expect(doc.getState().atoms).toEqual(["C"]);
    expect(doc.history()).toMatchObject({
      undoDepth: 1,
      redoDepth: 0,
      undoLabel: "add C",
      dirty: true,
    });
  });

  it("ignores an updater that changes nothing", () => {
    const doc = createDocument(initial);
    const listener = vi.fn();
    doc.subscribe(listener);
    expect(doc.edit("no-op", (d) => d)).toBe(false);
    expect(doc.history().undoDepth).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it("walks back and forth through history", () => {
    const doc = createDocument(initial);
    doc.edit("add C", addAtom("C"));
    doc.edit("add O", addAtom("O"));

    expect(doc.undo()).toBe(true);
    expect(doc.getState().atoms).toEqual(["C"]);
    expect(doc.history()).toMatchObject({
      undoDepth: 1,
      redoDepth: 1,
      undoLabel: "add C",
      redoLabel: "add O",
    });

    expect(doc.undo()).toBe(true);
    expect(doc.getState()).toBe(initial);
    expect(doc.undo()).toBe(false);

    expect(doc.redo()).toBe(true);
    expect(doc.redo()).toBe(true);
    expect(doc.getState().atoms).toEqual(["C", "O"]);
    expect(doc.redo()).toBe(false);
  });

  it("drops the redo stack once a new edit is made", () => {
    const doc = createDocument(initial);
    doc.edit("add C", addAtom("C"));
    doc.undo();
    doc.edit("add N", addAtom("N"));
    expect(doc.history().redoDepth).toBe(0);
    expect(doc.getState().atoms).toEqual(["N"]);
  });

  it("merges edits that share a key inside the window", () => {
    const { doc, tick } = withClock();
    doc.edit("move", (d) => ({ ...d, title: "a" }), { coalesceKey: "move:1" });
    tick(DEFAULT_COALESCE_MS - 1);
    doc.edit("move", (d) => ({ ...d, title: "b" }), { coalesceKey: "move:1" });
    tick(DEFAULT_COALESCE_MS - 1);
    doc.edit("move", (d) => ({ ...d, title: "c" }), { coalesceKey: "move:1" });

    expect(doc.getState().title).toBe("c");
    // one step for the whole gesture
    expect(doc.history().undoDepth).toBe(1);
    doc.undo();
    expect(doc.getState().title).toBe("untitled");
  });

  it("starts a new step after the window, or for a different key", () => {
    const { doc, tick } = withClock();
    doc.edit("move", (d) => ({ ...d, title: "a" }), { coalesceKey: "move:1" });
    tick(DEFAULT_COALESCE_MS + 1);
    doc.edit("move", (d) => ({ ...d, title: "b" }), { coalesceKey: "move:1" });
    expect(doc.history().undoDepth).toBe(2);

    doc.edit("move other", (d) => ({ ...d, title: "c" }), {
      coalesceKey: "move:2",
    });
    expect(doc.history().undoDepth).toBe(3);

    // no key at all: never merged
    doc.edit("plain", (d) => ({ ...d, title: "d" }));
    doc.edit("plain", (d) => ({ ...d, title: "e" }));
    expect(doc.history().undoDepth).toBe(5);
  });

  it("keeps the history bounded, dropping the oldest steps", () => {
    const doc = createDocument<Doc>(initial, { limit: 3 });
    for (const el of ["C", "O", "N", "S", "P"]) doc.edit(`add ${el}`, addAtom(el));
    expect(doc.history().undoDepth).toBe(3);
    // only the last three steps can be taken back
    doc.undo();
    doc.undo();
    doc.undo();
    expect(doc.undo()).toBe(false);
    expect(doc.getState().atoms).toEqual(["C", "O"]);
  });

  it("tracks the saved state, including after an undo back to it", () => {
    const doc = createDocument(initial);
    doc.edit("add C", addAtom("C"));
    expect(doc.history().dirty).toBe(true);

    doc.markSaved();
    expect(doc.history().dirty).toBe(false);

    doc.edit("add O", addAtom("O"));
    expect(doc.history().dirty).toBe(true);

    doc.undo();
    // back at the saved snapshot: not dirty any more
    expect(doc.history().dirty).toBe(false);
  });

  it("marks saved the state that was written, where it changed while it was: what changed meanwhile is still unsaved", () => {
    const doc = createDocument(initial);
    doc.edit("add C", addAtom("C"));
    // (its writing begins: the state as it is)
    const written = doc.getState();
    // (typed on while it is written)
    doc.edit("add O", addAtom("O"));
    doc.markSaved(written);
    expect(doc.history().dirty).toBe(true);
    // (back at what was written: saved)
    doc.undo();
    expect(doc.history().dirty).toBe(false);
    // (nothing changed meanwhile: saved as it is)
    doc.edit("add N", addAtom("N"));
    doc.markSaved(doc.getState());
    expect(doc.history().dirty).toBe(false);
  });

  it("forgets history on reset and treats the new content as saved", () => {
    const doc = createDocument(initial);
    doc.edit("add C", addAtom("C"));
    const opened: Doc = { atoms: ["Fe"], title: "opened.mol" };
    doc.reset(opened, "open opened.mol");

    expect(doc.getState()).toBe(opened);
    expect(doc.history()).toMatchObject({
      undoDepth: 0,
      redoDepth: 0,
      dirty: false,
    });
    expect(doc.undo()).toBe(false);
  });

  it("notifies subscribers on edits, undo, redo and save, until they leave", () => {
    const doc = createDocument(initial);
    const listener = vi.fn();
    const unsubscribe = doc.subscribe(listener);

    doc.edit("add C", addAtom("C"));
    doc.undo();
    doc.redo();
    doc.markSaved();
    expect(listener).toHaveBeenCalledTimes(4);

    unsubscribe();
    doc.edit("add O", addAtom("O"));
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it("shares untouched parts between snapshots instead of copying", () => {
    const doc = createDocument<{ atoms: string[]; meta: { note: string } }>({
      atoms: [],
      meta: { note: "big object" },
    });
    const before = doc.getState();
    doc.edit("add C", (d) => ({ ...d, atoms: [...d.atoms, "C"] }));
    // `meta` was not part of the edit, so both snapshots point at one object
    expect(doc.getState().meta).toBe(before.meta);
  });
});

describe("amending a document", () => {
  it("changes every state it holds - past, present, future, saved - with no step of its own, the saved state still saved", () => {
    const doc = createDocument({ items: ["a"], note: "" });
    doc.edit("add b", (d) => ({ ...d, items: [...d.items, "b"] }));
    doc.markSaved();
    doc.edit("add c", (d) => ({ ...d, items: [...d.items, "c"] }));
    doc.undo();
    // (the present is the saved state; "add c" waits to be redone)
    expect(doc.history()).toMatchObject({ undoDepth: 1, redoDepth: 1, dirty: false });
    const heard = vi.fn();
    doc.subscribe(heard);
    doc.amend((d) => ({ ...d, note: "read" }));
    expect(heard).toHaveBeenCalledTimes(1);
    expect(doc.getState()).toEqual({ items: ["a", "b"], note: "read" });
    expect(doc.history()).toMatchObject({ undoDepth: 1, redoDepth: 1, dirty: false });
    doc.redo();
    expect(doc.getState()).toEqual({ items: ["a", "b", "c"], note: "read" });
    doc.undo();
    doc.undo();
    expect(doc.getState()).toEqual({ items: ["a"], note: "read" });
    expect(doc.history().dirty).toBe(true);
    doc.redo();
    expect(doc.history().dirty).toBe(false);
  });

  it("may leave the document unsaved - what it says to be kept when it is next saved - with still no step to undo", () => {
    const doc = createDocument({ items: ["a"], note: "" });
    doc.edit("add b", (d) => ({ ...d, items: [...d.items, "b"] }));
    doc.markSaved();
    doc.amend((d) => ({ ...d, note: "running" }), { unsaved: true });
    expect(doc.history()).toMatchObject({ undoDepth: 1, dirty: true });
    // (undo cannot take it back: the state before has it too)
    doc.undo();
    expect(doc.getState()).toEqual({ items: ["a"], note: "running" });
    doc.redo();
    doc.markSaved();
    expect(doc.history().dirty).toBe(false);
  });

  it("says nothing where nothing changed", () => {
    const doc = createDocument({ n: 1 });
    const heard = vi.fn();
    doc.subscribe(heard);
    doc.amend((d) => d);
    expect(heard).not.toHaveBeenCalled();
  });
});

