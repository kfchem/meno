/**
 * The user's first action in this run of Meno: the first edit made in any
 * workspace (a structure put down, a paste, anything drawn or written - an
 * edit undo can take back), a file opened, or Settings opened, whichever
 * comes first. Meno's own question about keeping itself up to date waits
 * for it (lib/update): asked of someone who has not yet done anything, it
 * is the first thing they would meet.
 */
import { create } from "zustand";
import type { DocumentStore } from "./doc/document";

export const useFirstAction = create<{ done: boolean }>(() => ({ done: false }));

/** The first action done: a file opened, Settings opened - or, through `watchFirstEdit`, a workspace's first edit. */
export function firstActionDone(): void {
  if (!useFirstAction.getState().done) useFirstAction.setState({ done: true });
}

/** Counts a workspace's first edit - one undo can take back, not what Meno does to it of itself - as the first action. Returns a stop. */
export function watchFirstEdit<T>(doc: DocumentStore<T>): () => void {
  if (useFirstAction.getState().done) return () => {};
  const stop = doc.subscribe(() => {
    if (useFirstAction.getState().done) return stop();
    if (doc.history().undoDepth > 0) {
      stop();
      firstActionDone();
    }
  });
  return stop;
}

/**
 * How long the page must have rested - nothing done, nothing under way - after the first action for what waits for it to
 * come: a proposal of the look check's, with no other basis (the brief's `REST_MS`), one constant to tune there.
 */
export const REST_MS = 4000;

/**
 * Runs `run` once, after the first action, once the page has rested: done,
 * and then for `ms` nothing done and nothing under way (`busy`: the pointer
 * held, a key, an edit, a text field or Quick Add open, a menu or a guide, a
 * plugin being set up, another card or question showing). Each change
 * (`changes`) starts the stretch again; where something is under way as it
 * ends, the next change that leaves nothing under way starts it again.
 * Never of itself before the first action, however long none comes.
 * Returns a stop.
 */
export function afterFirstAction(run: () => void, busy: () => boolean, changes: (changed: () => void) => () => void, ms = REST_MS): () => void {
  let beat: ReturnType<typeof setTimeout> | null = null;
  let ran = false;
  const look = () => {
    if (ran || !useFirstAction.getState().done) return;
    // (the stretch started again by each change)
    if (beat) clearTimeout(beat);
    beat = setTimeout(() => {
      beat = null;
      if (ran || busy()) return;
      ran = true;
      stop();
      run();
    }, ms);
  };
  const unwatch = useFirstAction.subscribe(look);
  const unchanged = changes(look);
  const stop = () => {
    unwatch();
    unchanged();
    if (beat) clearTimeout(beat);
    beat = null;
  };
  look();
  return stop;
}
