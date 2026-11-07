import type { FrameTab } from "../pageGl/frameParts";
import { connectionFor } from "./connections";
import type { Conversation } from "./types";

/**
 * What a conversation's tab says beside its name: where what lies inside its
 * frame may go - sent to the hosts its model plugin names, or kept on this
 * computer - while it talks too; or that it sends nothing (the maintainer,
 * 2026-11-07: its frame shows that what is in it may be sent away).
 */
export function statusOf(c: Conversation, talking: boolean): string {
  const via = connectionFor(c);
  if (!via) return "Sends nothing: no model plugin";
  if (via.to === "this computer") return talking ? "Talking… · stays on this computer" : "Stays on this computer";
  return talking ? `Talking… · sending to ${via.to}` : `May be sent to ${via.to}`;
}

/** Its tab's icon: something going away from this computer, a computer where it stays, or a conversation that sends nothing. */
export function iconOf(c: Conversation): string {
  const via = connectionFor(c);
  return !via ? "chat" : via.to === "this computer" ? "this-computer" : "sent-away";
}

/** The frames of the page's conversations, as FrameTabs draws them (pageGl/FrameTabs): outward - their own line, not a set's - and a conversation's words. */
export function conversationTabs(conversations: readonly Conversation[], o: { hovered: number | null; shown: number | null; talking: Record<number, { running: boolean } | undefined> }): FrameTab[] {
  return conversations.map((c) => ({
    key: `conversation:${c.id}`,
    box: { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 },
    ...(c.wholePage ? { tabOnly: true as const } : { edges: true as const }),
    tone: o.shown === c.id ? "chosen" : o.hovered === c.id ? "hover" : "rest",
    outward: true as const,
    tab: { icon: iconOf(c), name: c.name ?? "Conversation", status: statusOf(c, !!o.talking[c.id]?.running), ...(c.wholePage ? { warn: "Sees the whole page" } : {}) },
  }));
}
