/**
 * A figure's structures read off the thread the drawing runs on
 * (structuresWorker.ts): never on it - reading one takes up to seconds - and
 * in two workers, so that the one read for the pointer on a figure is never
 * kept waiting behind those read in the background, a whole PDF's, one after
 * another (`urgent` or not). Where there are no workers - tests - it is read
 * here.
 */
import { figureRead, type FigureJob, type FigureStructures } from "./structuresRead";

type Answer = { id: number; ok: true; read: FigureStructures } | { id: number; ok: false; error: string };
type Lane = { worker: Worker | null; waiting: Map<number, { done: (r: FigureStructures) => void; fail: (e: Error) => void }> };

const lanes: Record<"urgent" | "background", Lane> = { urgent: { worker: null, waiting: new Map() }, background: { worker: null, waiting: new Map() } };
let asked = 0;

function started(lane: Lane): Worker {
  if (lane.worker) return lane.worker;
  const w = new Worker(new URL("./structuresWorker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<Answer>) => {
    const a = e.data;
    const waiting = lane.waiting.get(a.id);
    if (!waiting) return;
    lane.waiting.delete(a.id);
    if (a.ok) waiting.done(a.read);
    else waiting.fail(new Error(a.error));
  };
  w.onerror = (e) => {
    // (a worker that fails to run fails everything it was asked, and is started afresh by the next)
    for (const waiting of lane.waiting.values()) waiting.fail(new Error(e.message || "the figure reader stopped"));
    lane.waiting.clear();
    lane.worker = null;
  };
  lane.worker = w;
  return w;
}

/** A figure's structures, read in a worker - the urgent one for a figure the pointer is on, the other for those read ahead. */
export function figureReadOff(job: FigureJob, urgent: boolean): Promise<FigureStructures> {
  if (typeof Worker === "undefined") return Promise.resolve().then(() => figureRead(job));
  const lane = lanes[urgent ? "urgent" : "background"];
  return new Promise((done, fail) => {
    const id = ++asked;
    lane.waiting.set(id, { done, fail });
    // (the bytes the reader gave go over as they are: no copy)
    started(lane).postMessage({ id, job }, job.drawn instanceof ArrayBuffer ? [job.drawn] : []);
  });
}
