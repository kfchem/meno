/**
 * Meno's CIP (lib/chem/cip) in a worker of its own: a cage of centres can
 * take it a second, which the drawing is not to wait on. The structures
 * that hold the units asked for, a message, answered by its id
 * (cipRun.ts); each structure's answers kept a while, so that asking for
 * one more label on a large drawing works out only the structure it is on.
 */
import { cipAnswersOf, type CipAnswer, type CipJob } from "./cipMarks";

// (the app is typed against the DOM's window, not a worker's scope)
const scope = self as unknown as {
  onmessage: (e: MessageEvent<{ id: number; jobs: CipJob[] }>) => void;
  postMessage: (message: unknown) => void;
};

/** The most structures whose answers are kept: the last asked. */
const KEPT = 64;
const kept = new Map<string, CipAnswer[]>();

scope.onmessage = (e) => {
  const { id, jobs } = e.data;
  try {
    const answers = jobs.map((job) => {
      const key = JSON.stringify(job);
      const known = kept.get(key);
      if (known) {
        kept.delete(key);
        kept.set(key, known);
        return known;
      }
      const a = cipAnswersOf(job);
      kept.set(key, a);
      if (kept.size > KEPT) kept.delete(kept.keys().next().value!);
      return a;
    });
    scope.postMessage({ id, ok: true, answers });
  } catch (err) {
    scope.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
