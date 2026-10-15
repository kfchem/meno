import { amendedState, DEFAULT_HISTORY_LIMIT } from "../../../../lib/doc/document";
import type { Turn3D } from "./types";

/**
 * Turns of several molecules in 3D as one body, as undo sees them. Where
 * the molecules stand is the document's and is undone; how each is turned
 * is the view's and is not - but the two go together in such a turn, so the
 * document as it was before one and after it are kept here with the turns
 * of each: an undo or a redo across that very step puts the turns back too.
 * Keyed by the document store; the last few steps of each.
 */
type Step = {
  gesture: string;
  before: object;
  after: object;
  turnsBefore: Record<number, Turn3D | undefined>;
  turnsAfter: Record<number, Turn3D>;
};

/** How many such steps are kept: as many as undo goes back (it was a hundred, as undo was, and stayed so when undo went to a thousand). */
const KEPT = DEFAULT_HISTORY_LIMIT;

const journals = new WeakMap<object, Step[]>();

/**
 * Notes a turn as one body, the document having gone from `before` to
 * `after` with it; the turns of a drag that goes on are one step, as its
 * edits are.
 */
export function noteTurns(
  doc: object,
  gesture: string,
  before: object,
  after: object,
  turnsBefore: Record<number, Turn3D | undefined>,
  turnsAfter: Record<number, Turn3D>,
): void {
  const steps = journals.get(doc) ?? [];
  const last = steps[steps.length - 1];
  if (last?.gesture === gesture) {
    last.after = after;
    last.turnsAfter = { ...last.turnsAfter, ...turnsAfter };
    return;
  }
  steps.push({ gesture, before, after, turnsBefore, turnsAfter });
  if (steps.length > KEPT) steps.splice(0, steps.length - KEPT);
  journals.set(doc, steps);
}

/**
 * The turns to put back as the document goes from `was` to `now`: those
 * before a turn as one body, when it is undone; those after it, when it is
 * redone. Null when the change is no such step.
 */
export function turnsAcross(doc: object, was: object, now: object): Record<number, Turn3D | undefined> | null {
  const steps = journals.get(doc);
  if (!steps) return null;
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    // (the states as amends have made them since: a PDF scrolled in the
    // column, a step's run - each replaces every state it changes)
    const [before, after] = [amendedState(s.before), amendedState(s.after)];
    if (was === after && now === before) return s.turnsBefore;
    if (was === before && now === after) return s.turnsAfter;
  }
  return null;
}
