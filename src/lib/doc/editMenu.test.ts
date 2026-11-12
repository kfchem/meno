import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EDIT_MENU_EVENT, editFromMenu, editMenuState, fieldHasUndo, tellEditMenu, watchEditMenu } from "./editMenu";

const input = { tagName: "INPUT" };
const textarea = { tagName: "TEXTAREA" };
const body = { tagName: "BODY" };

/** A document that has `steps` to undo and `redone` to redo, and counts what it was asked. */
function doc(steps: number, redone = 0) {
  const asked: string[] = [];
  return {
    asked,
    undo: () => (asked.push("undo"), steps > 0),
    redo: () => (asked.push("redo"), redone > 0),
  };
}

describe("a field the browser's own undo belongs to", () => {
  it("is a single-line input, a select, rich text, or a text box that says it keeps its words apart; not a text box the document backs, nor the page", () => {
    expect(fieldHasUndo(input)).toBe(true);
    expect(fieldHasUndo({ tagName: "SELECT" })).toBe(true);
    expect(fieldHasUndo({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(fieldHasUndo({ tagName: "TEXTAREA", dataset: { nativeUndo: "" } })).toBe(true);
    expect(fieldHasUndo(textarea)).toBe(false);
    expect(fieldHasUndo(body)).toBe(false);
    expect(fieldHasUndo(null)).toBe(false);
  });
});

describe("the menu's Undo and Redo do what the keys do", () => {
  it("in a field of the browser's own undo, undo or redo that field - never the document's", () => {
    const d = doc(3, 2);
    const field = vi.fn(() => true);
    expect(editFromMenu("undo", { active: input, doc: d, field })).toBe("field");
    expect(editFromMenu("redo", { active: input, doc: d, field })).toBe("field");
    expect(field.mock.calls.map((c) => (c as unknown[])[0])).toEqual(["undo", "redo"]);
    expect(d.asked).toEqual([]);
    // (the browser having none to take back: nothing)
    expect(editFromMenu("undo", { active: input, doc: d, field: () => false })).toBe("nothing");
  });

  it("elsewhere, take a step of the active document back or forward - a text box the document backs included, as its keys do", () => {
    const d = doc(3, 2);
    const field = vi.fn(() => true);
    expect(editFromMenu("undo", { active: body, doc: d, field })).toBe("document");
    expect(editFromMenu("redo", { active: textarea, doc: d, field })).toBe("document");
    expect(d.asked).toEqual(["undo", "redo"]);
    expect(field).not.toHaveBeenCalled();
    // (nothing to go back to, or no document in the tab: nothing - and no step of any other asked)
    const empty = doc(0, 0);
    expect(editFromMenu("undo", { active: body, doc: empty, field })).toBe("nothing");
    expect(editFromMenu("redo", { active: body, doc: empty, field })).toBe("nothing");
    expect(empty.asked).toEqual(["undo", "redo"]);
    expect(editFromMenu("undo", { active: body, doc: undefined, field })).toBe("nothing");
  });

  it("is greyed where the document has no step to go that way - and on in a field of the browser's own undo, whose history is not known here", () => {
    expect(editMenuState({ undoDepth: 2, redoDepth: 0 }, body)).toEqual({ undo: true, redo: false });
    expect(editMenuState({ undoDepth: 0, redoDepth: 1 }, body)).toEqual({ undo: false, redo: true });
    expect(editMenuState({ undoDepth: 0, redoDepth: 0 }, body)).toEqual({ undo: false, redo: false });
    expect(editMenuState(null, body)).toEqual({ undo: false, redo: false });
    expect(editMenuState({ undoDepth: 0, redoDepth: 0 }, input)).toEqual({ undo: true, redo: true });
    expect(editMenuState(null, input)).toEqual({ undo: true, redo: true });
  });
});

describe("the page and the app menu, between them", () => {
  /** A stand-in for Tauri's `listen`: the handler it was given, and what unlistening did. */
  function listener() {
    let handler: ((e: { payload: unknown }) => void) | undefined;
    const unlisten = vi.fn();
    let resolve!: (f: () => void) => void;
    const hear = vi.fn((event: string, h: (e: { payload: unknown }) => void) => {
      expect(event).toBe(EDIT_MENU_EVENT);
      handler = h;
      return new Promise<() => void>((r) => (resolve = r));
    });
    return { hear: hear as never, send: (payload: unknown) => handler!({ payload }), unlisten, ready: () => resolve(unlisten) };
  }

  it("runs each command the menu sends and no other payload", () => {
    const l = listener();
    const run = vi.fn();
    watchEditMenu(run, l.hear);
    l.send("undo");
    l.send("redo");
    l.send("cut");
    l.send(undefined);
    l.send({ command: "undo" });
    expect(run.mock.calls).toEqual([["undo"], ["redo"]]);
  });

  it("stops listening when told to, whether the listening was ready yet or not", async () => {
    const early = listener();
    const stopEarly = watchEditMenu(vi.fn(), early.hear);
    early.ready();
    await Promise.resolve();
    stopEarly();
    expect(early.unlisten).toHaveBeenCalledTimes(1);
    const late = listener();
    const stopLate = watchEditMenu(vi.fn(), late.hear);
    stopLate();
    late.ready();
    await Promise.resolve();
    await Promise.resolve();
    expect(late.unlisten).toHaveBeenCalledTimes(1);
  });

  it("tells the menu which items can do anything, under the command's name; a menu that cannot be told leaves it as it was", async () => {
    const send = vi.fn(() => Promise.resolve(undefined));
    tellEditMenu({ undo: true, redo: false }, send as never);
    expect(send).toHaveBeenCalledWith("edit_menu_state", { undo: true, redo: false });
    // (refused: nothing thrown, nothing unhandled)
    const refused = vi.fn(() => Promise.reject(new Error("no such command")));
    expect(() => tellEditMenu({ undo: false, redo: false }, refused as never)).not.toThrow();
    await Promise.resolve();
  });
});

/** Whether a rejection the code under test was given goes unhandled, once the queue has been let run. */
async function unhandledAfter(run: () => void): Promise<unknown[]> {
  const seen: unknown[] = [];
  const note = (reason: unknown) => seen.push(reason);
  process.on("unhandledRejection", note);
  try {
    run();
    await new Promise((r) => setTimeout(r, 10));
  } finally {
    process.off("unhandledRejection", note);
  }
  return seen;
}

describe("a menu that is not there", () => {
  it("leaves the page as it was: listening or telling it refused is no unhandled rejection", async () => {
    const seen = await unhandledAfter(() => {
      watchEditMenu(vi.fn(), (() => Promise.reject(new Error("no event system"))) as never);
      tellEditMenu({ undo: true, redo: true }, (() => Promise.reject(new Error("no such command"))) as never);
    });
    expect(seen).toEqual([]);
  });
});

describe("the names the page and the app share with the menu's Rust side (src-tauri/src/editmenu.rs)", () => {
  const rust = readFileSync(join(process.cwd(), "src-tauri/src/editmenu.rs"), "utf8");
  const lib = readFileSync(join(process.cwd(), "src-tauri/src/lib.rs"), "utf8");

  it("the event the page listens for is the one the menu emits", () => {
    // (the literal, not only the constant: the page and the menu must agree on the name itself)
    expect(EDIT_MENU_EVENT).toBe("edit-menu");
    const emitted = [...rust.matchAll(/\.emit_to\(\s*"main"\s*,\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(emitted).toEqual([EDIT_MENU_EVENT]);
  });

  it("the commands the page is told are the ones the menu sends", () => {
    const sent = [...rust.matchAll(/=>\s*Some\("([^"]+)"\)/g)].map((m) => m[1]).sort();
    expect(sent).toEqual(["redo", "undo"]);
  });

  it("the command the page tells the menu its state by is one the app registers, with the arguments the page sends", () => {
    const name = [...tellSource().matchAll(/send\("([^"]+)"/g)].map((m) => m[1]);
    expect(name).toEqual(["edit_menu_state"]);
    expect(rust).toMatch(/pub fn edit_menu_state\(app: AppHandle, undo: bool, redo: bool\)/);
    expect(lib).toContain("editmenu::edit_menu_state");
  });
});

/** The source of `tellEditMenu`, for the command name it sends under. */
function tellSource(): string {
  return readFileSync(join(process.cwd(), "src/lib/doc/editMenu.ts"), "utf8");
}
