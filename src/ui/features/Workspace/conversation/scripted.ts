/**
 * A scripted test model (docs/CONVERSATIONS.md, *Tests*): a connection that
 * plays back replies written beforehand - its words and the tools it calls
 * - and keeps every request it was sent, for a test to look at. For tests
 * alone: never offered, and it sends nothing anywhere.
 */
import type { Connection, ModelReply, ModelRequest } from "./turn";

export type Scripted = Connection & { asked: ModelRequest[] };

/** A connection that answers each request with the next of `replies` - or, given a function, what it gives for the request and its number. */
export function scriptedModel(replies: readonly ModelReply[] | ((request: ModelRequest, n: number) => ModelReply), id = "scripted-test-model"): Scripted {
  const asked: ModelRequest[] = [];
  return {
    id,
    to: "a scripted test model, on this computer",
    asked,
    send: async (request) => {
      asked.push(request);
      const n = asked.length - 1;
      const reply = typeof replies === "function" ? replies(request, n) : replies[n];
      return reply ?? { text: "" };
    },
  };
}
