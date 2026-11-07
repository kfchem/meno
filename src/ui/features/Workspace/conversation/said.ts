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


/** A thing on the page by its id ("structure:3"), as the exchange says it: "a structure". */
const thingSaid = (id: unknown) => (typeof id === "string" ? (READ_KIND[id.split(":")[0]] ?? "a thing") : "a thing");

/** A count of things, in words: "one atom", "3 atoms". */
const counted = (n: number, one: string, many = `${one}s`) => (n === 1 ? `one ${one}` : `${n} ${many}`);

/** The fields of what is read that a reader is told, by what each is called in words: any other is the model's alone, never shown. */
const FIELD_WORDS: Record<string, string> = { formula: "Formula", name: "Name", stereo: "Stereo", kind: "Kind", by: "By", ran: "Ran" };

/** What one field of what was read says, in words: none where it says nothing a reader takes, or is not one a reader is told. */
function fieldSaid(key: string, v: unknown): string | null {
  if (v == null || v === "") return null;
  switch (key) {
    case "atoms":
      return Array.isArray(v) ? counted(v.length, "atom") : typeof v === "string" ? v : null;
    case "bonds":
      return Array.isArray(v) ? counted(v.length, "bond") : null;
    case "smiles":
      return `SMILES ${String(v)}`;
    case "frames":
      return Number(v) > 1 ? counted(Number(v), "frame") : null;
    case "text":
      return String(v).length > 200 ? `${String(v).slice(0, 200)}…` : String(v);
    case "running":
      return v === true ? "Running" : null;
    case "energies": {
      const o = v as { values?: unknown; unit?: unknown };
      return Array.isArray(o.values) ? `${counted(o.values.length, "energy", "energies")}, in ${String(o.unit ?? "")}`.trim() : null;
    }
    case "inScope": {
      const o = v as Record<string, unknown>;
      return `In the frame: ${counted(Number(o.structures) || 0, "structure")}, ${counted(Number(o.molecules) || 0, "molecule")}, ${counted(Number(o.pictures) || 0, "picture")}`;
    }
    case "options": {
      const parts = Object.entries(v as Record<string, unknown>).filter(([, x]) => x != null && typeof x !== "object").map(([k, x]) => `${k} ${String(x)}`);
      return parts.length ? `Options: ${parts.join(", ")}` : null;
    }
    default:
      return FIELD_WORDS[key] && typeof v !== "object" ? `${FIELD_WORDS[key]}: ${String(v)}` : null;
  }
}

/**
 * What a call found, as the exchange shows it unfolded: in Meno's words, a
 * row each - each thing listed by what it is, what was read field by field,
 * what was found by what it is - never the call as it went to the model
 * (that is copied, as JSON, on asking). None where there is nothing more
 * to say than its line.
 */
export function foundRows(s: Extract<Said, { by: "tool" }> | undefined): string[] {
  if (!s?.ok) return [];
  const a = s.answer;
  if (typeof a === "string") return a ? [a] : [];
  if (!a || typeof a !== "object" || Array.isArray(a)) return [];
  const o = a as Record<string, unknown>;
  if (Array.isArray(o.things)) {
    const rows = o.things.map((t) => (t && typeof (t as { line?: unknown }).line === "string" ? (t as { line: string }).line : thingSaid((t as { id?: unknown } | null)?.id)));
    return typeof o.more === "number" && o.more > 0 ? [...rows, `and ${o.more} more`] : rows;
  }
  if (Array.isArray(o.found)) {
    // (what was found, by what it is, counted: "2 structures")
    const byKind = new Map<string, number>();
    for (const id of o.found) byKind.set(thingSaid(id).replace(/^an? /, ""), (byKind.get(thingSaid(id).replace(/^an? /, "")) ?? 0) + 1);
    const rows = [...byKind].map(([noun, n]) => `${n === 1 ? "One" : n} ${n === 1 ? noun : `${noun}s`} found`);
    if (Array.isArray(o.couldNotTell) && o.couldNotTell.length) rows.push(`Could not tell for ${counted(o.couldNotTell.length, "structure")}`);
    if (typeof o.notLookedAt === "number" && o.notLookedAt > 0) rows.push(`${counted(o.notLookedAt, "thing")} not looked at`);
    return rows;
  }
  return Object.entries(o).flatMap(([k, v]) => {
    const said = fieldSaid(k, v);
    return said ? [said] : [];
  });
}

/** A call and what came of it, as JSON - as it went to the model and came back: copied on asking, never shown. */
export function callJson(call: ToolCall, answer?: Extract<Said, { by: "tool" }>): string {
  return JSON.stringify({ call: { tool: call.tool, ...(call.args ? { args: call.args } : {}) }, ...(answer ? { answer: { ok: answer.ok, answer: answer.answer } } : {}) }, null, 2);
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
