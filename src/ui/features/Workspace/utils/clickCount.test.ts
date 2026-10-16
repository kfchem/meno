import { describe, expect, it } from "vitest";
import { clickClock, clickEditHeldOff, clickStillEdits, doubleClickedSince, noteClick, notePress, pressOnBond, pressNumber, pressOnEmpty } from "./clickCount";

describe("clickCount", () => {
  it("tells a double-click's second click that came after a moment", () => {
    const since = clickClock();
    noteClick(1);
    expect(doubleClickedSince(since)).toBe(false);
    noteClick(2);
    expect(doubleClickedSince(since)).toBe(true);
  });

  it("does not count a double-click from before the moment", () => {
    noteClick(2);
    const since = clickClock() + 1;
    expect(doubleClickedSince(since)).toBe(false);
  });
});

describe("a click on an atom, waiting to edit its label", () => {
  it("edits nothing once a press has come since: the view moved, say, or a bond clicked", async () => {
    notePress();
    await new Promise((r) => setTimeout(r, 2));
    const since = clickClock();
    expect(clickStillEdits(since)).toBe(true);
    await new Promise((r) => setTimeout(r, 2));
    notePress();
    expect(clickStillEdits(since)).toBe(false);
  });

  it("edits nothing after the second click of a double-click", () => {
    const since = clickClock();
    noteClick(2);
    expect(clickStillEdits(since)).toBe(false);
  });
});

describe("a click's label edit, its time come", () => {
  const idle = { extend: { active: false }, moveDrag: { active: false }, labelEdit: { active: false } };
  it("is held off by a label typed over another atom since, as by a bond drawn or an atom moved", () => {
    expect(clickEditHeldOff(idle)).toBe(false);
    expect(clickEditHeldOff({ ...idle, labelEdit: { active: true } })).toBe(true);
    expect(clickEditHeldOff({ ...idle, extend: { active: true } })).toBe(true);
    expect(clickEditHeldOff({ ...idle, moveDrag: { active: true } })).toBe(true);
  });
});

describe("presses on empty space", () => {
  it("count a second soon after a first, near it, as a double-click's", () => {
    const first = { t: 0, x: 100, y: 100, count: 1 };
    expect(pressOnEmpty(null, { t: 0, x: 0, y: 0 }, 500)).toBe(1);
    expect(pressOnEmpty(first, { t: 300, x: 103, y: 102 }, 500)).toBe(2);
    // (too late, or too far)
    expect(pressOnEmpty(first, { t: 600, x: 100, y: 100 }, 500)).toBe(1);
    expect(pressOnEmpty(first, { t: 300, x: 120, y: 100 }, 500)).toBe(1);
  });

  it("count a third as a first: three ask for nothing two did not", () => {
    expect(pressOnEmpty({ t: 0, x: 100, y: 100, count: 2 }, { t: 200, x: 100, y: 100 }, 500)).toBe(1);
  });
});

describe("a press on a bond", () => {
  it("is the second of a double-click on the same bond soon after a first, which begins no long press; else a first", () => {
    const first = { id: 7, t: 0, count: 1 };
    expect(pressOnBond(null, { id: 7, t: 0 }, 500)).toBe(1);
    expect(pressOnBond(first, { id: 7, t: 300 }, 500)).toBe(2);
    expect(pressOnBond(first, { id: 7, t: 600 }, 500)).toBe(1);
    expect(pressOnBond(first, { id: 8, t: 300 }, 500)).toBe(1);
    // (a third begins anew)
    expect(pressOnBond({ id: 7, t: 300, count: 2 }, { id: 7, t: 450 }, 500)).toBe(1);
  });
});


describe("pressNumber", () => {
  it("is 1, 2, then 1 again for three quick presses on an atom: a third click starts nothing", () => {
    let last = { id: null as number | null, t: 0, count: 0 };
    const seen: number[] = [];
    for (const t of [1000, 1100, 1200, 1300]) {
      const n = pressNumber(last, 7, t, 400);
      seen.push(n);
      last = { id: 7, t, count: n };
    }
    expect(seen).toEqual([1, 2, 1, 2]);
  });

  it("is 1 for another atom, or after the double-click's time", () => {
    expect(pressNumber({ id: 7, t: 1000, count: 1 }, 8, 1100, 400)).toBe(1);
    expect(pressNumber({ id: 7, t: 1000, count: 1 }, 7, 1500, 400)).toBe(1);
  });
});
