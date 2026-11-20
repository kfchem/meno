// Held beside client.test.ts: a line that carries `ok` is the answer even when it carries a `partial` too, and a request handed to a replacement client still hears the parts of its answer.
import { describe, expect, it, vi } from "vitest";
import { ChemClient, type ChemTransport } from "./client";

function fakeWorker() {
  const sent: Record<string, unknown>[] = [];
  let hear: ((line: string) => void) | undefined;
  const transport: ChemTransport = {
    send: (line) => sent.push(JSON.parse(line)),
    listen: (f) => {
      hear = f;
      return () => {};
    },
  };
  return { transport, sent, say: (m: unknown) => hear?.(JSON.stringify(m)) };
}
const ask = { told: "", said: [], tools: [], options: {}, stream: true };

describe("the parts of an answer", () => {
  it("are no answer, and a line with ok is, whatever else it carries", async () => {
    const w = fakeWorker();
    const c = new ChemClient(w.transport, 1000);
    const parts: string[] = [];
    const r = c.request("converse", ask, 1000, (t) => parts.push(t));
    w.say({ id: 1, ok: true, partial: "not words", result: { text: "whole" } });
    await expect(r).resolves.toEqual({ text: "whole" });
    expect(parts).toEqual([]);
  });

  it("are heard by a request handed over to the client that takes its place, as by the one it was asked of", async () => {
    const old = fakeWorker();
    const fresh = fakeWorker();
    const c = new ChemClient(old.transport, 1000);
    c.handOver(async () => new ChemClient(fresh.transport, 1000));
    c.close("its worker was stopped unused");
    const parts: string[] = [];
    const r = c.request("converse", ask, 1000, (t) => parts.push(t));
    await vi.waitFor(() => expect(fresh.sent).toHaveLength(1));
    fresh.say({ id: 1, partial: "Methanol " });
    fresh.say({ id: 1, ok: true, result: { text: "Methanol" } });
    await expect(r).resolves.toEqual({ text: "Methanol" });
    expect(parts).toEqual(["Methanol "]);
  });
});
