import { describe, expect, it } from "vitest";
import { acceptOptions, type Option } from "../../../../lib/options";
import { createWorkspaceDocument, emptyWorkspaceDocument } from "../document";
import { optionsChecked, settable, clearSpot } from "./change";
import { addConversation, addSaid, clearSaid, removeConversations, scrolledConversation, updateConversation } from "./ops";
import { readConversations } from "./saved";
import { NEW_RIGHTS } from "./types";

describe("a conversation on the page", () => {
  it("is put down in its frame - it may read, and proposes nothing yet - changed, and taken away, each a step", () => {
    const doc = createWorkspaceDocument();
    doc.edit("conversation", (d) => addConversation(d, { x0: 0, y0: 0, x1: 20, y1: 10 }));
    expect(doc.getState().conversations).toEqual([{ id: 1, x0: 0, y0: 0, x1: 20, y1: 10, rights: NEW_RIGHTS, said: [], sent: [] }]);
    // (no frame of its own: none put down)
    expect(addConversation(doc.getState(), { x0: 5, y0: 0, x1: 5, y1: 10 })).toBe(doc.getState());
    doc.edit("whole page", (d) => updateConversation(d, 1, { wholePage: true, rights: { propose: true }, connection: "a-model" }));
    expect(doc.getState().conversations![0]).toMatchObject({ wholePage: true, rights: { read: true, propose: true }, connection: "a-model" });
    doc.edit("back", (d) => updateConversation(d, 1, { wholePage: false, connection: null }));
    expect(doc.getState().conversations![0]).toEqual({ id: 1, x0: 0, y0: 0, x1: 20, y1: 10, rights: { read: true, propose: true }, said: [], sent: [] });
    doc.edit("gone", (d) => removeConversations(d, [1]));
    expect(doc.getState().conversations).toEqual([]);
    doc.undo();
    expect(doc.getState().conversations).toHaveLength(1);
  });

  it("keeps what was said and sent apart from the page's history: undo takes none of it back, Clear empties both", () => {
    const doc = createWorkspaceDocument();
    doc.edit("conversation", (d) => addConversation(d, { x0: 0, y0: 0, x1: 20, y1: 10 }));
    doc.amend((d) => addSaid(d, 1, [{ by: "person", text: "Hello", at: 1 }], [{ at: 1, to: "x", things: [], chars: 5 }]), { unsaved: true });
    expect(doc.history().undoDepth).toBe(1);
    doc.undo();
    doc.redo();
    expect(doc.getState().conversations![0].said).toHaveLength(1);
    doc.amend((d) => clearSaid(d, 1), { unsaved: true });
    expect(doc.getState().conversations![0]).toMatchObject({ said: [], sent: [] });
  });
});

describe("a conversation's card left scrolled", () => {
  const made = () => {
    const doc = createWorkspaceDocument();
    doc.edit("conversation", (d) => addConversation(d, { x0: 0, y0: 0, x1: 20, y1: 10 }));
    return doc;
  };

  it("is the view's: kept on the conversation, no step of the page's history nor a change to save, and none when at its latest", () => {
    const doc = made();
    const before = doc.history().undoDepth;
    doc.amend((d) => scrolledConversation(d, 1, 240.5));
    expect(doc.getState().conversations![0].scroll).toBe(240.5);
    expect(doc.history().undoDepth).toBe(before);
    // (undo and redo of the page leave it where it was left)
    doc.undo();
    doc.redo();
    expect(doc.getState().conversations![0].scroll).toBe(240.5);
    // (at its latest: no offset kept at all)
    doc.amend((d) => scrolledConversation(d, 1, null));
    expect("scroll" in doc.getState().conversations![0]).toBe(false);
  });

  it("is kept only as a number from 0 - any other is the latest - and the same state returned where nothing changes", () => {
    const d0 = made().getState();
    const d1 = scrolledConversation(d0, 1, 10);
    expect([0, 10].map((v) => scrolledConversation(d0, 1, v).conversations![0].scroll)).toEqual([0, 10]);
    for (const bad of [-1, Number.NaN, Infinity, null]) expect("scroll" in scrolledConversation(d1, 1, bad).conversations![0]).toBe(false);
    expect(scrolledConversation(d1, 1, 10)).toBe(d1);
    expect(scrolledConversation(d0, 1, null)).toBe(d0);
    expect(scrolledConversation(d0, 7, 10)).toBe(d0);
  });

  it("is let go of by Clear and kept by a frame moved, a right changed", () => {
    const doc = made();
    doc.amend((d) => scrolledConversation(d, 1, 50));
    doc.edit("move", (d) => updateConversation(d, 1, { frame: { x0: 1, y0: 1, x1: 21, y1: 11 }, rights: { propose: true } }));
    expect(doc.getState().conversations![0].scroll).toBe(50);
    doc.amend((d) => clearSaid(d, 1), { unsaved: true });
    expect("scroll" in doc.getState().conversations![0]).toBe(false);
  });
});

