import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodedOff, decoderForgotten } from "./reader";

/**
 * A PDF's pictures decoded in a worker (reader `decodedOff`), with the worker stood in for: a fake that answers as told - out of order, with an
 * error, or dying - and the drawing thread's own decode stood in for, to see where each picture was decoded.
 */
type Asked = { id: number; body: Uint8Array };
let workers: FakeWorker[] = [];
class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  asked: Asked[] = [];
  transferred: unknown[][] = [];
  terminated = false;
  constructor() {
    workers.push(this);
  }
  postMessage(m: Asked, transfer: unknown[]) {
    this.asked.push(m);
    this.transferred.push(transfer);
  }
  terminate() {
    this.terminated = true;
  }
  answer(id: number, data: object) {
    this.onmessage?.({ data: { id, ...data } });
  }
}
/** The drawing thread's own decode: a picture named by its first byte, "here". */
const here = vi.fn(async (blob: Blob) => ({ from: "here", first: new Uint8Array(await blob.arrayBuffer())[0] }));
const bitmap = (n: number) => ({ from: "worker", first: n }) as unknown as ImageBitmap;
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  workers = [];
  here.mockClear();
  decoderForgotten();
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("createImageBitmap", here);
});
afterEach(() => vi.unstubAllGlobals());

describe("a PDF's pictures decoded in a worker", () => {
  it("each comes back to the one that asked, answered in any order; the bytes go as a copy, transferred, and the drawing thread decodes none", async () => {
    const [a, b] = [new Uint8Array([1, 9, 9]), new Uint8Array([2, 9, 9])];
    const pa = decodedOff(a);
    const pb = decodedOff(b);
    const w = workers[0];
    expect(workers).toHaveLength(1);
    expect(w.asked.map((x) => x.body[0])).toEqual([1, 2]);
    // (a copy, its buffer transferred: the caller's own bytes untouched)
    expect(w.asked[0].body).not.toBe(a);
    expect(w.transferred[0]).toEqual([w.asked[0].body.buffer]);
    expect(a[0]).toBe(1);
    // (answered the other way round)
    w.answer(w.asked[1].id, { bitmap: bitmap(2) });
    w.answer(w.asked[0].id, { bitmap: bitmap(1) });
    expect(await pa).toEqual(bitmap(1));
    expect(await pb).toEqual(bitmap(2));
    expect(here).not.toHaveBeenCalled();
  });

  it("decodes on the drawing thread, as before, one the worker cannot decode - and goes on with the worker for the next", async () => {
    const p = decodedOff(new Uint8Array([7]));
    const w = workers[0];
    w.answer(w.asked[0].id, { error: "no OffscreenCanvas" });
    expect(await p).toEqual({ from: "here", first: 7 });
    const q = decodedOff(new Uint8Array([8]));
    expect(w.asked).toHaveLength(2);
    w.answer(w.asked[1].id, { bitmap: bitmap(8) });
    expect(await q).toEqual(bitmap(8));
  });

  it("decodes on the drawing thread every picture waiting on a worker that fails, and every one after: a PDF is never left without its pictures", async () => {
    for (const fail of ["onerror", "onmessageerror"] as const) {
      decoderForgotten();
      workers = [];
      here.mockClear();
      const waiting = [decodedOff(new Uint8Array([3])), decodedOff(new Uint8Array([4]))];
      const w = workers[0];
      w[fail]?.();
      expect(w.terminated, fail).toBe(true);
      expect(await Promise.all(waiting), fail).toEqual([
        { from: "here", first: 3 },
        { from: "here", first: 4 },
      ]);
      // (and no worker again)
      expect(await decodedOff(new Uint8Array([5])), fail).toEqual({ from: "here", first: 5 });
      expect(workers, fail).toHaveLength(1);
      // (a late answer of the dead worker changes nothing)
      w.answer(w.asked[0].id, { bitmap: bitmap(3) });
      await flush();
    }
  });

  it("decodes on the drawing thread where the worker cannot be started, or where there are no workers at all", async () => {
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new Error("no module workers");
        }
      },
    );
    expect(await decodedOff(new Uint8Array([6]))).toEqual({ from: "here", first: 6 });
    decoderForgotten();
    vi.stubGlobal("Worker", undefined);
    expect(await decodedOff(new Uint8Array([9]))).toEqual({ from: "here", first: 9 });
  });
});
