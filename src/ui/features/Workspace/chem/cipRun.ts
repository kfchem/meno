/**
 * The drawing's R and S, E and Z worked out off the thread it runs on
 * (cipWorker.ts), the worker started the first time it is asked for and
 * kept. Where there are no workers - tests - they are worked out here.
 */
import { cipAnswersOf, cipJobsOf, cipMarksFrom, type CipAnswer, type CipMarks } from "./cipMarks";
import type { Model } from "../store/types";
import { fragmentsHolding } from "./cleanUp";
import { ownNames } from "../configuration/names";

type Answer = { id: number; ok: true; answers: CipAnswer[][]; names?: [number, string][] } | { id: number; ok: false; error: string };

let worker: Worker | null = null;
let asked = 0;
const waiting = new Map<number, { done: (a: CipAnswer[][], names?: [number, string][]) => void; fail: (e: Error) => void }>();

function started(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./cipWorker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<Answer>) => {
    const a = e.data;
    const w8 = waiting.get(a.id);
    if (!w8) return;
    waiting.delete(a.id);
    if (a.ok) w8.done(a.answers, a.names);
    else w8.fail(new Error(a.error));
  };
  w.onerror = (e) => {
    // a worker that fails to run fails everything it was asked
    for (const w8 of waiting.values()) w8.fail(new Error(e.message || "the CIP worker stopped"));
    waiting.clear();
    worker = null;
  };
  worker = w;
  return w;
}

/** The R and S, E and Z asked for on `model` (`stereoShown`, or the atoms and bonds `units` by id), and what each with none says. */
export function cipMarksAsked(model: Model, units?: { atoms: readonly number[]; bonds: readonly number[] }): Promise<CipMarks> {
  const jobs = cipJobsOf(model, units);
  if (!jobs.length) return Promise.resolve(cipMarksFrom([], []));
  if (typeof Worker === "undefined") return Promise.resolve().then(() => cipMarksFrom(jobs, jobs.map(cipAnswersOf)));
  return new Promise<CipAnswer[][]>((done, fail) => {
    const id = ++asked;
    waiting.set(id, { done, fail });
    started().postMessage({ id, jobs });
  }).then((answers) => cipMarksFrom(jobs, answers));
}

/**
 * The names of the atoms `ids` of `model` in what the page says of configuration (configuration/names `ownNames`): worked out off the
 * drawing's thread, on the molecules holding them alone.
 */
export function atomNamesAsked(model: Model, ids: readonly number[]): Promise<Map<number, string>> {
  const held = new Set<number>();
  for (const f of fragmentsHolding(model, ids)) f.forEach((id) => held.add(id));
  if (!held.size) return Promise.resolve(new Map());
  const part: Model = { atoms: model.atoms.filter((a) => held.has(a.id)), bonds: model.bonds.filter((b) => held.has(b.a) && held.has(b.b)) };
  if (typeof Worker === "undefined") return Promise.resolve().then(() => ownNames(part, ids));
  return new Promise<Map<number, string>>((done, fail) => {
    const id = ++asked;
    waiting.set(id, { done: (_, names) => done(new Map(names ?? [])), fail });
    started().postMessage({ id, jobs: [], names: { model: part, ids: [...ids] } });
  });
}
