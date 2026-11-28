import { describe, expect, it, vi } from "vitest";
import * as editMenu from "../../lib/doc/editMenu";
import { changeSet, createDocument } from "../../lib/doc/document";
import { LONG_PRESSES } from "../features/Workspace/constants";
import { longPressMs } from "../features/Workspace/longPress";
import { canUndo, chooseStep, clickDoes, hasHistory, historyRows, isLit, LIST_ROWS, listHeight, pressHold, ROW_PX, stepText, undoClick, undoTip, type Timers } from "./undoHistory";

/** A document of a count, with `labels` made as steps one after another, and a turn of a conversation last where `talked`. */
function drawn(labels: string[], talked = false) {
  let t = 0;
  const doc = createDocument({ n: 0 }, { now: () => (t += 10_000) });
  for (const label of labels) doc.edit(label, (s) => ({ n: s.n + 1 }));
  if (talked)
    doc.actAs("conversation", changeSet("turn", "a conversation, by a test model"), () => {
      doc.edit("add structure", (s) => ({ n: s.n + 1 }));
      return undefined;
    });
  return doc;
}
// (the way Edit > Undo and the keys take a step, watched: the click must go by it, not a second way)
vi.mock("../../lib/doc/editMenu", async (actual) => {
  const real = await actual<typeof import("../../lib/doc/editMenu")>();
  return { ...real, editFromMenu: vi.fn(real.editFromMenu) };
});

const page = { tagName: "DIV" };
const field = { tagName: "INPUT", type: "text" };
const noField = () => false;


describe("Undo in the title bar: a click", () => {
  it("takes exactly one step back in the tab in front, by the way Edit > Undo and the keys take it", () => {
    const doc = drawn(["add atom", "add bond", "draw chain"]);
    const way = vi.mocked(editMenu.editFromMenu);
    way.mockClear();
    expect(undoClick({ active: page, doc, field: noField })).toBe("document");
    expect(way).toHaveBeenCalledTimes(1);
    expect(way.mock.calls[0][0]).toBe("undo");
    expect(doc.getState()).toEqual({ n: 2 });
    expect(doc.history()).toMatchObject({ undoLabel: "add bond", redoLabel: "draw chain" });
  });

  it("in a field that keeps its own undo, takes the field's step, and leaves the document as it is", () => {
    const doc = drawn(["add atom"]);
    const asked: string[] = [];
    expect(undoClick({ active: field, doc, field: (c) => (asked.push(c), true) })).toBe("field");
    expect(asked).toEqual(["undo"]);
    expect(doc.getState()).toEqual({ n: 1 });
  });

  it("is faint, and does nothing, with nothing to take back - and on in a field, whose steps are not known here", () => {
    const doc = drawn([]);
    expect(canUndo(doc, page)).toBe(false);
    expect(canUndo(undefined, page)).toBe(false);
    expect(undoClick({ active: page, doc, field: noField })).toBe("nothing");
    expect(canUndo(drawn(["add atom"]), page)).toBe(true);
    expect(canUndo(doc, field)).toBe(true);
  });

  it("is told by its tip: what it is, the next step back, its keys, and the history held under it", () => {
    expect(undoTip(drawn(["add atom", "add bond"]), page, true)).toBe("Undo Add bond (⌘Z)\nHold for the history");
    expect(undoTip(drawn([]), page, false)).toBe("Nothing to undo");
    expect(undoTip(drawn(["add atom"]), field, true)).toBe("Undo (⌘Z)\nHold for the history");
  });
});

describe("Undo held, or right-clicked", () => {
  /** Timers moved by hand. */
  function clock(): Timers & { pass: (ms: number) => void } {
    let now = 0;
    const due = new Map<number, { at: number; run: () => void }>();
    let next = 1;
    return {
      set: (run, ms) => (due.set(next, { at: now + ms, run }), next++),
      clear: (id) => void due.delete(id),
      pass(ms) {
        now += ms;
        for (const [id, d] of [...due]) {
          if (d.at > now) continue;
          due.delete(id);
          d.run();
        }
      },
    };
  }

  it("waits Meno's long press, and opens the history then - not before; the click that ends that press takes no step", () => {
    const timers = clock();
    const open = vi.fn();
    const press = pressHold({ wait: longPressMs, open, timers });
    press.down();
    timers.pass(LONG_PRESSES.normal - 1);
    expect(open).not.toHaveBeenCalled();
    timers.pass(1);
    expect(open).toHaveBeenCalledTimes(1);
    expect(press.click()).toBe(false);
    // (the next press, a short one, is a click again)
    press.down();
    expect(press.click()).toBe(true);
  });

  it("is a click, never the history, when let go of sooner", () => {
    const timers = clock();
    const open = vi.fn();
    const press = pressHold({ wait: () => 260, open, timers });
    press.down();
    timers.pass(100);
    expect(press.click()).toBe(true);
    timers.pass(1000);
    expect(open).not.toHaveBeenCalled();
  });

  it("is nothing once moved off the button", () => {
    const timers = clock();
    const open = vi.fn();
    const press = pressHold({ wait: () => 260, open, timers });
    press.down();
    timers.pass(200);
    press.cancel();
    timers.pass(1000);
    expect(open).not.toHaveBeenCalled();
  });

  it("opens at once on a right-click, where there is a history to show", () => {
    const open = vi.fn();
    const press = pressHold({ wait: () => 260, open, timers: clock() });
    press.rightClick(false);
    expect(open).not.toHaveBeenCalled();
    press.rightClick(true);
    expect(open).toHaveBeenCalledTimes(1);
    expect(hasHistory(drawn([]))).toBe(false);
    expect(hasHistory(drawn(["add atom"]))).toBe(true);
  });
});

