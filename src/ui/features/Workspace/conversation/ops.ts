/**
 * Conversations on the page, as edits to the document (conversation/types):
 * one put down, changed, taken away - each a step of the page's history -
 * and what is said and sent added to one, which is no step of it: undo
 * does not take back what was said, nor what was sent (`amend`).
 */
import type { WorkspaceDocument } from "../document";
import { NEW_RIGHTS, type Conversation, type Rights, type Said, type Sent } from "./types";

const finite = (...xs: number[]) => xs.every(Number.isFinite);

/** How large a conversation's frame is put down, in bonds: room for a scheme and a few steps. */
export const CONVERSATION_FRAME = { w: 24, h: 14 };

/** `doc` with a conversation put down in `frame` - or of the whole page - numbered `nextConversationId`: it may read, and proposes nothing yet. */
export function addConversation(doc: WorkspaceDocument, frame: { x0: number; y0: number; x1: number; y1: number }, wholePage = false): WorkspaceDocument {
  const { x0, y0, x1, y1 } = frame;
  if (!finite(x0, y0, x1, y1) || !(x1 > x0) || !(y1 > y0)) return doc;
  const id = doc.nextConversationId ?? 1;
  const made: Conversation = { id, x0, y0, x1, y1, ...(wholePage ? { wholePage: true as const } : {}), rights: { ...NEW_RIGHTS }, said: [], sent: [] };
  return { ...doc, conversations: [...(doc.conversations ?? []), made], nextConversationId: id + 1 };
}

/** What may be changed of a conversation: its frame, whether it sees the whole page, its rights, its connection (null: none). */
export type ConversationPatch = { frame?: { x0: number; y0: number; x1: number; y1: number }; wholePage?: boolean; rights?: Partial<Rights>; connection?: string | null };

/** `doc` with the conversation `id` changed as `patch` says. */
export function updateConversation(doc: WorkspaceDocument, id: number, patch: ConversationPatch): WorkspaceDocument {
  const at = (doc.conversations ?? []).findIndex((c) => c.id === id);
  if (at < 0) return doc;
  const was = doc.conversations![at];
  const { wholePage: _w, connection: _c, ...rest } = was;
  const frame = patch.frame && finite(patch.frame.x0, patch.frame.y0, patch.frame.x1, patch.frame.y1) && patch.frame.x1 > patch.frame.x0 && patch.frame.y1 > patch.frame.y0 ? patch.frame : undefined;
  const whole = patch.wholePage ?? !!was.wholePage;
  const connection = patch.connection === undefined ? was.connection : patch.connection ?? undefined;
  const next: Conversation = {
    ...rest,
    ...(frame ?? {}),
    ...(whole ? { wholePage: true as const } : {}),
    ...(connection ? { connection } : {}),
    rights: { ...was.rights, ...patch.rights },
  };
  return { ...doc, conversations: doc.conversations!.map((c, i) => (i === at ? next : c)) };
}

export function removeConversations(doc: WorkspaceDocument, ids: Iterable<number>): WorkspaceDocument {
  const gone = new Set(ids);
  if (!doc.conversations?.some((c) => gone.has(c.id))) return doc;
  return { ...doc, conversations: doc.conversations.filter((c) => !gone.has(c.id)) };
}

/** `doc` with what was said and sent added to the conversation `id`, where it is. */
export function addSaid(doc: WorkspaceDocument, id: number, said: readonly Said[], sent: readonly Sent[] = []): WorkspaceDocument {
  if (!doc.conversations?.some((c) => c.id === id)) return doc;
  return { ...doc, conversations: doc.conversations.map((c) => (c.id === id ? { ...c, said: [...c.said, ...said], sent: [...c.sent, ...sent] } : c)) };
}

/** `doc` with a conversation's exchange and its send log emptied (*Clear*). */
export function clearSaid(doc: WorkspaceDocument, id: number): WorkspaceDocument {
  if (!doc.conversations?.some((c) => c.id === id)) return doc;
  return { ...doc, conversations: doc.conversations.map((c) => (c.id === id ? { ...c, said: [], sent: [] } : c)) };
}
