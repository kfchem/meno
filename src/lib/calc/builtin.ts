/**
 * Meno's own reading (./menoReads), asked as a plugin's worker is - the same
 * `Reader` - but run in the app, in a web worker of its own
 * (./builtinWorker), started the first time it is asked; its answers' runs
 * of numbers come in buffers (./packed). Where there is no worker to be had
 * - the tests - it is answered in place, carried the same way.
 */
import type { Reader } from "./client";
import type { ReaderOutput } from "./output";
import { pack, unpack } from "./packed";
import type { MenoQuestion } from "./menoReads";
import type { GridPlace } from "./grids";

type Answer = { id: number; ok: boolean; result?: unknown; error?: string };

let worker: Worker | null = null;
let next = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function ask(question: MenoQuestion): Promise<unknown> {
  if (typeof Worker === "undefined") {
    return import("./menoReads").then(({ menoAnswer }) => unpack(structuredClone(pack(menoAnswer(question)).packed)));
  }
  if (!worker) {
    worker = new Worker(new URL("./builtinWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<Answer>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(unpack(e.data.result));
      else p.reject(new Error(e.data.error ?? "the reader could not read it"));
    };
    // (a worker that stops, or an answer that cannot be taken in, fails what
    // waits on it, saying so - nothing is left waiting for good - and the
    // next question starts it afresh)
    const fail = (why: string) => {
      for (const p of pending.values()) p.reject(new Error(why));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
    worker.onerror = (e) => fail(`Meno's reading stopped: ${e.message || "its worker failed"}`);
    worker.onmessageerror = () => fail("Meno's reading gave an answer the page could not take in");
  }
  const id = next++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ id, ...question });
  });
}

/** Orbital `k` of a wavefunction a reader gave (./expansion), drawn on `grid` in Meno's reading worker once the orbitals offered (`block`) are found orthonormal. */
export const drawOrbital = (expansion: unknown, k: number, block: number[], grid?: GridPlace): Promise<unknown> =>
  ask({ kind: "", op: "draw", name: "", text: "", expansion, k, block, ...(grid ? { grid } : {}) });

/** Meno's own reading, as a `Reader`. It tells no kind by asking: Meno's kinds are told by their marks and layouts (lib/io/kinds). */
export function menoReader(): Reader {
  return {
    version: "",
    read: (kind, name, text) => ask({ kind, op: "read", name, text }) as Promise<ReaderOutput>,
    ask: (kind, key, name, text) => ask({ kind, op: "ask", key, name, text }),
    probe: async () => false,
    // (Meno writes its own kinds itself, on the page: lib/io/writers)
    write: async (kind) => {
      throw new Error(`Meno does not write ${kind} through its reader`);
    },
  };
}
