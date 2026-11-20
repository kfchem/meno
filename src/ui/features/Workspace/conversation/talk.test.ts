import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import { setConnectionMaker } from "./connections";
import { scriptedModel } from "./scripted";
import type { Connection, ModelReply } from "./turn";
import { HEARD_MS } from "../store/slices/conversationsSlice";

/** A page with a conversation on it, read in the column; its connection, where given, a scripted test model. */
function page(replies?: readonly ModelReply[]) {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const id = store.getState().addConversation({ x0: 0, y0: 0, x1: 60, y1: 40 })!;
  store.getState().readConversation(id);
  if (replies) setConnectionMaker(() => scriptedModel(replies));
  return { doc, store, id };
}

afterEach(() => setConnectionMaker(() => null));

describe("a conversation, talked to from the page", () => {
  it("is read in the column over what it showed, and let go of", () => {
    const { store, id } = page();
    expect(store.getState()).toMatchObject({ conversationShown: id, textsOpen: true, pdfShown: null, setTableShown: null });
    store.getState().stopReadingConversation();
    expect(store.getState()).toMatchObject({ conversationShown: null, textsOpen: false });
  });

  it("keeps the column open on it as the page changes, and as what is said is kept", async () => {
    const { store, id } = page([{ text: "Hello." }]);
    store.getState().addPlus(1, 1);
    await store.getState().sendToConversation(id, "Hi");
    expect(store.getState()).toMatchObject({ conversationShown: id, textsOpen: true });
  });

  it("sends nothing with no model plugin, and says why on its card", async () => {
    const { store, doc, id } = page();
    await store.getState().sendToConversation(id, "Hello");
    expect(store.getState().talking[id]).toMatchObject({ running: false, said: "no-connection" });
    expect(doc.getState().conversations![0].said).toEqual([]);
  });

  it("brings a card left scrolled up to its latest as it is asked in, and leaves it where it is where nothing is sent", async () => {
    const { store, doc, id } = page();
    store.getState().scrollConversation(id, 120);
    expect(doc.getState().conversations![0].scroll).toBe(120);
    // (no model plugin: nothing is asked, the card stays where it was)
    await store.getState().sendToConversation(id, "Hello");
    expect(doc.getState().conversations![0].scroll).toBe(120);
    // (nothing typed: likewise)
    setConnectionMaker(() => scriptedModel([{ text: "Hi." }]));
    await store.getState().sendToConversation(id, "   ");
    expect(doc.getState().conversations![0].scroll).toBe(120);
    await store.getState().sendToConversation(id, "Hello");
    expect(doc.getState().conversations![0].scroll).toBeUndefined();
    expect(doc.getState().conversations![0].said.length).toBeGreaterThan(0);
  });

  it("keeps a turn's changes, or discards them - one step - and says what a change makes run again", async () => {
    const { store, doc, id } = page([{ text: "", calls: [{ tool: "put_structure", args: { smiles: "CCO" } }] }, { text: "There." }]);
    store.getState().updateConversation(id, { rights: { propose: true } });
    await store.getState().sendToConversation(id, "Draw ethanol");
    expect(store.getState().talking[id]).toMatchObject({ running: false });
    expect(store.getState().talking[id].changed).toMatch(/^conversation:1:/);
    expect(doc.getState().model.atoms).toHaveLength(3);
    expect(store.getState().discardConversationChanges(id)).toBe("dropped");
    expect(doc.getState().model.atoms).toHaveLength(0);
    expect(store.getState().talking[id].changed).toBeUndefined();
    // (what was said stays)
    expect(doc.getState().conversations![0].said.length).toBe(4);
  });

  it("will not discard a turn's changes over the person's since: undo is theirs", async () => {
    const { store, doc, id } = page([{ text: "", calls: [{ tool: "put_arrow" }] }, { text: "." }]);
    store.getState().updateConversation(id, { rights: { propose: true } });
    await store.getState().sendToConversation(id, "An arrow");
    store.getState().addPlus(100, 100);
    expect(store.getState().discardConversationChanges(id)).toBe("since");
    expect(doc.getState().arrows).toHaveLength(1);
    store.getState().keepConversationChanges(id);
    expect(store.getState().talking[id].changed).toBeUndefined();
  });

  it("says a step done before, its options changed, runs again", async () => {
    const { store, doc, id } = page();
    store.getState().updateConversation(id, { rights: { propose: true } });
    const step = store.getState().addStep("energy-window", "meno", 10, 10);
    doc.amend((d) => (d.steps ? { ...d, steps: d.steps.map((s) => (s.id === step ? { ...s, ran: { at: 1, ok: true, said: "done", input: "" } } : s)) } : d));
    setConnectionMaker(() => scriptedModel([{ text: "", calls: [{ tool: "set_options", args: { step: `step:${step}`, options: { window: 7 } } }] }, { text: "." }]));
    await store.getState().sendToConversation(id, "Widen it");
    expect(doc.getState().steps!.find((s) => s.id === step)!.options).toMatchObject({ window: 7 });
    expect(store.getState().talking[id].runsAgain).toEqual([String(step)]);
  });

  it("is never left talking where a turn fails part way: sent to again, and taken away", async () => {
    const { store, doc, id } = page([{ text: "", calls: [{ tool: "put_plus" }] }, { text: "." }]);
    store.getState().updateConversation(id, { rights: { propose: true } });
    store.setState({ addPlus: () => { throw new Error("the page refused it"); } });
    await store.getState().sendToConversation(id, "A plus.");
    expect(store.getState().talking[id].running).toBe(false);
    store.getState().removeConversation(id);
    expect(doc.getState().conversations).toHaveLength(0);
  });

  it("is never left talking where a turn cannot even begin - what was said not kept - however it fails", async () => {
    const { store, doc, id } = page([{ text: "." }]);
    const amend = doc.amend.bind(doc);
    doc.amend = () => {
      throw new Error("the file could not take it");
    };
    await expect(store.getState().sendToConversation(id, "Hello")).rejects.toThrow("the file could not take it");
    doc.amend = amend;
    expect(store.getState().talking[id].running).toBe(false);
  });

  it("is taken away, and not while it talks", async () => {
    const { store, doc, id } = page();
    store.setState({ talking: { [id]: { running: true } } });
    store.getState().removeConversation(id);
    expect(doc.getState().conversations).toHaveLength(1);
    store.setState({ talking: {} });
    store.getState().removeConversation(id);
    expect(doc.getState().conversations).toHaveLength(0);
    expect(store.getState().conversationShown).toBeNull();
  });

  it("shows the words of a reply as they come, at most each HEARD_MS, and none once it has come; Stop ends one under way, its words kept", async () => {
    vi.useFakeTimers();
    try {
      const { store, doc, id } = page();
      let heard: ((t: string) => void) | undefined;
      let answer!: (r: ModelReply) => void;
      let ended!: (e: Error) => void;
      const stops: string[] = [];
      const coming: Connection = {
        id: "coming",
        to: "this computer",
        send: (_r, h) => {
          heard = h;
          return new Promise<ModelReply>((go, fail) => {
            answer = go;
            ended = fail;
          });
        },
        stop: (why) => {
          stops.push(why);
          ended(new Error(why));
        },
      };
      setConnectionMaker(() => coming);
      const sent = store.getState().sendToConversation(id, "What is here?");
      await vi.waitFor(() => expect(heard).toBeDefined());
      heard!("Methanol ");
      heard!("is ");
      // (not shown at once, each word: once the wait is up, the latest)
      expect(store.getState().talking[id]?.heard).toBeUndefined();
      vi.advanceTimersByTime(HEARD_MS);
      expect(store.getState().talking[id]?.heard).toBe("Methanol is ");
      heard!("here.");
      answer({ text: "Methanol is here." });
      await sent;
      vi.advanceTimersByTime(HEARD_MS);
      expect(store.getState().talking[id]).toMatchObject({ running: false });
      expect(store.getState().talking[id]?.heard).toBeUndefined();
      expect(doc.getState().conversations![0].said.at(-1)).toMatchObject({ by: "model", text: "Methanol is here." });
      // (Stop as one comes: ended there, its words so far kept, said to have stopped)
      heard = undefined;
      const again = store.getState().sendToConversation(id, "And?");
      await vi.waitFor(() => expect(heard).toBeDefined());
      heard!("Nothing ");
      store.getState().stopConversation(id);
      await again;
      expect(stops).toEqual(["Stopped, as asked"]);
      expect(doc.getState().conversations![0].said.slice(-2)).toMatchObject([{ by: "model", text: "Nothing " }, { by: "meno", text: "Stopped, as asked." }]);
      expect(store.getState().talking[id]?.heard).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
