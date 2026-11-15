/**
 * An Atom map step's entries mapped in a worker of its own
 * (lib/chem/reactionMap `mapOnto`): each can take seconds, which the page
 * is not to wait on. One side at a time, saying after each how many are
 * done; stopped by being ended.
 */
import { mapOnto } from "../../../../lib/chem/reactionMap";
import type { Molecule } from "../../../../lib/chem/molecule";

// (the app is typed against the DOM's window, not a worker's scope)
const scope = self as unknown as {
  onmessage: (e: MessageEvent<{ reference: Molecule[]; entries: Molecule[][]; o: Parameters<typeof mapOnto>[2] }>) => void;
  postMessage: (message: unknown) => void;
};

scope.onmessage = (e) => {
  const { reference, entries, o } = e.data;
  try {
    const all: ReturnType<typeof mapOnto> = { mapped: [], notMapped: [] };
    entries.forEach((side, k) => {
      // (one side at a time, numbered as it stands among them all)
      const one = mapOnto(reference, [side], o);
      all.mapped.push(...one.mapped.map((m) => ({ ...m, product: k })));
      all.notMapped.push(...one.notMapped.map((n) => ({ ...n, product: k })));
      scope.postMessage({ kind: "progress", done: k + 1 });
    });
    scope.postMessage({ kind: "done", result: all });
  } catch (err) {
    scope.postMessage({ kind: "failed", error: err instanceof Error ? err.message : String(err) });
  }
};
