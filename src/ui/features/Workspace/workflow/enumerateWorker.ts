/**
 * Enumerate's products made in a worker of their own (./enumerateOff): each laid out and its identity worked out, which for a
 * long list takes seconds the drawing is not to wait on. One run a message, answered by its id.
 */
import { enumerated } from "./enumerate";
import { substituted } from "./substituents";
import type { EnumerateAsked } from "./enumerateOff";

// (the app is typed against the DOM's window, not a worker's scope)
const scope = self as unknown as {
  onmessage: (e: MessageEvent<{ id: number; asked: EnumerateAsked }>) => void;
  postMessage: (message: unknown) => void;
};

scope.onmessage = (e) => {
  const { id, asked } = e.data;
  try {
    const made =
      asked.way === "substituents"
        ? substituted(asked.template, asked.positions, asked.text, asked.combine, asked.style)
        : enumerated(asked.template, asked.text, asked.style);
    scope.postMessage({ id, ok: true, made });
  } catch (err) {
    scope.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
