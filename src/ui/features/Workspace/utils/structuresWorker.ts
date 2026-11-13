/**
 * A figure's structures read in a worker of its own (structuresOff.ts): one
 * figure a message, answered by its id.
 */
import { figureRead, type FigureJob } from "./structuresRead";

// (the app is typed against the DOM's window, not a worker's scope)
const scope = self as unknown as {
  onmessage: (e: MessageEvent<{ id: number; job: FigureJob }>) => void;
  postMessage: (message: unknown) => void;
};

scope.onmessage = (e) => {
  const { id, job } = e.data;
  try {
    scope.postMessage({ id, ok: true, read: figureRead(job) });
  } catch (err) {
    scope.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
