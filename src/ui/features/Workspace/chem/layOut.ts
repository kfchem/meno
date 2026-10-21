/**
 * A structure laid out by the engine, off the thread the drawing runs on
 * (layoutWorker.ts), the worker started the first time it is asked for and
 * kept. Where there are no workers - tests - it is laid out here.
 */
import { layout2D, type Layout2D, type LayoutInput } from "../../../../lib/layout/engine";
import { laidOutChecked, type LaidOut } from "../../../../lib/layout/many";

type Answer = { id: number; ok: true; layout: Layout2D } | { id: number; ok: false; error: string };

let worker: Worker | null = null;
let asked = 0;
const waiting = new Map<number, { done: (l: Layout2D) => void; fail: (e: Error) => void }>();

function started(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./layoutWorker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<Answer>) => {
    const a = e.data;
    const w8 = waiting.get(a.id);
    if (!w8) return;
    waiting.delete(a.id);
    if (a.ok) w8.done(a.layout);
    else w8.fail(new Error(a.error));
  };
  w.onerror = (e) => {
    // a worker that fails to run fails everything it was asked
    for (const w8 of waiting.values()) w8.fail(new Error(e.message || "the layout worker stopped"));
    waiting.clear();
    worker = null;
  };
  worker = w;
  return w;
}

export function layOut(input: LayoutInput): Promise<Layout2D> {
  if (typeof Worker === "undefined") return Promise.resolve().then(() => layout2D(input));
  return new Promise((done, fail) => {
    const id = ++asked;
    waiting.set(id, { done, fail });
    started().postMessage({ id, input });
  });
}

/** How many structures go to a worker at a time: enough that a message's cost is nothing beside them, few enough that the workers finish together. */
const BATCH = 16;

/** The workers that lay out many at once: as many as the machine's cores but one, at most eight - apart from the one that lays out a drawing, which is never kept waiting behind them. */
let pool: Worker[] | null = null;

function poolStarted(): Worker[] {
  if (pool) return pool;
  const cores = typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
  pool = Array.from({ length: Math.max(1, Math.min(8, cores - 1)) }, () => new Worker(new URL("./layoutWorker.ts", import.meta.url), { type: "module" }));
  return pool;
}

/**
 * Many structures laid out at once, each read back against itself
 * (lib/layout/many `laidOutChecked`): in batches across a pool of workers,
 * each worker taking the next batch as it finishes one. `progress` is told
 * how many are done as each batch comes back. In the order given; one the
 * engine cannot lay out says so in its place, and is never left out.
 */
export function layOutMany(inputs: readonly LayoutInput[], progress?: (done: number) => void): Promise<LaidOut[]> {
  if (typeof Worker === "undefined") {
    return Promise.resolve().then(() => {
      const out = inputs.map(laidOutChecked);
      progress?.(out.length);
      return out;
    });
  }
  const out: LaidOut[] = new Array(inputs.length);
  const batches: [number, number][] = [];
  for (let i = 0; i < inputs.length; i += BATCH) batches.push([i, Math.min(inputs.length, i + BATCH)]);
  let next = 0;
  let done = 0;
  return new Promise((resolve, reject) => {
    if (!batches.length) return resolve(out);
    const workers = poolStarted();
    let running = 0;
    let failed = false;
    const give = (w: Worker) => {
      if (failed) return;
      if (next >= batches.length) {
        if (--running === 0) resolve(out);
        return;
      }
      const [from, to] = batches[next++];
      const id = ++asked;
      const onMessage = (e: MessageEvent<{ id: number; ok: true; laid: LaidOut[] }>) => {
        if (e.data.id !== id) return;
        w.removeEventListener("message", onMessage);
        w.removeEventListener("error", onError);
        e.data.laid.forEach((l, k) => (out[from + k] = l));
        done += to - from;
        progress?.(done);
        give(w);
      };
      const onError = (e: ErrorEvent) => {
        failed = true;
        // (a worker that fails to run fails the whole of what was asked; the pool is made again next time)
        for (const p of workers) p.terminate();
        pool = null;
        reject(new Error(e.message || "a layout worker stopped"));
      };
      w.addEventListener("message", onMessage);
      w.addEventListener("error", onError);
      w.postMessage({ id, batch: inputs.slice(from, to) });
    };
    for (const w of workers) {
      running++;
      give(w);
    }
  });
}
