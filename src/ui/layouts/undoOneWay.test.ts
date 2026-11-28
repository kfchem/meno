import { describe, expect, it } from "vitest";
import { createDocument } from "../../lib/doc/document";
import { editFromMenu } from "../../lib/doc/editMenu";
import { holdSteps, moveSteps, takeSteps } from "../../lib/doc/takeSteps";
import { chooseStep, undoClick } from "./undoHistory";

/** A document of a count, three steps made on it. */
function three() {
  let t = 0;
  const doc = createDocument({ n: 0 }, { now: () => (t += 10_000) });
  for (const label of ["add atom", "add bond", "draw chain"]) doc.edit(label, (s) => ({ n: s.n + 1 }));
  return doc;
}

const page = { tagName: "DIV" };
const noField = () => false;

describe("steps are taken one way, whichever asks for them", () => {
  it("one back or forward as undo and redo take it, more as one change; none past the ends", () => {
    const doc = three();
    expect(takeSteps(doc, -1)).toBe("taken");
    expect(doc.getState()).toEqual({ n: 2 });
    expect(takeSteps(doc, -2)).toBe("taken");
    expect(doc.getState()).toEqual({ n: 0 });
    expect(takeSteps(doc, -1)).toBe("nothing");
    expect(takeSteps(doc, 3)).toBe("taken");
    expect(doc.getState()).toEqual({ n: 3 });
    expect(takeSteps(doc, 0)).toBe("nothing");
    expect(takeSteps(undefined, -1)).toBe("nothing");
  });

  it("asks the page's hold first - the keys, Edit > Undo, the title bar's Undo and its history alike - and takes nothing it holds", () => {
    const doc = three();
    const asked: number[] = [];
    const off = holdSteps(doc, (n) => (asked.push(n), true));
    // (the keys and the app menu: editFromMenu; the button: undoClick; the list: chooseStep)
    expect(takeSteps(doc, -1)).toBe("held");
    expect(editFromMenu("undo", { active: page, doc, field: noField })).toBe("held");
    expect(editFromMenu("redo", { active: page, doc, field: noField })).toBe("held");
    expect(undoClick({ active: page, doc, field: noField })).toBe("held");
    expect(chooseStep(doc, -3)).toBe(false);
    expect(asked).toEqual([-1, -1, 1, -1, -3]);
    expect(doc.getState()).toEqual({ n: 3 });
    // (the page gone: taken as before)
    off();
    expect(chooseStep(doc, -3)).toBe(true);
    expect(doc.getState()).toEqual({ n: 0 });
  });

  it("takes them where the hold lets them go, and the hold of another document is not asked", () => {
    const doc = three();
    const other = three();
    const asked: number[] = [];
    holdSteps(doc, (n) => (asked.push(n), false));
    holdSteps(other, () => true);
    expect(chooseStep(doc, -2)).toBe(true);
    expect(asked).toEqual([-2]);
    expect(doc.getState()).toEqual({ n: 1 });
  });

  it("moved without asking once the page has asked and been answered", () => {
    const doc = three();
    holdSteps(doc, () => true);
    expect(moveSteps(doc, -2)).toBe(true);
    expect(doc.getState()).toEqual({ n: 1 });
    expect(moveSteps(doc, 1)).toBe(true);
    expect(doc.getState()).toEqual({ n: 2 });
  });

  it("looks ahead to where they would come, as many as are asked", () => {
    const doc = three();
    expect(doc.peek(-2)).toEqual({ n: 1 });
    expect(doc.peek(-3)).toEqual({ n: 0 });
    expect(doc.peek(-4)).toBeUndefined();
    doc.travel(-3);
    expect(doc.peek(2)).toEqual({ n: 2 });
    expect(doc.peek(0)).toBeUndefined();
  });
});
