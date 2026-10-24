import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDocument } from "./doc/document";
import { AFTER_ACTION_MS, afterFirstAction, firstActionDone, useFirstAction, watchFirstEdit } from "./firstAction";

/** What `afterFirstAction` is handed: whether something is under way, and the changes that may end it - here set by hand. */
function world() {
  let busy = false;
  let changed = () => {};
  return {
    busy: () => busy,
    changes: (c: () => void) => {
      changed = c;
      return () => {
        changed = () => {};
      };
    },
    set(b: boolean) {
      busy = b;
      changed();
    },
  };
}

describe("what waits for the user's first action (Meno's question about keeping itself up to date)", () => {
  beforeEach(() => {
    useFirstAction.setState({ done: false });
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("is not asked before an action, however long none comes", () => {
    const run = vi.fn();
    const w = world();
    afterFirstAction(run, w.busy, w.changes);
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(run).not.toHaveBeenCalled();
  });

  it("is asked a beat after the first action, once", () => {
    const run = vi.fn();
    const w = world();
    afterFirstAction(run, w.busy, w.changes);
    firstActionDone();
    vi.advanceTimersByTime(AFTER_ACTION_MS - 1);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    w.set(true);
    w.set(false);
    firstActionDone();
    vi.advanceTimersByTime(AFTER_ACTION_MS * 10);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("never in the middle of something - the pointer still held, a guide open - but a beat after it ends", () => {
    const run = vi.fn();
    const w = world();
    w.set(true);
    afterFirstAction(run, w.busy, w.changes);
    firstActionDone();
    vi.advanceTimersByTime(AFTER_ACTION_MS * 10);
    expect(run).not.toHaveBeenCalled();
    w.set(false);
    vi.advanceTimersByTime(AFTER_ACTION_MS);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("not where something began during the beat; then at the next change that leaves nothing under way", () => {
    const run = vi.fn();
    const w = world();
    afterFirstAction(run, w.busy, w.changes);
    firstActionDone();
    vi.advanceTimersByTime(AFTER_ACTION_MS / 2);
    w.set(true);
    vi.advanceTimersByTime(AFTER_ACTION_MS * 10);
    expect(run).not.toHaveBeenCalled();
    w.set(false);
    vi.advanceTimersByTime(AFTER_ACTION_MS);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("not once stopped (Meno going)", () => {
    const run = vi.fn();
    const w = world();
    const stop = afterFirstAction(run, w.busy, w.changes);
    firstActionDone();
    stop();
    vi.advanceTimersByTime(AFTER_ACTION_MS * 10);
    expect(run).not.toHaveBeenCalled();
  });
});

describe("a workspace's first edit, as the user's first action", () => {
  beforeEach(() => useFirstAction.setState({ done: false }));

  it("counts an edit undo can take back - a structure put down - and not what Meno does to the document of itself", () => {
    const doc = createDocument({ atoms: 0, style: "" });
    watchFirstEdit(doc);
    doc.amend((s) => ({ ...s, style: "meno" }));
    doc.reset({ atoms: 0, style: "" });
    expect(useFirstAction.getState().done).toBe(false);
    doc.edit("Put down", (s) => ({ ...s, atoms: 3 }));
    expect(useFirstAction.getState().done).toBe(true);
  });
});
