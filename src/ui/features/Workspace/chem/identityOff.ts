/**
 * Structures' identities (lib/chem/identity `identity`) worked out off the thread the drawing runs on
 * (identityWorker.ts), the worker started the first time it is asked for and kept; where there are no workers - tests - in
 * place. Each answer is kept by what was asked - the structure's content, not where it lies - so the same structure drawn
 * again, moved or put in a set, is answered at once.
 *
 * Read on the drawing thread (`identityKnown`), a structure not yet answered is worked out in place only where it is small
 * (`IN_PLACE_MOST` atoms, a grouped structure weighed by its writings: `inPlaceWeight`); else it is asked of the worker and said pending (undefined), and whoever shows it is told when
 * the answer lands (`useIdentitiesAnswered`). A caller that may wait asks first (`identitiesAsked`) and then reads.
 */
import { create } from "zustand";
import { constitutionKey, identity, notStated, type IdentityInput } from "../../../../lib/chem/identity";
import { NOT_YET } from "../../../../lib/table";
import { cageLabelled } from "./cageLabelled";

export type Found = { text: string; complete: boolean };
/**
 * What is asked of a structure: its identity, or its constitution's key (lib/chem/identity `constitutionKey`) as the text, or
 * which of its cage atoms the CIP labels (chem/cageLabelled).
 */
export type Asked = "identity" | "constitution" | "cage labels";

/**
 * The most atoms a structure not yet answered may have to be worked out on the drawing thread. Not by its cost, which
 * cannot be told before - tetraphenylmethane, 25 atoms, took about 60 ms where imatinib, 37, took 20 - but small enough
 * that none of that size takes long.
 */
export const IN_PLACE_MOST = 16;

/**
 * What a structure's identity costs to work out, against `IN_PLACE_MOST`: its atoms - and, with AND or OR groups, as many times over
 * as the stereoisomers it stands for that identity writes (lib/chem/identity `grouped`: two to the power of its groups) - found in review.
 */
export const inPlaceWeight = (input: IdentityInput): number => input.atoms.length * 2 ** Math.min(input.groups?.length ?? 0, 8);

/**
 * How long the worker may say nothing, while anything waits on it, before it is taken for stopped: every structure waiting is
 * then worked out in place, and the worker let go. Counted from its last answer - or from the ask, where nothing was waiting
 * - not from each structure's own ask: it answers one at a time, so structures asked together wait behind each other, and
 * none is taken from a worker still answering. Well past what the largest structures asked of it take (Pd(PPh3)4, a few
 * seconds), so that it is only a worker that has stopped.
 */
export const ANSWER_MOST_MS = 60_000;

/** How many answers are kept; past them, all are let go and asked again as needed. */
const KEPT = 4096;

const known = new Map<string, Found>();
const asking = new Map<string, Promise<Found>>();

/** How many answers have landed since the app started: what shows an answer reads it, and renders again when it moves. */
export const useIdentitiesAnswered = create<{ answered: number }>(() => ({ answered: 0 }));

const keyOf = (input: IdentityInput, kind: Asked) => `${kind}|${JSON.stringify(input)}`;
/** What is asked, worked out here. */
const hereNow = (input: IdentityInput, kind: Asked): Found =>
  kind === "constitution" ? { text: constitutionKey(input), complete: true } : kind === "cage labels" ? { text: cageLabelled(input), complete: true } : identity(input);

/**
 * Whether what is asked is written afresh at each ask, never kept: the identity or the constitution of a structure with a metal
 * whose ligands are not stated (lib/chem/ligandsNotStated), which is the same as no other - another drawn alike included.
 */
const fresh = (input: IdentityInput, kind: Asked): boolean => kind !== "cage labels" && notStated(input);

function keep(key: string, found: Found): Found {
  if (known.size >= KEPT) known.clear();
  known.set(key, found);
  return found;
}

type Answer = { id: number; ok: true; found: Found } | { id: number; ok: false; error: string };
let worker: Worker | null = null;
let asked = 0;
const waiting = new Map<number, { done: (f: Found) => void; fail: (e: Error) => void }>();
/** The bound on the worker's silence while anything waits (`ANSWER_MOST_MS`); none while nothing does. */
let silence: ReturnType<typeof setTimeout> | null = null;

