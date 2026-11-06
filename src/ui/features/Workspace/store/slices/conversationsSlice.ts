import type { StoreApi } from "zustand";
import type { DocumentStore } from "../../../../../lib/doc";
import { gestureStep } from "../../../../../lib/doc/document";
import type { WorkspaceDocument } from "../../document";
import { addConversation, clearSaid, removeConversations, updateConversation, type ConversationPatch } from "../../conversation/ops";
import { connectionFor } from "../../conversation/connections";
import { runTurn } from "../../conversation/turn";
import type { EditorState } from "../types";

type SetState = StoreApi<EditorState>["setState"];
type GetState = StoreApi<EditorState>["getState"];

/** A turn's state, the view's: whether it runs, whether Stop was asked, and what it changed - its change set's key, and the steps it makes run again. */
export type Talking = { running: boolean; stop?: true; changed?: string; runsAgain?: string[]; said?: string };

/**
 * Conversations on the page (conversation/types; docs/CONVERSATIONS.md):
 * put down, moved, sized, changed and taken away as edits to the document;
 * read in the column; and talked to, a turn at a time (conversation/turn).
 */
export function createConversationsSlice(doc: DocumentStore<WorkspaceDocument>, set: SetState, get: GetState) {
  const talk = (id: number, patch: Partial<Talking> | null) =>
    set((prev: EditorState) => {
      const talking = { ...prev.talking };
      if (patch) talking[id] = { ...(talking[id] ?? { running: false }), ...patch };
      else delete talking[id];
      return { ...prev, talking };
    });
  return {
    setHoveredConversation: (id: number | null) => set((prev: EditorState) => (prev.hoveredConversation === id ? prev : { ...prev, hoveredConversation: id })),
    addConversation: (frame: { x0: number; y0: number; x1: number; y1: number }) => {
      const id = doc.getState().nextConversationId ?? 1;
      return doc.edit("add conversation", (d) => addConversation(d, frame)) ? id : null;
    },
    moveConversation: (id: number, dx: number, dy: number, gesture?: string) => {
      const c = doc.getState().conversations?.find((x) => x.id === id);
      if (!c) return;
      doc.edit("move conversation", (d) => updateConversation(d, id, { frame: { x0: c.x0 + dx, y0: c.y0 + dy, x1: c.x1 + dx, y1: c.y1 + dy } }), gesture ? gestureStep(`conversation-move:${id}:${gesture}`) : {});
    },
    resizeConversation: (id: number, frame: { x0: number; y0: number; x1: number; y1: number }, gesture?: string) =>
      doc.edit("size conversation", (d) => updateConversation(d, id, { frame }), gesture ? gestureStep(`conversation-size:${id}:${gesture}`) : {}),
    updateConversation: (id: number, patch: ConversationPatch) => doc.edit("change conversation", (d) => updateConversation(d, id, patch)),
    removeConversation: (id: number) => {
      if (get().talking[id]?.running) return;
      if (doc.edit("delete conversation", (d) => removeConversations(d, [id])))
        set((prev: EditorState) => ({
          ...prev,
          hoveredConversation: prev.hoveredConversation === id ? null : prev.hoveredConversation,
          ...(prev.conversationShown === id ? { conversationShown: null } : {}),
        }));
    },
    /** A conversation read in the column, over what it showed. */
    readConversation: (id: number) => set({ conversationShown: id, textsOpen: true, pdfShown: null, setTableShown: null }),
    stopReadingConversation: () =>
      set((prev: EditorState) => {
        const nothing = prev.pdfShown == null && prev.setTableShown == null && !prev.texts.some((t) => t.id === prev.textShown && t.reading !== false) && !prev.textsLost.some((t) => t.id === prev.textShown);
        return { ...prev, conversationShown: null, ...(nothing ? { textsOpen: false } : {}) };
      }),
    /** What was said and sent emptied (*Clear*): no step of the page's history. */
    clearConversation: (id: number) => doc.amend((d) => clearSaid(d, id), { unsaved: true }),
    /**
     * The person's words sent: a turn, through the conversation's
     * connection - none, and nothing is sent, said on the card. Its changes,
     * where it made any, wait to be kept or discarded, and what they make run
     * again is said.
     */
    sendToConversation: async (id: number, words: string) => {
      const c = doc.getState().conversations?.find((x) => x.id === id);
      if (!c || get().talking[id]?.running || !words.trim()) return;
      const connection = connectionFor(c);
      if (!connection) {
        talk(id, { running: false, said: "no-connection" });
        return;
      }
      const before = new Map((doc.getState().steps ?? []).map((s) => [s.id, s]));
      talk(id, { running: true, stop: undefined, changed: undefined, runsAgain: undefined, said: undefined });
      let turn: Awaited<ReturnType<typeof runTurn>> = { sent: true };
      try {
        turn = await runTurn({ doc, calls: get(), id, words, connection, turn: `${Date.now()}`, stop: () => !!get().talking[id]?.stop });
      } finally {
        // (never left talking: whatever came of it, it may be sent to again, and taken away)
        if (get().talking[id]?.running) talk(id, { running: false, stop: undefined });
      }
      // (a step done before it whose options it changed: the next Run runs it again)
      const runsAgain = turn.changed
        ? (doc.getState().steps ?? []).filter((s) => {
            const was = before.get(s.id);
            return was?.ran?.ok && JSON.stringify(was.options) !== JSON.stringify(s.options);
          }).map((s) => String(s.id))
        : [];
      talk(id, { running: false, stop: undefined, ...(turn.changed ? { changed: turn.changed } : {}), ...(runsAgain.length ? { runsAgain } : {}), ...(turn.sent ? {} : { said: turn.why }) });
    },
    stopConversation: (id: number) => talk(id, { stop: true }),
    /** A turn's changes kept: nothing to undo of them but by undo itself. */
    keepConversationChanges: (id: number) => talk(id, { changed: undefined, runsAgain: undefined }),
    /** A turn's changes dropped, as an undo would - unless a step it made is running, which the person stops first. */
    discardConversationChanges: (id: number): "dropped" | "running" | "since" | "none" => {
      const key = get().talking[id]?.changed;
      if (!key) return "none";
      // (a step it made that is running: the person's to stop first, as undo asks of one)
      const before = new Set((doc.peek("undo")?.steps ?? []).map((s) => s.id));
      if ((doc.getState().steps ?? []).some((s) => s.running && !before.has(s.id))) return "running";
      // (changed since, by the person: undo is theirs, step by step)
      if (!doc.drop(key)) return "since";
      talk(id, { changed: undefined, runsAgain: undefined });
      return "dropped";
    },
  };
}
