import { describe, expect, it } from "vitest";
import { oncePerEvent, pressOnBond, pressNumber, pressOnEmpty } from "./clickCount";

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

describe("one press, one count", () => {
  it("meets each event once, however many of an atom's meshes it hits", () => {
    const first = oncePerEvent();
    const press = {};
    expect(first(press)).toBe(true);
    // (the label's letters, hit by the same press: not met again)
    expect(first(press)).toBe(false);
    expect(first({})).toBe(true);
    // (an event the test makes up without one: always new)
    expect(first(undefined)).toBe(true);
    // (another handler's test keeps its own)
    expect(oncePerEvent()(press)).toBe(true);
  });

  it("counts a double-click's second press as the second, though it hits the disc and the letters both", () => {
    const first = oncePerEvent();
    let last = { id: null as number | null, t: -Infinity, count: 0 };
    const counts: number[] = [];
    // (the renderer calls the handler for each object hit: twice a press where Pt's letters lie over its disc)
    const handle = (event: object, t: number) => {
      if (!first(event)) return;
      const count = pressNumber(last, 7, t, 400);
      counts.push(count);
      last = { id: 7, t, count };
    };
    const one = {};
    const two = {};
    handle(one, 0);
    handle(one, 0);
    handle(two, 150);
    handle(two, 150);
    expect(counts).toEqual([1, 2]);
  });
});
