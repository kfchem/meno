/**
 * Document store: the undoable, saveable state of one tab.
 *
 * Meno's views currently keep their content in their own way (the 2D editor in
 * a Zustand store, the workflow editor in component state), which makes undo a
 * per-view affair and keeps a tab's content out of reach of other views. A
 * document is the other half of that split:
 *
 * - **document state** — atoms and bonds, text, a node graph: undoable, saved,
 *   readable by anything that has the tab;
 * - **ephemeral state** — hover, drag previews, camera, edit buffers: owned by
 *   the view, never undone, never saved.
 *
 * History is kept as snapshots. Updates are immutable, so unchanged parts are
 * shared between snapshots rather than copied, which keeps this cheap for the
 * sizes Meno deals with and avoids the bug surface of inverse operations.
 *
 * Framework-agnostic on purpose: `subscribe` matches React's
 * `useSyncExternalStore`, but nothing here imports React.
 */

/** Successive edits are merged into one undo step for this long by default. */
export const DEFAULT_COALESCE_MS = 500;
/**
 * Undo steps kept per document, the oldest dropped first (the maintainer,
 * 2026-10-13: a thousand; it was a hundred, which a long session of
 * drawing ran past).
 */
export const DEFAULT_HISTORY_LIMIT = 1000;
/**
 * What the history of a document that says what its steps cost
 * (`DocumentOptions.cost`) holds at most, in what they cost - for a
 * workspace, the atoms and bonds its steps copy: about 100 MB (the
 * maintainer, 2026-10-13). A drawing of a few thousand atoms keeps its
 * thousand steps; a stack of 28,000 about 430. The oldest go first.
 */
export const DEFAULT_HISTORY_BUDGET = 25_000_000;

export type EditMeta = {
  /**
   * Edits sharing a key, close enough in time, collapse into a single undo
   * step — a drag or a run of typing should not need one undo per frame.
   */
  coalesceKey?: string;
  /** Overrides {@link DEFAULT_COALESCE_MS} for this edit. */
  coalesceWithinMs?: number;
};

/**
 * An edit that is part of a gesture - a drag, a turn - its key naming the
 * gesture, so that no other edit shares it: one undo step for the whole
 * gesture however long it takes. A drag held still a while, to line
 * something up, is still one step (with the window, each pause of more
 * than DEFAULT_COALESCE_MS began a step of its own).
 */
export function gestureStep(coalesceKey: string): EditMeta {
  return { coalesceKey, coalesceWithinMs: Infinity };
}

export type HistoryInfo = {
  undoDepth: number;
  redoDepth: number;
  /** What undo would take back, for menus and tooltips. */
  undoLabel?: string;
  /** What redo would put back. */
  redoLabel?: string;
  dirty: boolean;
};

export interface DocumentStore<T> {
  getState(): T;
  /** Notifies on every state change, including undo and redo. */
  subscribe(listener: () => void): () => void;
  /**
   * Applies `updater` and records one history step. Returns false when the
   * updater returns the state unchanged (no step, no notification).
   */
  edit(label: string, updater: (state: T) => T, meta?: EditMeta): boolean;
  undo(): boolean;
  redo(): boolean;
  /**
   * Takes back the step a gesture made (its `coalesceKey`), as if it had
   * never been: a drag let go of by Escape. Nothing is left to redo. False
   * where the step on top is not that gesture's - it made none.
   */
  drop(coalesceKey: string): boolean;
  /** The state an undo (or a redo) would come to, without coming to it: none where there is nothing to undo (to redo). */
  peek(direction: "undo" | "redo"): T | undefined;
  /** Replaces the content and forgets the history, e.g. after opening a file. */
  reset(state: T, label?: string): void;
  /**
   * Applies `updater` to every state the history holds - past, present,
   * future and the saved one - with no step of its own: for what is learnt
   * of the document rather than done to it, such as a reader's findings in
   * a file it was opened from, arriving after it opened. Undo does not take
   * it back, and it leaves the document as saved as it was - unless
   * `unsaved`: what is to be kept when the document is next saved, a run
   * under way, say, which undo still does not take back.
   */
  amend(updater: (state: T) => T, meta?: { unsaved?: boolean }): void;
  /**
   * Marks the current state as the saved one - or `state`, the one that
   * was written, where the document may have changed while it was: what
   * changed meanwhile is then still unsaved.
   */
  markSaved(state?: T): void;
  history(): HistoryInfo;
  /**
   * Whether the present state was gone back or forward to - an undo, a
   * redo, a gesture dropped - rather than made by an edit: what was on the
   * page may have moved without the pointer moving.
   */
  travelled(): boolean;
}

type Entry<T> = {
  state: T;
  /** Describes the edit that produced this state. */
  label: string;
  coalesceKey?: string;
  at: number;
  /** What keeping it costs beyond the step before it (`DocumentOptions.cost`). */
  cost?: number;
};

export type DocumentOptions<T = unknown> = {
  limit?: number;
  /** Injectable clock, so coalescing can be tested without waiting. */
  now?: () => number;
  /**
   * What follows from an edit, made part of it - one step to undo: given
   * the state it made and the one before it (a workspace's sets growing to
   * keep a structure drawn on inside them).
   */
  settle?: (next: T, before: T) => T;
  /**
   * What keeping a state in the history costs beyond the state before it
   * (none before the first): what it holds that that one does not share.
   * Given, the history holds no more than `budget` of it, the oldest steps
   * dropped first - never one to redo, nor the last one to undo.
   */
  cost?: (state: T, before: T | undefined) => number;
  /** How much the history may hold, in what `cost` counts; DEFAULT_HISTORY_BUDGET. */
  budget?: number;
};