describe("conversations as a file keeps them", () => {
  const saved = { x0: 0, y0: 0, x1: 20, y1: 10, rights: { read: true, propose: false }, connection: "a-model", said: [{ by: "person", text: "Hi", at: 1 }, { by: "model", text: "Hello", calls: [{ tool: "list" }], at: 2 }, { by: "tool", tool: "list", ok: true, answer: { things: [] }, at: 3 }], sent: [{ at: 2, to: "x", things: [{ id: "structure:1", chars: 10 }], chars: 30 }] };

  it("are read back as written", () => {
    expect(readConversations([saved])).toEqual([saved]);
  });

  it("keep where a card was left scrolled, as a number from 0; any other is not read, and the conversation opens at its latest", () => {
    expect(readConversations([{ ...saved, scroll: 312.5 }])).toEqual([{ ...saved, scroll: 312.5 }]);
    expect(readConversations([{ ...saved, scroll: 0 }])).toEqual([{ ...saved, scroll: 0 }]);
    for (const scroll of [-3, "100", null, Number.NaN, {}]) {
      let left = 0;
      expect(readConversations([{ ...saved, scroll }], () => left++)).toEqual([saved]);
      expect(left).toBe(0);
    }
  });

  it("have no name: one an old file gives is not read, and the conversation opens without it - however odd that name was", () => {
    for (const name of ["Esters", "", 7, { x: 1 }, "x".repeat(500)]) {
      let left = 0;
      expect(readConversations([{ ...saved, name }], () => left++)).toEqual([saved]);
      expect(left).toBe(0);
    }
  });

  it("leave out one not as Meno writes it, and a thing said that is not, the rest kept", () => {
    let left = 0;
    for (const bad of [{ ...saved, x1: -1 }, { ...saved, rights: { read: "yes" } }, { ...saved, connection: "../x" }, null]) expect(readConversations([bad], () => left++)).toEqual([]);
    expect(left).toBe(4);
    const odd = readConversations([{ ...saved, said: [...saved.said, { by: "someone", text: "x", at: 4 }, { by: "person", text: 7, at: 5 }] }], () => {});
    expect(odd[0].said).toHaveLength(3);
    // (a tool's answer too large to have been Meno's, or what it gave not as Meno writes it: left out; what it gave, kept)
    const tool = (over: Record<string, unknown>) => ({ by: "tool", tool: "read", ok: true, answer: "x", at: 6, ...over });
    const big = readConversations([{ ...saved, said: [tool({ answer: "y".repeat(1_000_001) }), tool({ things: [7] }), tool({ things: ["text:1"] })] }], () => {});
    expect(big[0].said).toEqual([{ by: "tool", tool: "read", ok: true, answer: "x", things: ["text:1"], at: 6 }]);
    // (at most so many things said: the latest kept)
    const many = readConversations([{ ...saved, said: Array.from({ length: 20_005 }, (_, k) => ({ by: "person", text: `${k}`, at: k })) }], () => {});
    expect([many[0].said.length, (many[0].said[0] as { text: string }).text]).toEqual([20_000, "5"]);
  });
});

describe("what a conversation's tools may set", () => {
  const opts = acceptOptions([
    { id: "method", label: "Method", type: "choice", choices: [{ value: "a", label: "A" }, { value: "b", label: "B" }], default: "a" },
    { id: "window", label: "Window", type: "number", default: 3, min: 0, max: 50 },
    { id: "cores", label: "Cores", type: "number", default: 4 },
    { id: "keywords", label: "More keywords", type: "text", default: "" },
    { id: "keep", label: "Keep its files", type: "switch", default: false },
    { id: "level", label: "Level", type: "choice", choices: [{ value: "x", label: "X" }], default: "x", person: true },
  ]);

  it("a choice, and a number within its bounds - never free text, a switch, an unbounded number, nor one its plugin leaves to the person", () => {
    expect(opts.filter((o) => settable(o)).map((o: Option) => o.id)).toEqual(["method", "window"]);
    // (Meno's own options, which Meno knows: a number bounded one way or none too)
    expect(opts.filter((o) => settable(o, true)).map((o: Option) => o.id)).toEqual(["method", "window", "cores"]);
    expect(opts.find((o) => o.id === "level")?.person).toBe(true);
  });

  it("checks what is asked as a step's card does, saying why not", () => {
    expect(optionsChecked(opts, { method: "b", window: 10 })).toEqual({ values: { method: "b", window: 10 } });
    expect(optionsChecked(opts, { method: "c" })).toEqual({ why: '"Method" is one of a, b' });
    expect(optionsChecked(opts, { window: 99 })).toEqual({ why: '"Window" is a number from 0 to 50' });
    for (const id of ["cores", "keywords", "keep", "level"]) expect(optionsChecked(opts, { [id]: 1 }), id).toMatchObject({ why: expect.stringMatching(/is left to you to set$/) });
  });
});

describe("where a thing is put down", () => {
  it("is the first place in the frame with nothing near it; where there is none, its middle, said", () => {
    const d = { ...emptyWorkspaceDocument(), model: { atoms: [{ id: 1, el: "C", x: 2, y: 2, r: 0.3 }], bonds: [] } };
    const spot = clearSpot(d, { x0: 0, y0: 0, x1: 30, y1: 10 }, 4, 2);
    expect(spot.clear).toBe(true);
    expect(Math.abs(spot.at.x - 2) > 2 + 1.5 || Math.abs(spot.at.y - 2) > 1 + 1.5).toBe(true);
    expect(clearSpot(d, { x0: 0, y0: 0, x1: 4, y1: 4 }, 4, 4)).toEqual({ at: { x: 2, y: 2 }, clear: false });
  });
});
