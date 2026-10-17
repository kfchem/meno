/**
 * A reaction's atoms mapped off the thread the drawing runs on
 * (atomMapWorker.ts): a worker of its own for each reaction, ended when it
 * answers or when it is stopped. Where there are no workers - tests - it is
 * mapped here.
 */
import { mapReaction, type ReactionMap, type ReactionMapRefusal } from "../../../../lib/chem/reactionMap";
import type { Molecule } from "../../../../lib/chem/molecule";

type Answer = { kind: "progress"; searches: number } | { kind: "done"; result: ReactionMap | ReactionMapRefusal } | { kind: "failed"; error: string };

/** What stopping a mapping rejects with. */
export class MappingStopped extends Error {
  constructor() {
    super("Stopped.");
  }
}

/** The reaction mapped; `onProgress` told how many searches it has made, now and then; `stop` ends it. */
export function mapAtoms(
  reactants: Molecule[],
  products: Molecule[],
  onProgress?: (searches: number) => void,
): { result: Promise<ReactionMap | ReactionMapRefusal>; stop: () => void } {
  if (typeof Worker === "undefined") {
    let stopped = false;
    return {
      result: Promise.resolve().then(() => {
        if (stopped) throw new MappingStopped();
        return mapReaction({ reactants, products });
      }),
      stop: () => (stopped = true),
    };
  }
  const w = new Worker(new URL("./atomMapWorker.ts", import.meta.url), { type: "module" });
  let fail: (e: Error) => void = () => {};
  const result = new Promise<ReactionMap | ReactionMapRefusal>((done, failWith) => {
    fail = failWith;
    w.onmessage = (e: MessageEvent<Answer>) => {
      const a = e.data;
      if (a.kind === "progress") {
        onProgress?.(a.searches);
        return;
      }
      w.terminate();
      if (a.kind === "done") done(a.result);
      else failWith(new Error(a.error));
    };
    w.onerror = (e) => {
      w.terminate();
      failWith(new Error(e.message || "the mapping stopped"));
    };
  });
  w.postMessage({ reactants, products });
  return {
    result,
    stop: () => {
      w.terminate();
      fail(new MappingStopped());
    },
  };
}
