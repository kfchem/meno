import { afterEach, describe, expect, it, vi } from "vitest";
import { figureReadOff } from "./structuresOff";
import type { FigureJob } from "./structuresRead";

/** A worker played here: which it is, and what it was given - answering when told to. */
const made: FakeWorker[] = [];
class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  posted: { message: { id: number; job: FigureJob }; transfer: Transferable[] }[] = [];
  constructor(public url: URL) {
    made.push(this);
  }
  postMessage(message: { id: number; job: FigureJob }, transfer: Transferable[] = []) {
    this.posted.push({ message, transfer });
  }
  answer(i: number, read: unknown) {
    this.onmessage?.({ data: { id: this.posted[i].message.id, ok: true, read } } as MessageEvent);
  }
}

const job = (): FigureJob => ({ objects: [], text: null, figures: [[0, 0, 10, 10]], k: 0, drawn: new TextEncoder().encode('{"paths":[],"letters":[],"pictures":[]}').buffer as ArrayBuffer, sha256: "a", page: 0 });

describe("a figure's structures read off the drawing's thread", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("goes to a worker - the pointer's figure to one of its own, those read ahead to another - with its bytes handed over, not copied", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const urgent = figureReadOff(job(), true);
    const ahead = figureReadOff(job(), false);
    const more = figureReadOff(job(), false);
    // (two workers, started when first wanted: the reads ahead go one after another to the second)
    expect(made).toHaveLength(2);
    const [now, later] = made;
    expect(now.posted).toHaveLength(1);
    expect(later.posted).toHaveLength(2);
    for (const w of made) for (const p of w.posted) expect(p.transfer).toEqual([p.message.job.drawn]);
    expect(now.url.pathname).toMatch(/structuresWorker\.ts$/);
    now.answer(0, "urgent");
    later.answer(0, "ahead");
    later.answer(1, "more");
    expect(await Promise.all([urgent, ahead, more])).toEqual(["urgent", "ahead", "more"]);
  });

  it("says why where the worker could not read it, and the next is asked of a worker started afresh", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    // (the pointer's worker, kept from before: its next message is its second)
    const urgent = made[0];
    const failed = figureReadOff(job(), true);
    expect(urgent.posted).toHaveLength(2);
    urgent.onerror?.({ message: "gone" } as ErrorEvent);
    await expect(failed).rejects.toThrow("gone");
    const started = made.length;
    const again = figureReadOff(job(), true);
    expect(made).toHaveLength(started + 1);
    made[made.length - 1].answer(0, "fine");
    expect(await again).toBe("fine");
  });

  it("is read here where there are no workers", async () => {
    vi.stubGlobal("Worker", undefined);
    const read = await figureReadOff(job(), true);
    expect(read).toMatchObject({ structures: [], labels: [] });
  });
});
