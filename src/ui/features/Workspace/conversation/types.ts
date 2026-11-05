/**
 * A conversation on the page, as the document keeps it (docs/CONVERSATIONS.md,
 * *The Conversation object*): its frame - what it sees - or the whole page,
 * where the person made it so; its rights; the plugin it talks through, by
 * id, never with a key; what was said; and what was sent where. Saved with
 * the workspace, by default (the maintainer, 2026-11-04).
 */

/** What a conversation may do (*Rights*): read what lies inside, and propose changes there. Running is no right it has. */
export type Rights = { read: boolean; propose: boolean };

/** A new conversation's: it may read, and proposes nothing until the person lets it. */
export const NEW_RIGHTS: Rights = { read: true, propose: false };

/** A call of one of Meno's tools, as a model makes it. */
export type ToolCall = { tool: string; args?: Record<string, unknown> };

/**
 * One thing said in a conversation, in turn:
 * - the person's words;
 * - the model's: its words - plain text, never drawn as a page - and the tools it called;
 * - Meno's: what each tool answered, as data;
 * - and Meno's own word on the turn: that it stopped at its limit, or why nothing was sent.
 */
export type Said =
  | { by: "person"; text: string; at: number }
  | { by: "model"; text: string; calls?: ToolCall[]; at: number }
  /** A tool's answer, and the things of the page it gave, by their ids (`things`): not sent again once one lies outside the frame. */
  | { by: "tool"; tool: string; answer: unknown; ok: boolean; things?: string[]; at: number }
  | { by: "meno"; text: string; at: number };

/** What one turn sent, and where (*The send log*): each thing by its id and how many characters of it; the whole's characters; the connection, and its host where it has one. Never a key. */
export type Sent = { at: number; to: string; things: { id: string; chars: number }[]; chars: number };

export type Conversation = {
  id: number;
  /** Its frame; or, `wholePage`, none - it sees all of the page, and its card says so. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  wholePage?: true;
  name?: string;
  rights: Rights;
  /** The plugin it talks through, by its id; none, and it sends nothing. */
  connection?: string;
  said: Said[];
  sent: Sent[];
};