/** The worker's silence counted again from now, where anything waits on it; else not counted. */
function heard(): void {
  if (silence) clearTimeout(silence);
  silence = waiting.size ? setTimeout(() => letGo(new Error(`no answer in ${ANSWER_MOST_MS / 1000} s`)), ANSWER_MOST_MS) : null;
}

/** The worker let go: everything waiting on it failed with `why` - so worked out in place - and a new one made at the next ask. */
function letGo(why: Error): void {
  if (silence) clearTimeout(silence);
  silence = null;
  const failed = [...waiting.values()];
  waiting.clear();
  worker?.terminate();
  worker = null;
  for (const w8 of failed) w8.fail(why);
}

function started(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./identityWorker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<Answer>) => {
    if (w !== worker) return;
    const a = e.data;
    const w8 = waiting.get(a.id);
    if (!w8) return;
    waiting.delete(a.id);
    heard();
    if (a.ok) w8.done(a.found);
    else w8.fail(new Error(a.error));
  };
  // (a worker that fails to run fails everything it was asked; another is made next time)
  w.onerror = (e) => {
    if (w === worker) letGo(new Error(e.message || "the identity worker stopped"));
  };
  worker = w;
  return w;
}

/** `input`'s identity (or what else `kind` asks), from what is kept, or worked out in the worker - in place where there are no workers. */
export function identityAsked(input: IdentityInput, kind: Asked = "identity"): Promise<Found> {
  if (fresh(input, kind)) return Promise.resolve(hereNow(input, kind));
  const key = keyOf(input, kind);
  const had = known.get(key);
  if (had) return Promise.resolve(had);
  const going = asking.get(key);
  if (going) return going;
  // (where the worker cannot answer - not made, stopped, or failing on it - worked out here instead, after the task at hand:
  //  late, never left pending with no end, nor a record of another structure kept as this one's)
  const here = (why: unknown) => {
    // (kept for whoever looks: why the drawing thread worked one out)
    console.warn("an identity worked out in place: the identity worker did not answer -", why instanceof Error ? why.message : String(why));
    return new Promise<Found>((done) => setTimeout(() => done(hereNow(input, kind)), 0));
  };
  const answer =
    typeof Worker === "undefined"
      ? Promise.resolve().then(() => hereNow(input, kind))
      : new Promise<Found>((done, fail) => {
          const id = ++asked;
          try {
            const w = started();
            waiting.set(id, { done, fail });
            // (the silence counted from this ask only where nothing else was waiting: else from the last answer)
            if (!silence) heard();
            w.postMessage({ id, input, ...(kind === "identity" ? {} : { kind }) });
          } catch (e) {
            waiting.delete(id);
            if (!waiting.size) heard();
            fail(e instanceof Error ? e : new Error(String(e)));
          }
        }).catch(here);
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
  return Promise.all(inputs.map((input) => identityAsked(input)));
}

/**
 * `input`'s identity where it is known, or small enough to work out here (`IN_PLACE_MOST`, or `most` where a caller's own
 * measure of what it asks says otherwise); else undefined - pending - and asked of the worker, so that it is known once its
 * answer lands.
 */
export function identityKnown(input: IdentityInput, kind: Asked = "identity", most = IN_PLACE_MOST): Found | undefined {
  if (fresh(input, kind)) return hereNow(input, kind);
  const key = keyOf(input, kind);
  const had = known.get(key);
  if (had) return had;
  // (with no workers - tests - there is no drawing thread to keep free: worked out here, as before)
  if (inPlaceWeight(input) <= most || typeof Worker === "undefined") return keep(key, hereNow(input, kind));
  void identityAsked(input, kind).catch(() => {});
  return undefined;
}

/**
 * Every answer let go, and the worker with what waits on it, never to land (tests): the next ask makes a worker as it then
 * is.
 */
export function forgetIdentities(): void {
  if (silence) clearTimeout(silence);
  silence = null;
  waiting.clear();
  worker?.terminate();
  worker = null;
  asking.clear();
  known.clear();
}

/**
 * A table's constitution cell (lib/table `moleculesAsTable`) as the drawing thread may write it: the structure's
 * `constitutionKey` where it is known, or small enough to work out here; else the words that say it is still being worked
 * out, the worker asked.
 */
export function constitutionKnown(input: IdentityInput): string {
  return identityKnown(input, "constitution")?.text ?? NOT_YET;
}
