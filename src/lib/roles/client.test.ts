import { describe, expect, it, vi } from "vitest";
import { ChemClient, ChemError, type ChemTransport } from "./client";

/** A worker played by the test: what was sent, and a way to answer. */
function fakeWorker() {
  const sent: Record<string, unknown>[] = [];
  let hear: ((line: string) => void) | undefined;
  let stopped = false;
  const transport: ChemTransport = {
    send: (line) => sent.push(JSON.parse(line)),
    listen: (f) => {
      hear = f;
      return () => {
        stopped = true;
      };
    },
  };
  return {
    transport,
    sent,
    say: (m: unknown) => hear?.(typeof m === "string" ? m : JSON.stringify(m)),
    stopped: () => stopped,
  };
}

describe("the chemistry client", () => {
  it("is ready when the worker says so, with its plugin's version", async () => {
    const w = fakeWorker();
    const c = new ChemClient(w.transport);
    w.say("the plugin's library says something of its own"); // not an answer: ignored
    w.say({ event: "ready", version: "2026.03.6" });
    await expect(c.ready).resolves.toBe("2026.03.6");
    expect(c.version).toBe("2026.03.6");
  });

  it("matches each answer to its question, whatever the order", async () => {
    const w = fakeWorker();
    const c = new ChemClient(w.transport);
    const a = c.request("to_smiles", { molblock: "A" });
    const b = c.request("from_smiles", { smiles: "CCO" });
    expect(w.sent).toEqual([
      { id: 1, op: "to_smiles", molblock: "A" },
      { id: 2, op: "from_smiles", smiles: "CCO" },
    ]);
    w.say({ id: 2, ok: true, result: { molblock: "B" } });
    w.say({ id: 1, ok: true, result: { smiles: "C" } });
    await expect(a).resolves.toEqual({ smiles: "C" });
    await expect(b).resolves.toEqual({ molblock: "B" });
  });

  it("fails a request Sketchkit could not answer, saying why", async () => {
    const w = fakeWorker();
    const c = new ChemClient(w.transport);
    const r = c.request("from_smiles", { smiles: "C1CC" });
    w.say({ id: 1, ok: false, error: "This SMILES could not be read." });
    await expect(r).rejects.toThrow(ChemError);
    await expect(r).rejects.toThrow("This SMILES could not be read.");
  });

  it("gives up on an answer that does not come", async () => {
    vi.useFakeTimers();
    try {
      const w = fakeWorker();
      const c = new ChemClient(w.transport, 1000);
      const r = c.request("to_smiles", { molblock: "A" });
      const caught = r.catch((e: Error) => e.message);
      vi.advanceTimersByTime(1001);
      await expect(caught).resolves.toMatch(/did not answer to_smiles in time/);
      // a late answer is ignored
      w.say({ id: 1, ok: true, result: { sketchkit: "x" } });
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails whatever is waiting when it closes, and stops listening", async () => {
    const w = fakeWorker();
    const c = new ChemClient(w.transport);
    const r = c.request("analyse", { molblock: "A" });
    c.close("the chemistry worker stopped");
    await expect(r).rejects.toThrow("the chemistry worker stopped");
    expect(w.stopped()).toBe(true);
  });

  it("tells its worker's queue what it asks, what is answered, what it gives up on, and what it lets go of", async () => {
    vi.useFakeTimers();
    try {
      const w = fakeWorker();
      const heard: string[] = [];
      const watch = { sent: (id: number) => heard.push(`sent ${id}`), settled: (id: number) => heard.push(`settled ${id}`), overdue: (id: number) => heard.push(`overdue ${id}`) };
      const c = new ChemClient(w.transport, 1000, "Sketchkit", undefined, watch);
      const answered = c.request("to_smiles", { molblock: "A" });
      w.say({ id: w.sent[0].id, ok: true, result: { smiles: "C" } });
      await answered;
      const late = c.request("from_smiles", { smiles: "CC" }).catch((e: Error) => e.message);
      vi.advanceTimersByTime(1001);
      expect(await late).toMatch(/did not answer from_smiles in time/);
      const waiting = c.request("to_smiles", { molblock: "B" }).catch((e: Error) => e.message);
      c.close("Sketchkit was started again");
      expect(await waiting).toBe("Sketchkit was started again");
      const [a, b, d] = w.sent.map((m) => m.id);
      expect(heard).toEqual([`sent ${a}`, `settled ${a}`, `sent ${b}`, `overdue ${b}`, `sent ${d}`, `settled ${d}`]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("hears an answer's parts as they come, where asked to: the request still open, and waited for again from each", async () => {
    vi.useFakeTimers();
    try {
      const w = fakeWorker();
      const c = new ChemClient(w.transport, 1000);
      const parts: string[] = [];
      const r = c.request("converse", { told: "", said: [], tools: [], options: {}, stream: true }, 1000, (t) => parts.push(t));
      let settled = false;
      void r.then(() => (settled = true), () => (settled = true));
      // (each part heard; the answer then waited for 1000 ms from it: 900 + 900 ms passes, no time out)
      vi.advanceTimersByTime(900);
      w.say({ id: 1, partial: "Ethanol " });
      vi.advanceTimersByTime(900);
      w.say({ id: 1, partial: "boils at 78 C." });
      vi.advanceTimersByTime(900);
      // (an empty part: nothing said, the reply still coming - waited for again)
      w.say({ id: 1, partial: "" });
      vi.advanceTimersByTime(900);
      await Promise.resolve();
      expect([parts, settled]).toEqual([["Ethanol ", "boils at 78 C.", ""], false]);
      w.say({ id: 1, ok: true, result: { text: "Ethanol boils at 78 C." } });
      await expect(r).resolves.toEqual({ text: "Ethanol boils at 78 C." });
    } finally {
      vi.useRealTimers();
    }
  });

  it("ends nothing on a part of an answer it did not ask to hear, nor on one that is not words", async () => {
    vi.useFakeTimers();
    try {
      const w = fakeWorker();
      const c = new ChemClient(w.transport, 1000);
      const r = c.request("to_smiles", { molblock: "A" });
      const caught = r.catch((e: Error) => e.message);
      w.say({ id: 1, partial: "C" });
      w.say({ id: 1, partial: 7 });
      w.say({ id: 1, ok: true, result: { smiles: "CC" } });
      await expect(r).resolves.toEqual({ smiles: "CC" });
      // (and, asked to hear, a part that is no words is passed over, its wait not begun again)
      const parts: string[] = [];
      const late = c.request("converse", { told: "", said: [], tools: [], options: {} }, 1000, (t) => parts.push(t)).catch((e: Error) => e.message);
      vi.advanceTimersByTime(900);
      w.say({ id: 2, partial: { text: "x" } });
      vi.advanceTimersByTime(101);
      expect(await late).toMatch(/did not answer converse in time/);
      expect(parts).toEqual([]);
      void caught;
    } finally {
      vi.useRealTimers();
    }
  });

  it("is not hurt by what hears a part failing: the parts after it are heard, and the answer settles it", async () => {
    const w = fakeWorker();
    const c = new ChemClient(w.transport, 1000);
    const parts: string[] = [];
    const r = c.request("converse", { told: "", said: [], tools: [], options: {}, stream: true }, 1000, (t) => {
      parts.push(t);
      if (t === "boom") throw new Error("the view failed");
    });
    expect(() => w.say({ id: 1, partial: "boom" })).not.toThrow();
    w.say({ id: 1, partial: "after" });
    w.say({ id: 1, ok: true, result: { text: "boomafter" } });
    await expect(r).resolves.toEqual({ text: "boomafter" });
    expect(parts).toEqual(["boom", "after"]);
  });
});