/** Each state an amend replaced, and what it became (`DocumentStore.amend`). */
const amendedTo = new WeakMap<object, unknown>();

/**
 * What a state has become through amends - the state itself if none has
 * replaced it: something that knows the document by its states (a journal
 * of turns in 3D) finds them again after an amend, which replaces every
 * state it changes.
 */
export function amendedState<T>(state: T): T {
  let s: unknown = state;
  while (typeof s === "object" && s !== null && amendedTo.has(s)) s = amendedTo.get(s);
  return s as T;
}

export function createDocument<T>(
  initial: T,
  options: DocumentOptions<T> = {},
): DocumentStore<T> {
  const limit = Math.max(1, options.limit ?? DEFAULT_HISTORY_LIMIT);
  const now = options.now ?? (() => Date.now());

  let past: Entry<T>[] = [];
  let present: Entry<T> = { state: initial, label: "open", at: now() };
  let future: Entry<T>[] = [];
  let savedState: T = initial;
  let travelled = false;

  // (the history kept within what it may hold, where its steps say what
  // they cost: the oldest dropped first, down to one step to undo; the
  // steps to redo kept whole)
  const budget = options.budget ?? DEFAULT_HISTORY_BUDGET;
  const costOf = (e: Entry<T>, before: Entry<T> | undefined) => (e.cost ??= options.cost!(e.state, before?.state));
  const bound = () => {
    if (!options.cost) return;
    let held = costOf(past[0] ?? present, undefined);
    for (let i = 1; i < past.length; i++) held += costOf(past[i], past[i - 1]);
    present.cost = undefined;
    if (past.length) held += costOf(present, past[past.length - 1]);
    let drop = 0;
    while (held > budget && past.length - drop > 1) {
      held -= past[drop].cost ?? 0;
      drop++;
    }
    if (drop) past = past.slice(drop);
  };

  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };

  return {
    getState: () => present.state,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    edit(label, updater, meta = {}) {
      let next = updater(present.state);
      if (Object.is(next, present.state)) return false;
      if (options.settle) next = options.settle(next, present.state);

      const at = now();
      const window = meta.coalesceWithinMs ?? DEFAULT_COALESCE_MS;
      const coalesce =
        meta.coalesceKey != null &&
        present.coalesceKey === meta.coalesceKey &&
        at - present.at <= window;

      travelled = false;
      if (coalesce) {
        // Keep the step that is already on the stack and move its end point,
        // so undo jumps back to before the whole gesture.
        present = { state: next, label, coalesceKey: meta.coalesceKey, at };
        bound();
      } else {
        past.push(present);
        if (past.length > limit) past = past.slice(past.length - limit);
        present = { state: next, label, coalesceKey: meta.coalesceKey, at };
        bound();
      }
      future = [];
      notify();
      return true;
    },

    undo() {
      const previous = past.pop();
      if (!previous) return false;
      future.unshift(present);
      present = previous;
      travelled = true;
      notify();
      return true;
    },

    drop(coalesceKey) {
      if (present.coalesceKey !== coalesceKey || !past.length) return false;
      present = past.pop()!;
      travelled = true;
      notify();
      return true;
    },

    peek(direction) {
      return direction === "undo" ? past[past.length - 1]?.state : future[0]?.state;
    },

    redo() {
      const next = future.shift();
      if (!next) return false;
      past.push(present);
      present = next;
      travelled = true;
      notify();
      return true;
    },

    reset(state, label = "open") {
      past = [];
      future = [];
      present = { state, label, at: now() };
      savedState = state;
      travelled = false;
      notify();
    },

    amend(updater, meta = {}) {
      const was = present.state;
      // (one state held twice - the saved one is one of the history's - amended once, so it is still the same state)
      const amended = new Map<T, T>();
      const next = (state: T) => {
        if (!amended.has(state)) {
          const to = updater(state);
          amended.set(state, to);
          if (typeof state === "object" && state !== null && !Object.is(to, state)) amendedTo.set(state, to);
        }
        return amended.get(state)!;
      };
      const map = (e: Entry<T>): Entry<T> => {
        const state = next(e.state);
        return Object.is(state, e.state) ? e : { ...e, state };
      };
      past = past.map(map);
      future = future.map(map);
      present = map(present);
      // (the saved state amended too - but not with what is not saved yet)
      if (!meta.unsaved) savedState = next(savedState);
      if (!Object.is(present.state, was)) {
        travelled = false;
        notify();
      }
    },

    markSaved(state) {
      savedState = state ?? present.state;
      notify();
    },

    travelled: () => travelled,

    history() {
      return {
        undoDepth: past.length,
        redoDepth: future.length,
        // The label of a step describes the edit that produced it: undo takes
        // back the present one, redo puts back the first future one.
        undoLabel: past.length > 0 ? present.label : undefined,
        redoLabel: future.length > 0 ? future[0].label : undefined,
        dirty: !Object.is(present.state, savedState),
      };
    },
  };
}
