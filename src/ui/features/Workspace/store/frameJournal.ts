import { amendedState, DEFAULT_HISTORY_LIMIT } from "../../../../lib/doc/document";

/**
 * The frame each molecule in 3D shows, as undo sees a step that changed it.
 * Which frame is shown is the view's and is not undone; but where a step of
 * the document changes it with itself - frames taken as conformers showing
 * their lowest, molecules joined as conformers - the two go together: the
 * document as it was before the step and after it are kept here with the
 * frames shown, so that an undo or a redo across that very step puts the
 * frames back too (as ./turnJournal does for turns). Keyed by the document
 * store; as many steps as undo goes back.
 */
type Step = {
  before: object;
  after: object;
  framesBefore: Record<number, number | undefined>;
  framesAfter: Record<number, number | undefined>;
};

const journals = new WeakMap<object, Step[]>();

/** Notes a step that took the document from `before` to `after` and the frames shown from `framesBefore` to `framesAfter` (undefined: the first). */
export function noteFrames(doc: object, before: object, after: object, framesBefore: Record<number, number | undefined>, framesAfter: Record<number, number | undefined>): void {
  if (before === after) return;
  const steps = journals.get(doc) ?? [];
  steps.push({ before, after, framesBefore, framesAfter });
  if (steps.length > DEFAULT_HISTORY_LIMIT) steps.splice(0, steps.length - DEFAULT_HISTORY_LIMIT);
  journals.set(doc, steps);
}

/** The frames to show as the document goes from `was` to `now`: those before such a step, when it is undone; those after, when it is redone. Null when the change is no such step. */
export function framesAcross(doc: object, was: object, now: object): Record<number, number | undefined> | null {
  const steps = journals.get(doc);
  if (!steps) return null;
  for (let i = steps.length - 1; i >= 0; i--) {
    const [before, after] = [amendedState(steps[i].before), amendedState(steps[i].after)];
    if (was === after && now === before) return steps[i].framesBefore;
    if (was === before && now === after) return steps[i].framesAfter;
  }
  return null;
}