describe("the history under Undo", () => {
  it("lists the steps to take back newest first under now, and those taken back above it, the farthest at the top", () => {
    const doc = drawn(["add atom", "add bond", "draw chain", "delete atom"]);
    doc.undo();
    expect(historyRows(doc.steps())).toEqual([
      { offset: 1, text: "Delete atom", forward: true },
      { offset: 0, text: "Now", forward: false },
      { offset: -1, text: "Draw chain", forward: false },
      { offset: -2, text: "Add bond", forward: false },
      { offset: -3, text: "Add atom", forward: false },
    ]);
  });

  it("says a step made by a conversation as that conversation's", () => {
    const doc = drawn(["add atom"], true);
    expect(historyRows(doc.steps())[1].text).toBe("A conversation, by a test model");
    expect(stepText({ label: "add bond" })).toBe("Add bond");
  });

  it("lights every step from now to the one pointed at, and no other", () => {
    const lit = [-1, -2, -3, 1, 2].filter((o) => isLit(o, -2));
    expect(lit).toEqual([-1, -2]);
    expect([-1, 1, 2, 3].filter((o) => isLit(o, 2))).toEqual([1, 2]);
    expect(isLit(-1, null)).toBe(false);
    expect(isLit(0, -2)).toBe(false);
  });

  it("goes to a step N back in one change, the state exactly as N undos leave it", () => {
    const doc = drawn(["add atom", "add bond", "draw chain", "delete atom"]);
    const told = vi.fn();
    doc.subscribe(told);
    expect(chooseStep(doc, -3)).toBe(true);
    expect(told).toHaveBeenCalledTimes(1);
    const keys = drawn(["add atom", "add bond", "draw chain", "delete atom"]);
    for (let k = 0; k < 3; k++) keys.undo();
    expect(doc.getState()).toEqual(keys.getState());
    expect(doc.history()).toEqual(keys.history());
  });

  it("goes forward to a step taken back, in one change", () => {
    const doc = drawn(["add atom", "add bond", "draw chain"]);
    doc.travel(-3);
    const told = vi.fn();
    doc.subscribe(told);
    expect(chooseStep(doc, 2)).toBe(true);
    expect(told).toHaveBeenCalledTimes(1);
    expect(doc.getState()).toEqual({ n: 2 });
    expect(historyRows(doc.steps()).map((r) => r.text)).toEqual(["Draw chain", "Now", "Add bond", "Add atom"]);
  });

  it("changes nothing for now itself, or with no tab", () => {
    const doc = drawn(["add atom"]);
    const told = vi.fn();
    doc.subscribe(told);
    expect(chooseStep(doc, 0)).toBe(false);
    expect(chooseStep(undefined, -1)).toBe(false);
    expect(told).not.toHaveBeenCalled();
  });

  it("is the history of the tab in front: another tab, its own steps", () => {
    const one = drawn(["add atom", "add bond"]);
    const two = drawn(["add text"]);
    expect(historyRows(one.steps()).map((r) => r.text)).toEqual(["Now", "Add bond", "Add atom"]);
    expect(historyRows(two.steps()).map((r) => r.text)).toEqual(["Now", "Add text"]);
    chooseStep(two, -1);
    expect(one.getState()).toEqual({ n: 2 });
  });
});

describe("Undo faint, with nothing to take back", () => {
  it("says so in its tip, and offers a hold only where there are steps to redo", () => {
    expect(undoTip(drawn([]), page, true)).toBe("Nothing to undo");
    expect(undoTip(undefined, page, true)).toBe("Nothing to undo");
    const back = drawn(["add atom"]);
    back.undo();
    expect(undoTip(back, page, true)).toBe("Nothing to undo\nHold for the history");
  });
});

describe("a click on Undo while its history is open", () => {
  it("shuts the history and takes no step; the click ending a hold takes none; any other is a step back", () => {
    expect(clickDoes({ held: false, open: true })).toBe("shut");
    expect(clickDoes({ held: true, open: true })).toBe("shut");
    expect(clickDoes({ held: true, open: false })).toBe("nothing");
    expect(clickDoes({ held: false, open: false })).toBe("undo");
  });
});

describe("a long history", () => {
  it("is shown at most some twelve rows high, and scrolls beyond them", () => {
    expect(LIST_ROWS).toBe(12);
    const most = listHeight(2000, 40);
    expect(most).toBeGreaterThanOrEqual(LIST_ROWS * ROW_PX);
    expect(most).toBeLessThan((LIST_ROWS + 2) * ROW_PX);
  });

  it("never reaches past the window's lower edge", () => {
    expect(listHeight(300, 40)).toBe(300 - 40 - 8);
    expect(listHeight(30, 40)).toBe(0);
  });
});
