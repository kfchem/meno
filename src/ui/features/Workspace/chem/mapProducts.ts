/**
 * An Atom map step's entries mapped off the thread the page runs on
 * (productsMapWorker.ts): a worker of its own, ended when it answers or
 * when it is stopped. Where there are no workers - tests - they are mapped
 * here.
 */
import { mapOnto } from "../../../../lib/chem/reactionMap";
import type { Molecule } from "../../../../lib/chem/molecule";
import { MappingStopped } from "./mapAtoms";

type Mapped = ReturnType<typeof mapOnto>;
type Options = Parameters<typeof mapOnto>[2];
type Answer = { kind: "progress"; done: number } | { kind: "done"; result: Mapped } | { kind: "failed"; error: string };

/** The sides `entries`, each mapped onto `reference` (lib/chem/reactionMap `mapOnto`); `onDone` told how many are done, as each is; `stop` ends it. */
export function mapOntoOff(reference: Molecule[], entries: Molecule[][], o: Options, onDone?: (done: number) => void): { result: Promise<Mapped>; stop: () => void } {
  if (typeof Worker === "undefined") {
    let stopped = false;
    return {
      result: Promise.resolve().then(() => {
        if (stopped) throw new MappingStopped();
        return mapOnto(reference, entries, o);
      }),
      stop: () => (stopped = true),
    };
  }
  const w = new Worker(new URL("./productsMapWorker.ts", import.meta.url), { type: "module" });
  let fail: (e: Error) => void = () => {};
  const result = new Promise<Mapped>((done, failWith) => {
    fail = failWith;
    w.onmessage = (e: MessageEvent<Answer>) => {
      const a = e.data;
      if (a.kind === "progress") {
        onDone?.(a.done);
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
  w.postMessage({ reference, entries, o });
  return {
    result,
    stop: () => {
      w.terminate();
      fail(new MappingStopped());
    },
  };
}
