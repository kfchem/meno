/**
 * A conformer search's rounds judged off the thread the page runs on
 * (roundsWorker.ts): a worker of its own for each search, ended with it.
 * Where there are no workers - tests - it is done here (`judgeHere`).
 */
import type { Conformers } from "../../../../lib/roles/client";
import { judgeHere, type RoundsJudge } from "./conformerRounds";

type Answer = { kind: "added"; fresh: number } | { kind: "failed"; error: string };

/** A judge of a search's rounds of `c`'s molecule, within `window` kcal/mol: in a worker where there are workers. */
export function roundsJudge(c: Pick<Conformers, "atoms" | "bonds">, window: number): RoundsJudge {
  if (typeof Worker === "undefined") return judgeHere(c.atoms, c.bonds, window);
  const w = new Worker(new URL("./roundsWorker.ts", import.meta.url), { type: "module" });
  w.postMessage({ kind: "start", atoms: c.atoms, bonds: c.bonds, window });
  return {
    add: (frames, energies) =>
      new Promise<number>((done, failWith) => {
        w.onmessage = (e: MessageEvent<Answer>) => (e.data.kind === "added" ? done(e.data.fresh) : failWith(new Error(e.data.error)));
        w.onerror = (e) => failWith(new Error(e.message || "the round could not be judged"));
        w.postMessage({ kind: "add", frames, energies });
      }),
    end: () => w.terminate(),
  };
}
