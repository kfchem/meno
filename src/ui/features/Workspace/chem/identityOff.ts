/**
 * Structures' identities (lib/chem/identity `identity`) worked out off the thread the drawing runs on
 * (identityWorker.ts), the worker started the first time it is asked for and kept; where there are no workers - tests - in
 * place. Each answer is kept by what was asked - the structure's content, not where it lies - so the same structure drawn
 * again, moved or put in a set, is answered at once.
 *
 * Read on the drawing thread (`identityKnown`), a structure not yet answered is worked out in place only where it is small
 * (`IN_PLACE_MOST` atoms); else it is asked of the worker and said pending (undefined), and whoever shows it is told when
 * the answer lands (`useIdentitiesAnswered`). A caller that may wait asks first (`identitiesAsked`) and then reads.
 */
import { create } from "zustand";
import { identity, identityKeyOf, type IdentityInput } from "../../../../lib/chem/identity";
import { NOT_YET } from "../../../../lib/table";

export type Found = { text: string; complete: boolean };

/**
 * The most atoms a structure not yet answered may have to be worked out on the drawing thread. Not by its cost, which
 * cannot be told before - tetraphenylmethane, 25 atoms, took about 60 ms where imatinib, 37, took 20 - but small enough
 * that none of that size takes long.
 */
export const IN_PLACE_MOST = 16;

/** How many answers are kept; past them, all are let go and asked again as needed. */
const KEPT = 4096;

const known = new Map<string, Found>();
const asking = new Map<string, Promise<Found>>();

/** How many answers have landed since the app started: what shows an answer reads it, and renders again when it moves. */
export const useIdentitiesAnswered = create<{ answered: number }>(() => ({ answered: 0 }));

const keyOf = (input: IdentityInput) => JSON.stringify(input);

function keep(key: string, found: Found): Found {
  if (known.size >= KEPT) known.clear();
  known.set(key, found);
  return found;
}

type Answer = { id: number; ok: true; found: Found } | { id: number; ok: false; error: string };
let worker: Worker | null = null;
let asked = 0;
const waiting = new Map<number, { done: (f: Found) => void; fail: (e: Error) => void }>();

function started(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./identityWorker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<Answer>) => {
    const a = e.data;
    const w8 = waiting.get(a.id);
    if (!w8) return;
    waiting.delete(a.id);
    if (a.ok) w8.done(a.found);
    else w8.fail(new Error(a.error));
  };
  w.onerror = (e) => {
    // (a worker that fails to run fails everything it was asked; it is started again next time)
    for (const w8 of waiting.values()) w8.fail(new Error(e.message || "the identity worker stopped"));
    waiting.clear();
    worker = null;
  };
  worker = w;
  return w;
}

/** `input`'s identity, from what is kept, or worked out in the worker - in place where there are no workers. */
export function identityAsked(input: IdentityInput): Promise<Found> {
  const key = keyOf(input);
  const had = known.get(key);
  if (had) return Promise.resolve(had);
  const going = asking.get(key);
  if (going) return going;
  const answer =
    typeof Worker === "undefined"
      ? Promise.resolve().then(() => identity(input))
      : new Promise<Found>((done, fail) => {
          const id = ++asked;
          waiting.set(id, { done, fail });
          started().postMessage({ id, input });
        });
  const settled = answer
    .then((found) => {
      keep(key, found);
      useIdentitiesAnswered.setState((s) => ({ answered: s.answered + 1 }));
      return found;
    })
    .finally(() => asking.delete(key));
  asking.set(key, settled);
  return settled;
}

/** Each of `inputs` answered (`identityAsked`): for a caller that may wait before it reads them (`identityKnown`). */
export function identitiesAsked(inputs: readonly IdentityInput[]): Promise<Found[]> {
  return Promise.all(inputs.map(identityAsked));
}

/**
 * `input`'s identity where it is known, or small enough to work out here (`IN_PLACE_MOST`); else undefined - pending - and
 * asked of the worker, so that it is known once its answer lands.
 */
export function identityKnown(input: IdentityInput): Found | undefined {
  const key = keyOf(input);
  const had = known.get(key);
  if (had) return had;
  // (with no workers - tests - there is no drawing thread to keep free: worked out here, as before)
  if (input.atoms.length <= IN_PLACE_MOST || typeof Worker === "undefined") return keep(key, identity(input));
  void identityAsked(input).catch(() => {});
  return undefined;
}

/** Every answer let go (tests). */
export function forgetIdentities(): void {
  known.clear();
}

/**
 * A table's constitution cell (lib/table `moleculesAsTable`) as the drawing thread may write it: the key where the identity is
 * known, or small enough to work out here; else the words that say it is still being worked out, the worker asked.
 */
export function constitutionKnown(input: IdentityInput): string {
  const found = identityKnown(input);
  return found ? identityKeyOf(found.text) : NOT_YET;
}
