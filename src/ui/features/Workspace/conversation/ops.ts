/**
 * Conversations on the page, as edits to the document (conversation/types):
 * one put down, changed, taken away - each a step of the page's history -
 * and what is said and sent added to one, which is no step of it: undo
 * does not take back what was said, nor what was sent (`amend`).
 */
import type { WorkspaceDocument } from "../document";
import { framedForCard } from "../pageGl/conversationCard";
import { NEW_RIGHTS, type Conversation, type Rights, type Said, type Sent } from "./types";

const finite = (...xs: number[]) => xs.every(Number.isFinite);

/** How large a conversation's frame is put down, in bonds: room for a scheme and a few steps. */
export const CONVERSATION_FRAME = { w: 24, h: 14 };

/** `doc` with a conversation put down in `frame` - or of the whole page - numbered `nextConversationId`: it may read, and proposes nothing yet. */
export function addConversation(doc: WorkspaceDocument, frame: { x0: number; y0: number; x1: number; y1: number }, wholePage = false): WorkspaceDocument {
  if (!finite(frame.x0, frame.y0, frame.x1, frame.y1) || !(frame.x1 > frame.x0) || !(frame.y1 > frame.y0)) return doc;
  // (a frame always holds its card: put down smaller, it is made as large as the card needs)
  const { x0, y0, x1, y1 } = framedForCard(frame);
  const id = doc.nextConversationId ?? 1;
  const made: Conversation = { id, x0, y0, x1, y1, ...(wholePage ? { wholePage: true as const } : {}), rights: { ...NEW_RIGHTS }, said: [], sent: [] };
  return { ...doc, conversations: [...(doc.conversations ?? []), made], nextConversationId: id + 1 };
}

/** What may be changed of a conversation: its frame (made as large as its card needs), whether it sees the whole page, its rights, its connection (null: none). */
export type ConversationPatch = { frame?: { x0: number; y0: number; x1: number; y1: number }; wholePage?: boolean; rights?: Partial<Rights>; connection?: string | null };

/** `doc` with the conversation `id` changed as `patch` says. */
export function updateConversation(doc: WorkspaceDocument, id: number, patch: ConversationPatch): WorkspaceDocument {
  const at = (doc.conversations ?? []).findIndex((c) => c.id === id);
  if (at < 0) return doc;
  const was = doc.conversations![at];
  const { wholePage: _w, connection: _c, ...rest } = was;
  const frame = patch.frame && finite(patch.frame.x0, patch.frame.y0, patch.frame.x1, patch.frame.y1) && patch.frame.x1 > patch.frame.x0 && patch.frame.y1 > patch.frame.y0 ? framedForCard(patch.frame) : undefined;
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

/** `doc` with a conversation's exchange and its send log emptied (*Clear*) - and its card at its latest, there being nothing to scroll back to. */
export function clearSaid(doc: WorkspaceDocument, id: number): WorkspaceDocument {
  if (!doc.conversations?.some((c) => c.id === id)) return doc;
  return { ...doc, conversations: doc.conversations.map((c) => (c.id === id ? { ...withoutScroll(c), said: [], sent: [] } : c)) };
}

const withoutScroll = ({ scroll: _s, ...c }: Conversation): Conversation => c;

/** `doc` with the card of the conversation `id` left scrolled to `offset` page px from the top of its history - or, null (or no offset past nothing), at its latest. */
export function scrolledConversation(doc: WorkspaceDocument, id: number, offset: number | null): WorkspaceDocument {
  const at = (doc.conversations ?? []).findIndex((c) => c.id === id);
  if (at < 0) return doc;
  const was = doc.conversations![at];
  const to = offset != null && Number.isFinite(offset) && offset >= 0 ? offset : null;
  if ((was.scroll ?? null) === to) return doc;
  const next: Conversation = to == null ? withoutScroll(was) : { ...was, scroll: to };
  return { ...doc, conversations: doc.conversations!.map((c, i) => (i === at ? next : c)) };
}
