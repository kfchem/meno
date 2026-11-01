import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChemClient, type ChemTransport } from "../../../../lib/roles/client";
import type { Watch } from "../../../../lib/calc/client";

// (in the app, with a picture's bytes and the worker of the plugin that reads pictures played by the test)
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: () => Promise.reject(new Error("no app in tests")) }));
vi.mock("./pictures", () => ({ picturePng: () => Promise.resolve(new Uint8Array([137, 80, 78, 71])), pngPixels: () => Promise.resolve({ width: 1, height: 1, data: [255, 255, 255, 255] }) }));
const worker = vi.hoisted(() => ({ current: null as ChemClient | null }));
vi.mock("../../../../lib/roles/worker", () => ({ chemWorker: () => Promise.resolve(worker.current), rolePlugin: () => undefined }));

import { FIRST_READ_MS, READ_MS, readPicture } from "./figures";

/** A worker played by the test: what it was asked, a way to answer, and what its queue heard given up on. */
function fakeWorker() {
  const sent: { id: number; op: string }[] = [];
  const overdue: number[] = [];
  let hear: ((line: string) => void) | undefined;
  const transport: ChemTransport = {
    send: (line) => sent.push(JSON.parse(line)),
    listen: (f) => {
      hear = f;
      return () => {};
    },
  };
  const watch: Watch = { sent: () => {}, settled: () => {}, overdue: (id) => overdue.push(id) };
  const chem = new ChemClient(transport, undefined, "Pictures", undefined, watch);
  hear?.(JSON.stringify({ event: "ready", version: "1" }));
  const answer = () => hear?.(JSON.stringify({ id: sent[sent.length - 1].id, ok: true, result: { atoms: [], bonds: [] } }));
  return { chem, sent, overdue, answer };
}

const PICTURE = { sha256: "b".repeat(64), media: "image/png" } as const;
/** What a picture read comes to: why nothing was read, or "read". */
const outcome = (r: Promise<{ none: string } | object>) => r.then((x) => ("none" in x ? (x as { none: string }).none : "read"));

describe("a picture read by its plugin", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("gives the first picture a worker reads time to load the plugin's model", async () => {
    const w = fakeWorker();
    worker.current = w.chem;
    const read = outcome(readPicture(PICTURE));
    await vi.advanceTimersByTimeAsync(READ_MS + 1000);
    expect(w.overdue).toEqual([]);
    w.answer();
    expect(await read).toBe("No structure was found in the picture.");
  });

  it("gives up on a later picture that takes far longer than a picture is read in, saying so, and lets its worker be started afresh", async () => {
    const w = fakeWorker();
    worker.current = w.chem;
    const first = outcome(readPicture(PICTURE));
    await vi.advanceTimersByTimeAsync(0);
    w.answer();
    await first;
    const later = outcome(readPicture(PICTURE));
    await vi.advanceTimersByTimeAsync(READ_MS + 1);
    expect(await later).toBe("Reading the picture took too long, so nothing was read from it.");
    // (the question its worker was held on given up: the worker stopped, to be started afresh when next asked - lib/plugins/queue)
    expect(w.overdue).toEqual([w.sent[1].id]);
    expect(READ_MS).toBeLessThan(FIRST_READ_MS / 2);
  });

  it("gives a worker started afresh the time to load the model again", async () => {
    const before = fakeWorker();
    worker.current = before.chem;
    const first = outcome(readPicture(PICTURE));
    await vi.advanceTimersByTimeAsync(0);
    before.answer();
    await first;
    const fresh = fakeWorker();
    worker.current = fresh.chem;
    const read = outcome(readPicture(PICTURE));
    await vi.advanceTimersByTimeAsync(READ_MS + 1000);
    expect(fresh.overdue).toEqual([]);
    fresh.answer();
    expect(await read).toBe("No structure was found in the picture.");
  });
});
