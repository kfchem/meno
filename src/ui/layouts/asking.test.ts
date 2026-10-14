import { describe, expect, it, vi } from "vitest";
import { askKeys } from "./asking";
import { openIntent, undoIntent } from "../../lib/doc/shortcuts";

/**
 * A key pressed as the window passes it on: each listener in turn - the
 * question's first (the window's, before all), then the question's own
 * button or field, then the document's, then the window's after them (the
 * app's: Open, undo, the canvas's keys) - as far as it is let go.
 */
function pressed(key: string, target: object, listeners: { first: (e: any) => void; last: (e: any) => void }, behind: (e: any) => void, mods: { metaKey?: boolean; shiftKey?: boolean } = {}) {
  let stopped = false;
  const e = {
    key,
    target,
    ...mods,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      stopped = true;
    },
    stopImmediatePropagation() {
      stopped = true;
    },
  };
  listeners.first(e);
  if (!stopped) listeners.last(e);
  if (!stopped) behind(e);
  return e;
}

describe("a question asked over the window (ConfirmDiscard, NameDialog, ConsentDialog, HideHydrogensAsk)", () => {
  // (stand-ins for the question's button and the canvas behind it)
  const button = { in: "question" } as unknown as EventTarget;
  const canvas = { in: "canvas" } as unknown as EventTarget;
  const inside = (t: EventTarget | null) => t === button;

  it("keeps Ctrl/Cmd+O and undo from what is behind it: no file opened under 'Close ...?'", () => {
    const no = vi.fn();
    const keys = askKeys(inside, no);
    const acted: string[] = [];
    // (the app's own listeners, as they read a key)
    const behind = (e: any) => {
      if (openIntent(e)) acted.push("open");
      const u = undoIntent(e);
      if (u) acted.push(u);
    };
    // (with the keys on the question's button, as it opens)
    pressed("o", button, keys, behind, { metaKey: true });
    pressed("z", button, keys, behind, { metaKey: true });
    // (and with them left behind it, on the canvas)
    const away = pressed("Delete", canvas, keys, behind);
    expect(acted).toEqual([]);
    expect(away.defaultPrevented).toBe(true);
    expect(no).not.toHaveBeenCalled();
    keys.done();
    // (answered: the keys are the app's again)
    pressed("o", button, { first: () => {}, last: () => {} }, behind, { metaKey: true });
    expect(acted).toEqual(["open"]);
  });

  it("answers no to Escape, and lets Tab bring the keys to it", () => {
    const no = vi.fn();
    const keys = askKeys(inside, no);
    const behind = vi.fn();
    const esc = pressed("Escape", button, keys, behind);
    expect(no).toHaveBeenCalledTimes(1);
    expect(esc.defaultPrevented).toBe(true);
    const tab = pressed("Tab", canvas, keys, behind);
    expect(tab.defaultPrevented).toBe(false);
    expect(behind).not.toHaveBeenCalled();
    keys.done();
  });

  it("lets the keys by while its tab is not in front, and has them again, unanswered, when it is", () => {
    // ("Delete a step that is running?" left open, and another tab chosen:
    // its fields typed in, its shortcuts acting, Escape its own)
    let inFront = true;
    const no = vi.fn();
    const keys = askKeys(inside, no, () => inFront);
    inFront = false;
    const field = { in: "Settings" } as unknown as EventTarget;
    const acted: string[] = [];
    const behind = (e: any) => {
      if (openIntent(e)) acted.push("open");
      const u = undoIntent(e);
      if (u) acted.push(u);
      if (!e.metaKey) acted.push(e.key);
    };
    const typed = pressed("a", field, keys, behind);
    pressed("o", field, keys, behind, { metaKey: true });
    pressed("z", field, keys, behind, { metaKey: true });
    pressed("Escape", field, keys, behind);
    expect(typed.defaultPrevented).toBe(false);
    expect(acted).toEqual(["a", "open", "undo", "Escape"]);
    expect(no).not.toHaveBeenCalled();
    // (its tab in front again: the question waiting there has the keys)
    inFront = true;
    acted.length = 0;
    const away = pressed("Delete", canvas, keys, behind);
    expect(away.defaultPrevented).toBe(true);
    expect(acted).toEqual([]);
    pressed("Escape", canvas, keys, behind);
    expect(no).toHaveBeenCalledTimes(1);
    keys.done();
  });

  it("gives the keys to the question in the tab in front, though one in a tab behind was asked after it", () => {
    let front = "A";
    const inA = vi.fn();
    const inB = vi.fn();
    const b = askKeys((t) => t === canvas, inB, () => front === "B");
    const a = askKeys((t) => t === button, inA, () => front === "A");
    const both = { first: (e: any) => (b.first(e), a.first(e)), last: (e: any) => (b.last(e), a.last(e)) };
    front = "B";
    pressed("Escape", canvas, both, () => {});
    expect(inB).toHaveBeenCalledTimes(1);
    expect(inA).not.toHaveBeenCalled();
    front = "A";
    pressed("Escape", button, both, () => {});
    expect(inA).toHaveBeenCalledTimes(1);
    expect(inB).toHaveBeenCalledTimes(1);
    a.done();
    b.done();
  });

  it("gives the keys to the question asked last, on top of another", () => {
    const under = vi.fn();
    const over = vi.fn();
    const first = askKeys((t) => t === button, under);
    const second = askKeys((t) => t === canvas, over);
    // (the window's listeners run in the order they were added: the one under first)
    const both = { first: (e: any) => (first.first(e), second.first(e)), last: (e: any) => (first.last(e), second.last(e)) };
    pressed("Escape", canvas, both, () => {});
    expect(over).toHaveBeenCalledTimes(1);
    expect(under).not.toHaveBeenCalled();
    second.done();
    pressed("Escape", button, { first: first.first, last: first.last }, () => {});
    expect(under).toHaveBeenCalledTimes(1);
    first.done();
  });
});
