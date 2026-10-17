/**
 * A reaction's atoms mapped in a worker of its own (lib/chem/reactionMap):
 * a reaction among several like molecules can take seconds, which the
 * drawing is not to wait on. One reaction a worker; it says how far it has
 * got as it goes - searches made - and is stopped by being ended.
 */
import { mapReaction } from "../../../../lib/chem/reactionMap";
import type { Molecule } from "../../../../lib/chem/molecule";

// (the app is typed against the DOM's window, not a worker's scope)
const scope = self as unknown as {
  onmessage: (e: MessageEvent<{ reactants: Molecule[]; products: Molecule[] }>) => void;
  postMessage: (message: unknown) => void;
};

/** How often it says how far it has got, at most: in milliseconds. */
const TELL_MS = 200;

scope.onmessage = (e) => {
  const { reactants, products } = e.data;
  let searches = 0;
  let told = Date.now();
  try {
    const result = mapReaction({
      reactants,
      products,
      trace: {
        getMaps: () => {
          searches++;
          const now = Date.now();
          if (now - told >= TELL_MS) {
            told = now;
            scope.postMessage({ kind: "progress", searches });
          }
        },
      },
    });
    scope.postMessage({ kind: "done", result });
  } catch (err) {
    scope.postMessage({ kind: "failed", error: err instanceof Error ? err.message : String(err) });
  }
};
