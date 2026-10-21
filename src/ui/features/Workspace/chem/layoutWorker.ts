/**
 * The layout engine in a worker of its own: a large structure takes it up
 * to a second, which the drawing is not to wait on. One layout a message,
 * answered by its id - or, for many at once (layOut.ts `layOutMany`), a
 * batch, each laid out and read back against itself (lib/layout/many
 * `laidOutChecked`).
 */
import { layout2D, type LayoutInput } from "../../../../lib/layout/engine";
import { laidOutChecked } from "../../../../lib/layout/many";

// (the app is typed against the DOM's window, not a worker's scope)
const scope = self as unknown as {
  onmessage: (e: MessageEvent<{ id: number; input: LayoutInput } | { id: number; batch: LayoutInput[] }>) => void;
  postMessage: (message: unknown) => void;
};

scope.onmessage = (e) => {
  const { id } = e.data;
  if ("batch" in e.data) {
    // (each its own: one the engine cannot lay out says so, and the rest go on)
    scope.postMessage({ id, ok: true, laid: e.data.batch.map(laidOutChecked) });
    return;
  }
  const { input } = e.data;
  try {
    scope.postMessage({ id, ok: true, layout: layout2D(input) });
  } catch (err) {
    scope.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
