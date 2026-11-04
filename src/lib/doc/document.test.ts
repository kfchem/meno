import { describe, expect, it, vi } from "vitest";
import { changeSet, createDocument, DEFAULT_COALESCE_MS, DEFAULT_HISTORY_LIMIT, gestureStep } from "./document";

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

  it("merges a gesture's edits into one step however long it is held still", () => {
    const { doc, tick } = withClock();
    doc.edit("drag", (d) => ({ ...d, title: "a" }), gestureStep("drag:1"));
    tick(10 * DEFAULT_COALESCE_MS);
    doc.edit("drag", (d) => ({ ...d, title: "b" }), gestureStep("drag:1"));
    expect(doc.history().undoDepth).toBe(1);
    // (another gesture is a step of its own, however soon)
    doc.edit("drag", (d) => ({ ...d, title: "c" }), gestureStep("drag:2"));
    expect(doc.history().undoDepth).toBe(2);
    doc.undo();
    doc.undo();
    expect(doc.getState().title).toBe("untitled");
  });

  it("keeps who made a step, where not the person, and never merges it with another's - whatever its key", () => {
    const { doc } = withClock();
    doc.edit("drag", (d) => ({ ...d, title: "a" }), gestureStep("drag:1"));
    // (the same key, made by another: a step of its own)
    doc.edit("drag", (d) => ({ ...d, title: "b" }), { ...gestureStep("drag:1"), by: "a conversation" });
    doc.edit("drag", (d) => ({ ...d, title: "c" }), { ...gestureStep("drag:1"), by: "a conversation" });
    // (and the person's after it, the same key again: of their own)
    doc.edit("drag", (d) => ({ ...d, title: "d" }), gestureStep("drag:1"));
    expect(doc.history()).toMatchObject({ undoDepth: 3, undoLabel: "drag" });
    expect(doc.history().undoBy).toBeUndefined();
    doc.undo();
    expect(doc.getState().title).toBe("c");
    expect(doc.history()).toMatchObject({ undoBy: "a conversation", redoDepth: 1 });
    expect(doc.history().redoBy).toBeUndefined();
    doc.undo();
    expect(doc.getState().title).toBe("a");
    expect(doc.history().redoBy).toBe("a conversation");
    expect(doc.history().undoBy).toBeUndefined();
  });

  it("takes every edit a change set makes as one step, by its label and who made it - whatever each was made with", () => {
    const { doc, tick } = withClock();
    doc.edit("add C", addAtom("C"), gestureStep("turn:1"));
    const made = doc.actAs("conversation", changeSet("turn:1", "a conversation, by a test model"), () => {
      doc.edit("add N", addAtom("N"));
      tick(10 * DEFAULT_COALESCE_MS);
      doc.edit("add O", addAtom("O"), gestureStep("drag:7"));
      // (one within it: part of it)
      expect(doc.actAs("inner", changeSet("turn:2", "another"), () => void doc.edit("title", (d) => ({ ...d, title: "x" })))).toBe(true);
      // (one that changes nothing makes nothing)
      doc.edit("nothing", (d) => d);
    });
    expect(made).toBe(true);
    expect(doc.getState()).toEqual({ atoms: ["C", "N", "O"], title: "x" });
    // (one step - never merged into the person's on top, its key alike as it is)
    expect(doc.history()).toMatchObject({ undoDepth: 2, undoLabel: "conversation", undoBy: "a conversation, by a test model" });
    // (the person's next edit, however soon and whatever its key, a step of its own)
    doc.edit("add S", addAtom("S"), gestureStep("turn:1"));
    expect(doc.history().undoDepth).toBe(3);
    doc.undo();
    doc.undo();
    expect(doc.getState()).toEqual({ atoms: ["C"], title: "untitled" });
    // (nothing made: no step, and false)
    expect(doc.actAs("conversation", changeSet("turn:3", "a conversation"), () => void doc.edit("nothing", (d) => d))).toBe(false);
    expect(doc.history().undoDepth).toBe(1);
  });

  it("leaves what a change set made before it threw as one step, for its caller to take back", () => {
    const { doc } = withClock();
    expect(() =>
      doc.actAs("conversation", changeSet("turn:1", "a conversation"), () => {
        doc.edit("add N", addAtom("N"));
        doc.edit("add O", addAtom("O"));
        throw new Error("refused");
      }),
    ).toThrow("refused");
    expect(doc.history()).toMatchObject({ undoDepth: 1, undoBy: "a conversation" });
    expect(doc.drop("turn:1")).toBe(true);
    expect(doc.getState().atoms).toEqual([]);
    // (and edits after it are the person's again)
    doc.edit("add C", addAtom("C"));
    expect(doc.history().undoBy).toBeUndefined();
  });

  it("keeps two change sets apart, the same maker's with the same key one after the other: one turn, one undo", () => {
    const { doc } = withClock();
    doc.actAs("conversation", changeSet("turn:1", "a conversation"), () => void doc.edit("add N", addAtom("N")));
    doc.actAs("conversation", changeSet("turn:1", "a conversation"), () => void doc.edit("add O", addAtom("O")));
    expect(doc.history().undoDepth).toBe(2);
  });

  it("holds a change set's edits as one step however far apart - its own key's, never a window its caller gave", () => {
    const { doc, tick } = withClock();
    doc.actAs("conversation", { ...changeSet("turn:1", "a conversation"), coalesceWithinMs: 10 }, () => {
      doc.edit("add N", addAtom("N"));
      tick(1000);
      doc.edit("add O", addAtom("O"));
      return undefined;
    });
    expect(doc.history().undoDepth).toBe(1);
  });

  it("refuses a change set that waits, as soon as it returns - what it made before it waited one step, to drop", async () => {
    const { doc } = withClock();
    // (refused by its type)
    // @ts-expect-error - a change set does its work at once
    const waits: Parameters<typeof doc.actAs>[2] = async () => {
      doc.edit("add N", addAtom("N"));
      await Promise.resolve();
    };
    // (and as it runs, whatever its type said)
    expect(() => doc.actAs("conversation", changeSet("turn:1", "a conversation"), waits)).toThrow("A change set does its work at once");
    expect(doc.history()).toMatchObject({ undoDepth: 1, undoBy: "a conversation" });
    expect(doc.drop("turn:1")).toBe(true);
    expect(doc.getState().atoms).toEqual([]);
    await Promise.resolve();
  });

  it("lets nothing of the history be gone back on while a change set runs", () => {
    const { doc } = withClock();
    doc.edit("add C", addAtom("C"));
    doc.edit("add S", addAtom("S"));
    doc.undo();
    for (const travel of [() => doc.undo(), () => doc.redo(), () => doc.drop("x"), () => doc.takeBackTo(0, doc.getState()), () => doc.reset(doc.getState())]) {
      expect(() =>
        doc.actAs("conversation", changeSet("turn:1", "a conversation"), () => {
          travel();
          return undefined;
        }),
      ).toThrow("Nothing of the history is gone back on");
    }
    // (the person's steps as they were: one to undo, one to redo)
    expect(doc.history()).toMatchObject({ undoDepth: 1, redoDepth: 1, undoLabel: "add C", redoLabel: "add S" });
    expect(doc.getState().atoms).toEqual(["C"]);
  });

  it("takes back a gesture's step when it is let go of, leaving nothing to redo", () => {
    const { doc } = withClock();
    doc.edit("add C", addAtom("C"));
    doc.edit("drag", (d) => ({ ...d, title: "a" }), gestureStep("drag:1"));
    doc.edit("drag", (d) => ({ ...d, title: "b" }), gestureStep("drag:1"));
    expect(doc.drop("drag:1")).toBe(true);
    expect(doc.getState()).toEqual({ atoms: ["C"], title: "untitled" });
    expect(doc.history().redoDepth).toBe(0);
    expect(doc.history().undoLabel).toBe("add C");
    // (a gesture that made no step - another's on top - takes nothing back)
    expect(doc.drop("drag:2")).toBe(false);
    expect(doc.getState().atoms).toEqual(["C"]);
  });

  it("says what an undo or a redo would come to, without coming to it", () => {
    const { doc } = withClock();
    expect(doc.peek("undo")).toBeUndefined();
    doc.edit("add C", addAtom("C"));
    doc.edit("add O", addAtom("O"));
    expect(doc.peek("undo")?.atoms).toEqual(["C"]);
    expect(doc.getState().atoms).toEqual(["C", "O"]);
    doc.undo();
    expect(doc.peek("redo")?.atoms).toEqual(["C", "O"]);
    expect(doc.history()).toMatchObject({ undoDepth: 1, redoDepth: 1 });
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

  it("says whether the state was gone back or forward to, or made", () => {
    const doc = createDocument<Doc>(initial);
    expect(doc.travelled()).toBe(false);
    doc.edit("add C", addAtom("C"));
    expect(doc.travelled()).toBe(false);
    doc.undo();
    expect(doc.travelled()).toBe(true);
    doc.redo();
    expect(doc.travelled()).toBe(true);
    doc.edit("add O", addAtom("O"), { coalesceKey: "drag" });
    expect(doc.travelled()).toBe(false);
    doc.drop("drag");
    expect(doc.travelled()).toBe(true);
    doc.amend((d) => ({ ...d, title: "learnt" }));
    expect(doc.travelled()).toBe(false);
  });

  it("keeps a thousand steps by default, the 1001st dropping the oldest", () => {
    expect(DEFAULT_HISTORY_LIMIT).toBe(1000);
    const doc = createDocument<Doc>(initial);
    for (let i = 1; i <= 1000; i++) doc.edit(`add ${i}`, addAtom(String(i)));
    expect(doc.history().undoDepth).toBe(1000);
    doc.edit("add 1001", addAtom("1001"));
    expect(doc.history().undoDepth).toBe(1000);
    // every step back but the first: as far as undo goes, the document holds atom 1
    while (doc.undo());
    expect(doc.getState().atoms).toEqual(["1"]);
    // and all of them forward again
    while (doc.redo());
    expect(doc.getState().atoms).toHaveLength(1001);
  });

  it("holds its history to what its steps cost, the oldest dropped first, the steps to redo kept whole", () => {
    // each step costs 10, and 45 may be held: the present and three before it
    const doc = createDocument<Doc>(initial, { cost: () => 10, budget: 45 });
    for (const el of ["C", "O", "N", "S", "P", "F"]) doc.edit(`add ${el}`, addAtom(el));
    expect(doc.history().undoDepth).toBe(3);
    while (doc.undo());
    expect(doc.getState().atoms).toEqual(["C", "O", "N"]);
    // all three to redo, though the budget was full
    expect(doc.history().redoDepth).toBe(3);
    while (doc.redo());
    expect(doc.getState().atoms).toEqual(["C", "O", "N", "S", "P", "F"]);
    // a step that costs more than all of it still leaves one to undo
    const big = createDocument<Doc>(initial, { cost: () => 1000, budget: 45 });
    big.edit("add C", addAtom("C"));
    big.edit("add O", addAtom("O"));
    expect(big.history().undoDepth).toBe(1);
    // and a step that copies nothing costs nothing: the thousand steps kept
    const free = createDocument<Doc>(initial, { cost: (s, b) => (s.atoms === b?.atoms ? 0 : 10), budget: 45 });
    free.edit("add C", addAtom("C"));
    for (let i = 0; i < 1100; i++) free.edit(`title ${i}`, (d) => ({ ...d, title: String(i) }));
    expect(free.history().undoDepth).toBe(1000);
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

