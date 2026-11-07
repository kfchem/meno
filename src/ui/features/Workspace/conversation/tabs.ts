import type { FrameTab } from "../pageGl/frameParts";
import { connectionFor } from "./connections";
import type { Conversation } from "./types";

/** What a conversation's tab says beside its name: that it talks, what it talks through, or that it sends nothing. */
export function statusOf(c: Conversation, talking: boolean): string {
  if (talking) return "Talking…";
  const via = connectionFor(c);
  return via ? `through ${via.id}` : "Sends nothing: no model plugin";
}

/** The frames of the page's conversations, as FrameTabs draws them (pageGl/FrameTabs): a set's look, a conversation's words. */
export function conversationTabs(conversations: readonly Conversation[], o: { hovered: number | null; shown: number | null; talking: Record<number, { running: boolean } | undefined> }): FrameTab[] {
  return conversations.map((c) => ({
    key: `conversation:${c.id}`,
    box: { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 },
    ...(c.wholePage ? { tabOnly: true as const } : { edges: true as const }),
    tone: o.shown === c.id ? "chosen" : o.hovered === c.id ? "hover" : "rest",
    tab: { icon: "chat", name: c.name ?? "Conversation", status: statusOf(c, !!o.talking[c.id]?.running), ...(c.wholePage ? { warn: "Sees the whole page" } : {}) },
  }));
}
