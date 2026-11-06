import { describe, expect, it, vi } from "vitest";
import type { PythonPlugin } from "../../../../lib/calc/catalog";
import type { PluginWorker } from "../../../../lib/plugins/process";
import { consentOf, modelConnection, NOT_READ, REPLY_MS, replyOf, type ModelSteps } from "./modelConnection";

const plugin = { id: "talker", name: "Talker", roleHosts: { "language-model": ["api.example.com", "files.example.com"] }, roleOptions: {} } as unknown as PythonPlugin;

const request = { told: "Meno's words", said: [{ by: "person" as const, text: "What is this?", at: 1 }], tools: [{ name: "look", does: "looks at the page" }] };

/** Meno's steps as the test has them: whether the person says yes, whether it was allowed before, the worker's answer - and what was done. */
function steps(o: { yes?: boolean; before?: boolean; running?: boolean; answer?: unknown } = {}) {
  const done: string[] = [];
  const conversed: unknown[] = [];
  const worker = {
    chem: {
      request: vi.fn(async (op: string, args: unknown, ms: number) => {
        done.push(`ask ${op} ${ms}`);
        conversed.push(args);
        return o.answer ?? { text: "It is ethanol." };
      }),
    },
  } as unknown as PluginWorker;
  const s: ModelSteps = {
    ask: async (r) => {
      done.push(`consent ${r.purpose}`);
      return o.yes ?? true;
    },
    allowed: () => o.before ?? false,
    worker: async () => {
      done.push("worker");
      return worker;
    },
    running: () => o.running ?? false,
    stop: async (p) => void done.push(`stop ${p}`),
    options: () => ({ model: "small" }),
  };
  return { s, done, conversed };
}

describe("a conversation's connection through a model's plugin", () => {
  it("asks first whether it may go to the plugin's hosts, saying what goes there", () => {
    expect(consentOf(plugin)).toEqual({
      purpose: "model:talker@api.example.com,files.example.com",
      title: "Send this conversation to api.example.com and files.example.com, for Talker?",
      detail: "What is said in it, and what it is given, goes there.",
      sources: ["Talker: api.example.com, files.example.com"],
      hosts: ["api.example.com", "files.example.com"],
    });
    const c = modelConnection(plugin, steps().s);
    expect([c.id, c.to]).toEqual(["talker", "api.example.com, files.example.com"]);
  });

  it("sends the request as converse - no key of the page's in it - with the plugin's options, and reads the answer", async () => {
    const t = steps({ before: true });
    expect(await modelConnection(plugin, t.s).send(request)).toEqual({ text: "It is ethanol." });
    expect(t.done).toEqual(["consent model:talker@api.example.com,files.example.com", "worker", `ask converse ${REPLY_MS}`]);
    expect(t.conversed).toEqual([{ ...request, options: { model: "small" } }]);
    expect(JSON.stringify(t.conversed)).not.toContain("key");
  });

  it("sends nothing on a no: the worker never asked", async () => {
    const t = steps({ yes: false });
    await expect(modelConnection(plugin, t.s).send(request)).rejects.toThrow("Nothing was sent: sending to api.example.com and files.example.com was not allowed.");
    expect(t.done).toEqual(["consent model:talker@api.example.com,files.example.com"]);
  });

  it("starts again a worker begun before it was allowed - it went out nowhere - and only then", async () => {
    const first = steps({ before: false, running: true });
    await modelConnection(plugin, first.s).send(request);
    expect(first.done).toEqual(["consent model:talker@api.example.com,files.example.com", "stop talker", "worker", `ask converse ${REPLY_MS}`]);
    const later = steps({ before: true, running: true });
    await modelConnection(plugin, later.s).send(request);
    expect(later.done).not.toContain("stop talker");
  });

  it("asks again once the plugin names other hosts: a yes is for the hosts it was given for", async () => {
    // (as askToConnect asks: only where the purpose is not allowed already - and a yes allows it)
    const asked: string[] = [];
    const allowed = new Set<string>();
    const s: ModelSteps = {
      ...steps().s,
      ask: async (r) => {
        if (!allowed.has(r.purpose)) {
          asked.push(r.title);
          allowed.add(r.purpose);
        }
        return true;
      },
      allowed: (purpose) => allowed.has(purpose),
    };
    await modelConnection(plugin, s).send(request);
    await modelConnection(plugin, s).send(request);
    // (the same hosts in another order: the same yes)
    const reordered = { ...plugin, roleHosts: { "language-model": ["files.example.com", "api.example.com"] } } as unknown as PythonPlugin;
    await modelConnection(reordered, s).send(request);
    expect(asked).toEqual(["Send this conversation to api.example.com and files.example.com, for Talker?"]);
    // (updated: its manifest names another host - asked again, by the hosts it names now)
    const updated = { ...plugin, roleHosts: { "language-model": ["api.example.com", "other.example.net"] } } as unknown as PythonPlugin;
    await modelConnection(updated, s).send(request);
    expect(asked).toEqual(["Send this conversation to api.example.com and files.example.com, for Talker?", "Send this conversation to api.example.com and other.example.net, for Talker?"]);
    expect([...allowed]).toEqual(["model:talker@api.example.com,files.example.com", "model:talker@api.example.com,other.example.net"]);
  });

  it("refuses an answer it does not read", async () => {
    await expect(modelConnection(plugin, steps({ before: true, answer: { words: "hi" } }).s).send(request)).rejects.toThrow(NOT_READ);
  });
});

describe("a model's plugin's answer, read strictly", () => {
  it("takes its words as they are - HTML or a picture's markdown left as text - and its calls, each with its arguments as an object", () => {
    expect(replyOf({ text: "<img src=x onerror=alert(1)> ![a](http://x/y.png)" })).toEqual({ text: "<img src=x onerror=alert(1)> ![a](http://x/y.png)" });
    expect(replyOf({ text: "", calls: [{ tool: "look" }, { tool: "add", args: { smiles: "CCO" } }] })).toEqual({ text: "", calls: [{ tool: "look" }, { tool: "add", args: { smiles: "CCO" } }] });
    expect(replyOf({ text: "ok", calls: [] })).toEqual({ text: "ok" });
    // (what its plugin keeps of the reply: taken as it is - opaque to Meno - within its bound)
    const keep = { content: [{ type: "thinking", thinking: "", signature: "abc" }, { type: "text", text: "ok" }] };
    expect(replyOf({ text: "ok", keep })).toEqual({ text: "ok", keep });
    expect(replyOf({ text: "", calls: [{ tool: "look" }], keep })).toEqual({ text: "", calls: [{ tool: "look" }], keep });
    expect(() => replyOf({ text: "ok", keep: "x".repeat(2_000_001) })).toThrow(NOT_READ);
  });

  it("refuses anything else, never guessing at it", () => {
    for (const bad of [null, "text", [], {}, { text: 3 }, { text: "x".repeat(1_000_001) }, { text: "", calls: {} }, { text: "", calls: [{}] }, { text: "", calls: [{ tool: "" }] }, { text: "", calls: [{ tool: "a", args: [] }] }, { text: "", calls: [{ tool: "a", args: "x" }] }, { text: "", calls: Array.from({ length: 65 }, () => ({ tool: "a" })) }])
      expect(() => replyOf(bad), JSON.stringify(bad)?.slice(0, 60)).toThrow(NOT_READ);
  });
});
