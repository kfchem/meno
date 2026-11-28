/**
 * Steps taken back or forward in a tab's document - the one way every
 * path takes them: the undo keys, Edit > Undo and Redo, the title bar's
 * Undo and the history it holds. A view that has something to do first
 * says so for its document (`holdSteps`): the workspace lets a gesture
 * under way go, does nothing while words are typed on the page, and asks
 * before steps that would take away a step still running - and so it is,
 * whichever of them asked for the steps.
 */
import type { DocumentStore } from "./document";

/** What taking steps needs of a document. */
export type StepsDoc = Pick<DocumentStore<unknown>, "undo" | "redo" | "travel">;

/**
 * What a document's view does first with `n` steps asked of it (back below
 * 0, forward above): true where it has taken them in hand itself - asked
 * first, a gesture let go, nothing while words are typed - and they are not
 * to be taken now; false where they may be.
 */
export type StepsHold = (n: number) => boolean;

const holds = new WeakMap<object, StepsHold>();

/** `hold` asked first about every step asked of `doc`, until what it gives is called. */
export function holdSteps(doc: object, hold: StepsHold): () => void {
  holds.set(doc, hold);
  return () => {
    if (holds.get(doc) === hold) holds.delete(doc);
  };
}

/** `n` steps taken, nothing asked: one as undo and redo take it, more as one change (`travel`). Whether any was. */
export function moveSteps(doc: StepsDoc, n: number): boolean {
  const k = Math.trunc(n);
  if (k === -1) return doc.undo();
  if (k === 1) return doc.redo();
  return k !== 0 && doc.travel(k);
}

/** What asking for steps did: held by the view (`holdSteps`), taken, or nothing - none so far to take. */
export type StepsDone = "held" | "taken" | "nothing";

/** `n` steps asked of `doc` (none while no tab holds one): its view's hold first, then taken. */
export function takeSteps(doc: StepsDoc | undefined, n: number): StepsDone {
  const k = Math.trunc(n);
  if (!doc || k === 0) return "nothing";
  if (holds.get(doc)?.(k)) return "held";
  return moveSteps(doc, k) ? "taken" : "nothing";
}
