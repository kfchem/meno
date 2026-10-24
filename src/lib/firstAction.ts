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

/** How long after the first action ended what waits for it comes: a beat, so that it follows the action rather than lands on it. */
export const AFTER_ACTION_MS = 600;

/**
 * Runs `run` once, after the first action: once it is done and nothing is
 * under way (`busy`: the pointer held, a guide being gone through), a beat
 * later - and not then if something got under way meanwhile, but at the
 * next change (`changes`) that leaves nothing under way. Never of itself
 * before the first action, however long none comes. Returns a stop.
 */
export function afterFirstAction(run: () => void, busy: () => boolean, changes: (changed: () => void) => () => void): () => void {
  let beat: ReturnType<typeof setTimeout> | null = null;
  let ran = false;
  const look = () => {
    if (ran || beat || !useFirstAction.getState().done || busy()) return;
    beat = setTimeout(() => {
      beat = null;
      if (ran) return;
      if (busy()) return;
      ran = true;
      stop();
      run();
    }, AFTER_ACTION_MS);
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
