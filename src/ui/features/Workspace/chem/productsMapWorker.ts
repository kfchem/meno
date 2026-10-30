/**
 * A Reaction step's products mapped in a worker of its own
 * (lib/chem/reactionMap `mapProducts`): each product can take seconds,
 * which the page is not to wait on. One product at a time, saying after
 * each how many are done; stopped by being ended.
 */
import { mapProducts } from "../../../../lib/chem/reactionMap";
import type { Molecule } from "../../../../lib/chem/molecule";

// (the app is typed against the DOM's window, not a worker's scope)
const scope = self as unknown as {
  onmessage: (e: MessageEvent<{ reactant: Molecule; products: Molecule[]; every: boolean }>) => void;
  postMessage: (message: unknown) => void;
};

scope.onmessage = (e) => {
  const { reactant, products, every } = e.data;
  try {
    const all: ReturnType<typeof mapProducts> = { mapped: [], notMapped: [] };
    products.forEach((p, k) => {
      // (one product at a time, numbered as it stands among them all)
      const one = mapProducts(reactant, [p], { every });
      all.mapped.push(...one.mapped.map((m) => ({ ...m, product: k })));
      all.notMapped.push(...one.notMapped.map((n) => ({ ...n, product: k })));
      scope.postMessage({ kind: "progress", done: k + 1 });
    });
    scope.postMessage({ kind: "done", result: all });
  } catch (err) {
    scope.postMessage({ kind: "failed", error: err instanceof Error ? err.message : String(err) });
  }
};
