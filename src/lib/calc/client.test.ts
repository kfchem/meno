import { describe, expect, it, vi } from "vitest";
import { ReaderClient } from "./client";

/** A worker's two ends, by hand: what the client sent, and a way to answer. */
function fakeWorker() {
  const sent: Record<string, unknown>[] = [];
  let hear: (line: string) => void = () => {};
  const transport = {
    send: (line: string) => void sent.push(JSON.parse(line)),
    listen: (f: (line: string) => void) => {
      hear = f;
      return () => (hear = () => {});
    },
  };
  return { sent, transport, say: (m: unknown) => hear(typeof m === "string" ? m : JSON.stringify(m)) };
}

describe("a reader's worker, asked", () => {
  it("is ready when it says so, with its version", async () => {
    const w = fakeWorker();
    const client = new ReaderClient("cclib", w.transport);
    w.say("a line cclib printed on its way in");
    w.say({ event: "ready", reader: "cclib", version: "1.9rc1" });
    expect(await client.ready).toBe("1.9rc1");
  });

  it("is sent a file's kind, name and text, and answers with what it read", async () => {
    const w = fakeWorker();
    const client = new ReaderClient("cclib", w.transport);
    const reading = client.read("orca", "job.out", "the text");
    expect(w.sent).toEqual([{ id: 1, op: "read", kind: "orca", name: "job.out", text: "the text" }]);
    w.say({ id: 1, ok: true, result: { atoms: ["H", "H"], frames: [[0, 0, 0, 0, 0, 0.74]] } });
    expect(await reading).toEqual({ atoms: ["H", "H"], frames: [[0, 0, 0, 0, 0, 0.74]] });
  });

  it("is given, to write a file, its kind, its name, the molecules and the options chosen, and answers with its text", async () => {
    const w = fakeWorker();
    const client = new ReaderClient("Gaussian input", w.transport);
    const molecule = { name: "water", atoms: [{ el: "O", x: 0, y: 0, z: 0 }], bonds: [] };
    const writing = client.write("gaussian-input", "water.gjf", [molecule], { job: "sp" });
    expect(w.sent).toEqual([{ id: 1, op: "write", kind: "gaussian-input", name: "water.gjf", molecules: [molecule], options: { job: "sp" } }]);
    w.say({ id: 1, ok: true, result: { text: "# SP\n" } });
    expect(await writing).toBe("# SP\n");
    // (an answer that holds no text is no file)
    const empty = client.write("gaussian-input", "x.gjf", [molecule], {});
    w.say({ id: 2, ok: true, result: {} });
    await expect(empty).rejects.toThrow(/Gaussian input wrote nothing for x.gjf/);
    const refused = client.write("gaussian-input", "y.gjf", [molecule], {});
    w.say({ id: 3, ok: false, error: "The Gaussian input could not be written: no atoms." });
    await expect(refused).rejects.toThrow(/no atoms/);
  });

  it("says why, when it cannot read a file, or stops before it has", async () => {
    const w = fakeWorker();
    const client = new ReaderClient("cclib", w.transport);
    const bad = client.read("orca", "x.out", "nothing");
    w.say({ id: 1, ok: false, error: "No molecule was found in x.out." });
    await expect(bad).rejects.toThrow("No molecule was found in x.out.");
    const waiting = client.read("orca", "y.out", "text");
    client.close();
    await expect(waiting).rejects.toThrow("the cclib reader stopped");
  });

  it("gives up on what takes too long", async () => {
    const w = fakeWorker();
    const client = new ReaderClient("cclib", w.transport, 10);
    await expect(client.read("orca", "big.out", "text")).rejects.toThrow("cclib did not finish reading big.out in time");
  });

  it("is asked whether a file is of a kind it tells itself, and is taken at its word only where it says yes", async () => {
    const w = fakeWorker();
    const client = new ReaderClient("nbo", w.transport);
    const asked = client.probe("nbo-out", "job.47", "the start");
    expect(w.sent).toEqual([{ id: 1, op: "probe", kind: "nbo-out", name: "job.47", head: "the start" }]);
    w.say({ id: 1, ok: true, result: { yes: true } });
    expect(await asked).toBe(true);
    const maybe = client.probe("nbo-out", "x.47", "else");
    w.say({ id: 2, ok: true, result: { yes: "perhaps" } });
    expect(await maybe).toBe(false);
  });

  it("tells its worker's queue what it asks, what is answered and what it gives up on", async () => {
    vi.useFakeTimers();
    try {
      const w = fakeWorker();
      const heard: string[] = [];
      const watch = { sent: (id: number) => heard.push(`sent ${id}`), settled: (id: number) => heard.push(`settled ${id}`), overdue: (id: number) => heard.push(`overdue ${id}`) };
      const client = new ReaderClient("cclib", w.transport, 1000, undefined, watch);
      const read = client.read("orca-output", "a.out", "text");
      w.say({ id: w.sent[0].id, ok: true, result: { molecules: [] } });
      await read.catch(() => undefined);
      const late = client.read("orca-output", "b.out", "text").catch((e: Error) => e.message);
      vi.advanceTimersByTime(1001);
      expect(await late).toMatch(/did not finish reading b\.out in time/);
      const [a, b] = w.sent.map((m) => m.id);
      expect(heard).toEqual([`sent ${a}`, `settled ${a}`, `sent ${b}`, `overdue ${b}`]);
    } finally {
      vi.useRealTimers();
    }
  });
});
