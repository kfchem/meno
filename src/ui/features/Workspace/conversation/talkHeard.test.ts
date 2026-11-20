// Held beside talk.test.ts: the words of a reply that comes quickly are shown while it comes, not only once it pauses; and a reply stopped before it said anything keeps no empty reply of the model's.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import { setConnectionMaker } from "./connections";
import { HEARD_MS } from "../store/slices/conversationsSlice";
import type { Connection, ModelReply } from "./turn";

function page() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const id = store.getState().addConversation({ x0: 0, y0: 0, x1: 60, y1: 40 })!;
  store.getState().readConversation(id);
  return { doc, store, id };
}
afterEach(() => setConnectionMaker(() => null));

/** A connection whose reply the test says part by part, and ends. */
function coming() {
  let heard: ((t: string) => void) | undefined;
  let answer!: (r: ModelReply) => void;
  let ended!: (e: Error) => void;
  const connection: Connection = {
    id: "coming",
    to: "this computer",
    send: (_r, h) => {
      heard = h;
      return new Promise<ModelReply>((go, fail) => {
        answer = go;
        ended = fail;
      });
    },
    stop: (why) => ended(new Error(why)),
  };
  return { connection, say: (t: string) => heard!(t), answer: (r: ModelReply) => answer(r), started: () => heard !== undefined };
}

describe("a reply coming in", () => {
  it("is shown while parts keep coming faster than the wait between showings, and shown anew no oftener than that wait", async () => {
    vi.useFakeTimers();
    try {
      const { store, id } = page();
      const m = coming();
      setConnectionMaker(() => m.connection);
      const sent = store.getState().sendToConversation(id, "Tell me");
      await vi.waitFor(() => expect(m.started()).toBe(true));
      // (a part each HEARD_MS / 3, for four waits: the words so far are shown by the second, and shown anew no oftener than each wait)
      const shown: string[] = [];
      const off = store.subscribe((state) => {
        const h = state.talking[id]?.heard;
        if (h && h !== shown[shown.length - 1]) shown.push(h);
      });
      for (let k = 0; k < 12; k++) {
        m.say(`w${k} `);
        vi.advanceTimersByTime(HEARD_MS / 3);
      }
      off();
      expect(store.getState().talking[id]?.heard).toMatch(/^w0 w1 /);
      expect(shown.length).toBeGreaterThanOrEqual(2);
      expect(shown.length).toBeLessThanOrEqual(5);
      m.answer({ text: "done" });
      await sent;
    } finally {
      vi.useRealTimers();
    }
  });

  it("stopped before it said anything, leaves no empty reply of the model's, only that it stopped", async () => {
    const { store, doc, id } = page();
    const m = coming();
    setConnectionMaker(() => m.connection);
    const sent = store.getState().sendToConversation(id, "Tell me");
    await vi.waitFor(() => expect(m.started()).toBe(true));
    store.getState().stopConversation(id);
    await sent;
    const said = doc.getState().conversations![0].said;
    expect(said.filter((s) => s.by === "model")).toEqual([]);
    expect(said.slice(-1)[0]).toMatchObject({ by: "meno", text: "Stopped, as asked." });
  });
});
