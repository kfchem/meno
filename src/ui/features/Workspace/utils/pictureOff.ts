/**
 * A picture read off the thread the drawing runs on (pictureWorker.ts):
 * never on it - tracing one takes up to a second. Where there are no
 * workers - tests - it is read here.
 */
import type { FigureRead } from "../../../../lib/figure/read";
import { pictureRead, type PictureJob } from "./tracedPicture";

type Answer = { id: number; ok: true; read: FigureRead | { none: string } } | { id: number; ok: false; error: string };

let worker: Worker | null = null;
const waiting = new Map<number, { done: (r: FigureRead | { none: string }) => void; fail: (e: Error) => void }>();
let asked = 0;

function started(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./pictureWorker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<Answer>) => {
    const a = e.data;
    const at = waiting.get(a.id);
    if (!at) return;
    waiting.delete(a.id);
    if (a.ok) at.done(a.read);
    else at.fail(new Error(a.error));
  };
  w.onerror = (e) => {
    // (a worker that fails to run fails everything it was asked, and is started afresh by the next)
    for (const at of waiting.values()) at.fail(new Error(e.message || "the picture reader stopped"));
    waiting.clear();
    worker = null;
  };
  worker = w;
  return w;
}

/** A picture read in a worker: its figure, or why none. Its pixels go over as they are, no copy. */
export function pictureReadOff(job: PictureJob): Promise<FigureRead | { none: string }> {
  if (typeof Worker === "undefined") return Promise.resolve().then(() => pictureRead(job));
  return new Promise((done, fail) => {
    const id = ++asked;
    waiting.set(id, { done, fail });
    started().postMessage({ id, job }, [job.data]);
  });
}
