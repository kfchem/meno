/** What a conversation's tool calls did, as the exchange says it (ConversationBody): what it is on the page, never how Meno does it. */
import type { Said, ToolCall } from "./types";

/** What a tool call did, said as what it is on the page - never how Meno does it: its call itself folded below. */
export function callSaid(c: ToolCall): string {
  const a = c.args ?? {};
  const text = (k: string) => (typeof a[k] === "string" ? (a[k] as string).slice(0, 80) : "");
  switch (c.tool) {
    case "list":
      return "Listed what lies in the frame";
    case "read":
      return `Read ${READ_KIND[text("id").split(":")[0]] ?? "a thing"} in the frame`;
    case "search":
      return a.how === "holds" ? `Looked for structures holding ${text("smiles")}` : `Looked for ${text("smiles")}`;
    case "put_structure":
      return `Put down ${text("smiles")}`;
    case "put_arrow":
      return "Put down an arrow";
    case "put_plus":
      return 'Put down a "+"';
    case "put_text":
      return `Put down a text${text("name") ? `, ${text("name")}` : ""}`;
    case "add_step":
      return `Added a step${text("kind") ? `: ${text("kind")}` : ""}`;
    case "wire":
      return "Wired a set to a step";
    case "set_options":
      return "Set a step's options";
    default:
      return "Asked for something Meno does not do";
  }
}

export const READ_KIND: Record<string, string> = { structure: "a structure", molecule: "a molecule", picture: "a picture", text: "a text", pdf: "a PDF", arrow: "an arrow", plus: 'a "+"', caption: "words", set: "a set", step: "a step" };


/** How a tool's answer is shown in the exchange: what came of it, in a line - its data folded below. */
export function answerLine(s: Extract<Said, { by: "tool" }>): string {
  if (!s.ok) return typeof s.answer === "string" ? s.answer : "Refused";
  const a = s.answer as Record<string, unknown> | null;
  if (s.tool === "list" && a && Array.isArray(a.things)) return `${a.things.length === 1 ? "One thing" : `${a.things.length} things`} in the frame`;
  if (s.tool === "search" && a && Array.isArray(a.found)) return a.found.length === 1 ? "One found" : `${a.found.length} found`;
  return "Done";
}


/** A row of the exchange: a thing said, or a call the model made with the answer it had - one line each. */
export type ExchangeRow = { kind: "said"; said: Said } | { kind: "call"; call: ToolCall; answer?: Extract<Said, { by: "tool" }> };

/**
 * What was said, as the exchange shows it: the model's words, then each
 * call it made paired with its answer - the answers come after its calls,
 * in their order - and the rest as it was said.
 */
export function exchangeRows(said: readonly Said[]): ExchangeRow[] {
  const rows: ExchangeRow[] = [];
  for (let k = 0; k < said.length; k++) {
    const s = said[k];
    if (s.by === "tool") {
      rows.push({ kind: "said", said: s });
      continue;
    }
    if (s.by !== "model") {
      rows.push({ kind: "said", said: s });
      continue;
    }
    if (s.text) rows.push({ kind: "said", said: s });
    for (const call of s.calls ?? []) {
      const next = said[k + 1];
      if (next?.by === "tool") {
        rows.push({ kind: "call", call, answer: next });
        k++;
      } else rows.push({ kind: "call", call });
    }
  }
  return rows;
}
