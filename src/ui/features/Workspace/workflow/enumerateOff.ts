/**
 * Enumerate's products made off the thread the drawing runs on (enumerateWorker.ts): its lists or substituents on a template,
 * each product laid out and told from the others by its identity. The worker started the first time it is asked for and kept;
 * where none can be made - tests - made here.
 */
import type { StyleChoice } from "../../../../lib/chem/style";
import type { Model } from "../store/types";
import { enumerated, type Enumerated } from "./enumerate";
import { substituted, type Combine } from "./substituents";
import { enumerateAsked, enumerateOutcome, runMenoDrawn } from "./meno";
import type { StepKind } from "./kinds";
import type { DrawnEntry } from "./entries";
import type { DrawnOutcome } from "./meno";
import type { OptionValues } from "../../../../lib/options";

/** What Enumerate is asked: its template, and its lists (`text`) - or its positions and groups, each alone or together. */
export type EnumerateAsked =
  | { way: "lists"; template: Model; text: string; style?: StyleChoice }
  | { way: "substituents"; template: Model; positions: number[]; text: string; combine: Combine; style?: StyleChoice };

type Answer = { id: number; ok: true; made: Enumerated } | { id: number; ok: false; error: string };
let worker: Worker | null = null;
let sent = 0;
/** What the worker was asked and has not answered, by message, in the order sent: the first is the one it is making now. */
const waiting = new Map<number, { run: number; asked: EnumerateAsked; done: (made: Enumerated) => void; fail: (e: Error) => void }>();

/**
 * How the worker is made, given by the app as it starts (main.tsx `enumerateWorkerMade`): named here, its URL would put the
 * worker inside every other worker whose code reaches the store - a cycle the bundler refuses. None given - tests - and
 * Enumerate is made here.
 */
let make: (() => Worker) | null = null;

/** The app's way of making Enumerate's worker (`make`). */
export function enumerateWorkerMade(f: () => Worker): void {
  make = f;
}

function started(): Worker {
  if (worker) return worker;
  const w = make!();
  w.onmessage = (e: MessageEvent<Answer>) => {
    const a = e.data;
    const w8 = waiting.get(a.id);
    if (!w8) return;
    waiting.delete(a.id);
    if (a.ok) w8.done(a.made);
    else w8.fail(new Error(a.error));
  };
  w.onerror = (e) => {
    // (a worker that fails to run fails everything it was asked; it is started again next time)
    for (const w8 of waiting.values()) w8.fail(new Error(e.message || "the Enumerate worker stopped"));
    waiting.clear();
    worker = null;
  };
  worker = w;
  return w;
}

/** What a stop says: the worker ended, its products not made. */
export const ENUMERATE_STOPPED = "Enumerate was stopped";

/**
 * Run `run` stopped: what it asked fails, said stopped (`ENUMERATE_STOPPED`), and no other run's. Where the worker is making its
 * products now, the worker is ended - a Stop ends the work, rather than waiting for products it would only throw away - and what
 * the other runs asked is asked again of a worker made anew; where it is only waiting its turn, it is taken out of the queue.
 */
export function enumerateStopped(run: number): void {
  const now = waiting.keys().next().value;
  const ours = [...waiting].filter(([, w8]) => w8.run === run);
  if (!ours.length) return;
  for (const [id, w8] of ours) {
    waiting.delete(id);
    w8.fail(new Error(ENUMERATE_STOPPED));
  }
  if (!ours.some(([id]) => id === now)) return;
  worker?.terminate();
  worker = null;
  if (!waiting.size) return;
  const again = started();
  for (const [id, w8] of waiting) again.postMessage({ id, asked: w8.asked });
}

/** Enumerate's products for `asked`, for run `run` (the step's, whose Stop stops it alone): made in the worker, or here where there are no workers. */
export function enumeratedOff(asked: EnumerateAsked, run = 0): Promise<Enumerated> {
  if (!make || typeof Worker === "undefined")
    return Promise.resolve().then(() => (asked.way === "substituents" ? substituted(asked.template, asked.positions, asked.text, asked.combine, asked.style) : enumerated(asked.template, asked.text, asked.style)));
  return new Promise((done, fail) => {
    const id = ++sent;
    waiting.set(id, { run, asked, done, fail });
    started().postMessage({ id, asked });
  });
}

/**
 * `runMenoDrawn`, with Enumerate's products made off the drawing thread (here): laid out and told apart, a long list
 * takes seconds; `run` is the step's, whose Stop stops it alone. Any other kind as `runMenoDrawn` does it.
 */
export async function runMenoDrawnOff(kind: StepKind, entries: readonly DrawnEntry[], own?: OptionValues, style?: StyleChoice, said: readonly string[] = [], run = 0): Promise<DrawnOutcome> {
  if (kind !== "enumerate" || !entries.length) return runMenoDrawn(kind, entries, own, style, said);
  const asked = enumerateAsked(entries, own, style);
  if ("said" in asked) return asked;
  return enumerateOutcome(await enumeratedOff(asked, run), entries, said);
}
