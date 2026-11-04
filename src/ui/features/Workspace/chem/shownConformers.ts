/**
 * A structure's stereoisomers' conformers made the page's off the thread the
 * page runs on (pageConformersWorker.ts): a worker of their own for each
 * structure, ended when it answers. Where there are no workers - tests - it
 * is done here.
 */
import type { Conformers } from "../../../../lib/roles/client";
import { asThePageShows } from "./pageConformers";

type Answer = { kind: "done"; isomers: Conformers[] } | { kind: "failed"; error: string };

/** Each stereoisomer's conformers as the page shows them (`asThePageShows`). */
export function shownConformers(isomers: Conformers[]): Promise<Conformers[]> {
  if (typeof Worker === "undefined") return Promise.resolve().then(() => isomers.map(asThePageShows));
  const w = new Worker(new URL("./pageConformersWorker.ts", import.meta.url), { type: "module" });
  return new Promise<Conformers[]>((done, failWith) => {
    w.onmessage = (e: MessageEvent<Answer>) => {
      w.terminate();
      if (e.data.kind === "done") done(e.data.isomers);
      else failWith(new Error(e.data.error));
    };
    w.onerror = (e) => {
      w.terminate();
      failWith(new Error(e.message || "the conformers could not be made the page's"));
    };
    w.postMessage({ isomers });
  });
}
