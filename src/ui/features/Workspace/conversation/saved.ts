/**
 * Conversations as a workspace's file keeps them (utils/workspace), read
 * back strictly: each its frame, rights, connection by id, what was said and
 * what was sent. One that is not as Meno writes it is left out, and said;
 * a thing said that is not, likewise, the rest of its conversation kept.
 */
import { leftOut } from "../utils/readNotes";
import { framedForCard } from "../pageGl/conversationCard";
import type { Conversation, Rights, Said, Sent, ToolCall } from "./types";

const MOST_TEXT = 1_000_000;
/** How many things said a conversation keeps at most, as saved, and how long a tool's answer may be, written out. */
const MOST_SAID = 20_000;
const MOST_ANSWER = 1_000_000;
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const text = (v: unknown, most = MOST_TEXT): v is string => typeof v === "string" && v.length <= most;

function rightsOf(v: unknown): Rights | null {
  const r = v as Partial<Rights> | null;
  return r && typeof r.read === "boolean" && typeof r.propose === "boolean" ? { read: r.read, propose: r.propose } : null;
}

function callsOf(v: unknown): ToolCall[] | null {
  if (v == null) return [];
  if (!Array.isArray(v)) return null;
  const calls: ToolCall[] = [];
  for (const c of v as Partial<ToolCall>[]) {
    if (!text(c?.tool, 100) || (c.args != null && (typeof c.args !== "object" || Array.isArray(c.args)))) return null;
    calls.push({ tool: c.tool, ...(c.args ? { args: c.args } : {}) });
  }
  return calls;
}

/** A thing said, as saved; null, where it is not as Meno writes one. */
function saidOf(v: unknown): Said | null {
  const s = v as Record<string, unknown> | null;
  if (!s || !num(s.at)) return null;
  if (s.by === "person" || s.by === "meno") return text(s.text) ? { by: s.by, text: s.text, at: s.at } : null;
  if (s.by === "model") {
    const calls = callsOf(s.calls);
    return text(s.text) && calls ? { by: "model", text: s.text, ...(calls.length ? { calls } : {}), at: s.at } : null;
  }
  if (s.by === "tool") {
    const things = s.things == null ? [] : Array.isArray(s.things) && s.things.length <= MOST_SAID && s.things.every((t) => text(t, 40)) ? (s.things as string[]) : null;
    const size = JSON.stringify(s.answer ?? null)?.length ?? 0;
    return text(s.tool, 100) && typeof s.ok === "boolean" && "answer" in s && things && size <= MOST_ANSWER ? { by: "tool", tool: s.tool, answer: s.answer, ok: s.ok, ...(things.length ? { things } : {}), at: s.at } : null;
  }
  return null;
}

function sentOf(v: unknown): Sent | null {
  const s = v as Partial<Sent> | null;
  if (!s || !num(s.at) || !text(s.to, 200) || !num(s.chars) || !Array.isArray(s.things)) return null;
  const things = s.things.filter((t): t is { id: string; chars: number } => text(t?.id, 40) && num(t?.chars));
  return things.length === s.things.length ? { at: s.at, to: s.to, things, chars: s.chars } : null;
}

/** The conversations a file holds, each as saved - those not as Meno writes them left out, and said (`left`). */
export function readConversations(v: unknown, left: () => void = () => leftOut("conversation")): Omit<Conversation, "id">[] {
  if (!Array.isArray(v)) return [];
  const out: Omit<Conversation, "id">[] = [];
  for (const raw of v as Record<string, unknown>[]) {
    const rights = rightsOf(raw?.rights);
    const frame = raw && num(raw.x0) && num(raw.y0) && num(raw.x1) && num(raw.y1) && (raw.x1 as number) > (raw.x0 as number) && (raw.y1 as number) > (raw.y0 as number);
    if (!frame || !rights || (raw.connection != null && !(typeof raw.connection === "string" && ID.test(raw.connection)))) {
      left();
      continue;
    }
    // (at most so many: the latest kept)
    const said = (Array.isArray(raw.said) ? raw.said.slice(-MOST_SAID) : []).flatMap((s) => {
      const read = saidOf(s);
      if (!read) leftOut("conversationSaid");
      return read ? [read] : [];
    });
    const sent = (Array.isArray(raw.sent) ? raw.sent.slice(-MOST_SAID) : []).flatMap((s) => sentOf(s) ?? []);
    // (a frame always holds its card: one a file gave smaller is made as large as the card needs)
    const { x0, y0, x1, y1 } = framedForCard({ x0: raw.x0 as number, y0: raw.y0 as number, x1: raw.x1 as number, y1: raw.y1 as number });
    out.push({
      x0,
      y0,
      x1,
      y1,
      ...(raw.wholePage === true ? { wholePage: true as const } : {}),
      // (where its card was left scrolled up: any other is not read, the card then at its latest)
      ...(num(raw.scroll) && (raw.scroll as number) >= 0 ? { scroll: raw.scroll as number } : {}),
      rights,
      ...(raw.connection ? { connection: raw.connection as string } : {}),
      said,
      sent,
    });
  }
  return out;
}
