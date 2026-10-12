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

  it("fails a request RDKit could not answer, saying why", async () => {
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
      w.say({ id: 1, ok: true, result: { rdkit: "x" } });
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
      const c = new ChemClient(w.transport, 1000, "RDKit", undefined, watch);
      const answered = c.request("to_smiles", { molblock: "A" });
      w.say({ id: w.sent[0].id, ok: true, result: { smiles: "C" } });
      await answered;
      const late = c.request("from_smiles", { smiles: "CC" }).catch((e: Error) => e.message);
      vi.advanceTimersByTime(1001);
      expect(await late).toMatch(/did not answer from_smiles in time/);
      const waiting = c.request("to_smiles", { molblock: "B" }).catch((e: Error) => e.message);
      c.close("RDKit was started again");
      expect(await waiting).toBe("RDKit was started again");
      const [a, b, d] = w.sent.map((m) => m.id);
      expect(heard).toEqual([`sent ${a}`, `settled ${a}`, `sent ${b}`, `overdue ${b}`, `sent ${d}`, `settled ${d}`]);
    } finally {
      vi.useRealTimers();
    }
  });
});
